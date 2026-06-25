import { type FormEvent, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { useAppDispatch, useAppSelector } from '@/app/providers/store'
import { authApi } from '@/features/auth/api/auth-api'
import {
  type FullTournament,
  type RoundPromptContent,
  type TournamentParticipant,
  type TournamentVoteValue,
  useGetFullTournamentQuery,
  useGetTournamentQuery,
  useJoinTournamentMutation,
  useLeaveTournamentMutation,
  useStartTournamentMutation,
  useUpsertRoundSubmissionMutation,
  useUpsertRoundVoteMutation,
} from '@/features/auth/api/tournaments-api'
import { useLiveTournamentRecovery } from '@/features/tournaments/live/live-tournament-recovery-context'
import type { TournamentRealtimeEvent } from '@/features/tournaments/realtime/tournament-realtime'
import type { TournamentConnectionStatus } from '@/features/tournaments/realtime/use-tournament-realtime'
import { useTournamentRealtime } from '@/features/tournaments/realtime/use-tournament-realtime'

interface ParticipantEventPayload {
  tournamentId: string
  userId: string
  username?: string
  occurredAt: string
}

interface PresenceUpdatedPayload {
  tournamentId: string
  activeCount: number
  occurredAt: string
}

interface SubmissionProgress {
  roundId: string
  submittedCount: number
  totalActiveParticipants: number
}

interface TournamentRoundViewState {
  createdRound: FullTournament['currentRound']
  phaseOverride: {
    roundId: string
    phase: 'VOTING'
    submissionClosedAt: string
  } | null
  progress: SubmissionProgress | null
}

interface TournamentParticipantViewState {
  baseKey: string
  joinedParticipants: TournamentParticipant[]
  leftUserIds: string[]
}

type TournamentRoundViewAction =
  | {
      type: 'roundCreated'
      round: NonNullable<FullTournament['currentRound']>
      totalActiveParticipants: number
    }
  | { type: 'progressUpdated'; progress: SubmissionProgress }
  | {
      type: 'phaseChanged'
      roundId: string
      phase: 'VOTING'
      submissionClosedAt: string
    }

type TournamentParticipantViewAction =
  | {
      type: 'participantJoined'
      baseKey: string
      participant: TournamentParticipant
    }
  | { type: 'participantLeft'; baseKey: string; userId: string }

const initialTournamentRoundViewState: TournamentRoundViewState = {
  createdRound: null,
  phaseOverride: null,
  progress: null,
}

const initialTournamentParticipantViewState: TournamentParticipantViewState = {
  baseKey: '',
  joinedParticipants: [],
  leftUserIds: [],
}

interface RoundCreatedPayload {
  tournamentId: string
  roundId: string
  roundNumber: number
  phase: 'SUBMISSION'
  prompt: {
    key: string
    type: string
    content: RoundPromptContent
  }
  submissionDeadline: string
}

interface RoundProgressPayload {
  tournamentId: string
  roundId: string
  phase: 'SUBMISSION'
  submittedCount: number
  totalActiveParticipants: number
}

interface RoundPhaseChangedPayload {
  tournamentId: string
  roundId: string
  roundNumber: number
  currentPhase: 'VOTING'
  occurredAt?: string
}

interface VotingSubmissionRevealedPayload {
  tournamentId: string
  roundId: string
  submission: {
    id: string
    authorId: string
    content: string
    submittedAt: string
  }
  revealIndex: number
  totalSubmissions: number
  votingDeadline: string
  occurredAt: string
}

interface VoteProgressUpdatedPayload {
  tournamentId: string
  roundId: string
  submissionId: string
  votedCount: number
  totalEligibleActiveVoters: number
  occurredAt: string
}

interface VoteFinalizedPayload {
  tournamentId: string
  roundId: string
  submissionId: string
  likeCount: number
  dislikeCount: number
  occurredAt: string
}

interface RoundCompletedPayload {
  tournamentId: string
  roundId: string
  roundNumber: number
  rankings: RoundRanking[]
  leaderboard: LeaderboardEntry[]
  nextRoundNumber: number | null
  isLastRound: boolean
  occurredAt: string
}

interface RoundRanking {
  submissionId: string
  authorId: string
  likeCount: number
  dislikeCount: number
  score: number
}

interface LeaderboardEntry {
  userId: string
  cumulativeScore: number
  rank: number
}

interface TournamentFinishedPayload {
  tournamentId: string
  status: 'COMPLETED'
  overallWinnerId: string | null
  finalLeaderboard: LeaderboardEntry[]
  occurredAt: string
}

interface SequentialVotingState {
  currentReveal: VotingSubmissionRevealedPayload | null
  finalizedResult: VoteFinalizedPayload | null
  progress: VoteProgressUpdatedPayload | null
  savedVote: TournamentVoteValue | null
  status: 'waiting' | 'open' | 'finalized' | 'complete'
}

type SequentialVotingAction =
  | { type: 'event'; event: TournamentRealtimeEvent; roundId: string }
  | { type: 'voteSaved'; submissionId: string; value: TournamentVoteValue }

const initialSequentialVotingState: SequentialVotingState = {
  currentReveal: null,
  finalizedResult: null,
  progress: null,
  savedVote: null,
  status: 'waiting',
}

const emptyParticipants: TournamentParticipant[] = []

function getParticipantDisplayName(participant: TournamentParticipant | undefined) {
  const username = participant?.username?.trim()

  if (username) {
    return username
  }

  return participant?.userId ?? 'Unknown participant'
}

const realtimeStatusCopy: Record<
  TournamentConnectionStatus,
  { label: string; tone: string; title: string; description: string }
> = {
  connected: {
    label: 'Connected',
    tone: 'connected',
    title: 'Live room connected',
    description: 'You are subscribed to realtime tournament updates.',
  },
  connecting: {
    label: 'Reconnecting',
    tone: 'connecting',
    title: 'Trying to reconnect',
    description: 'The client is restoring the socket connection.',
  },
  disconnected: {
    label: 'Disconnected',
    tone: 'disconnected',
    title: 'Connection lost',
    description: 'Realtime updates are paused until the socket reconnects.',
  },
  idle: {
    label: 'Waiting',
    tone: 'idle',
    title: 'Realtime is preparing',
    description: 'The tournament room subscription has not started yet.',
  },
  recovering: {
    label: 'Recovering',
    tone: 'recovering',
    title: 'Reconnected, restoring state',
    description: 'The room is joined again and tournament state is being refreshed.',
  },
}

function TournamentRealtimeBadge({
  connectionStatus,
}: {
  connectionStatus: TournamentConnectionStatus
}) {
  const status = realtimeStatusCopy[connectionStatus]

  return (
    <div
      className={`tournament-realtime-badge tournament-realtime-badge-${status.tone}`}
      aria-live="polite"
    >
      <span
        className="tournament-realtime-panel-badge"
        data-testid="tournament-realtime-status"
      >
        <span className="tournament-realtime-panel-dot" />
        {status.label}
      </span>
      <span className="tournament-realtime-badge-copy">{status.title}</span>
    </div>
  )
}

function getApiErrorMessage(
  error: unknown,
  fallback = 'The request failed. Please try again.',
) {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data = (error as { data?: { message?: string[] | string } }).data

    if (Array.isArray(data?.message) && data.message.length > 0) {
      return data.message[0] ?? fallback
    }

    if (typeof data?.message === 'string') {
      return data.message
    }
  }

  return fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function tournamentRoundViewReducer(
  state: TournamentRoundViewState,
  action: TournamentRoundViewAction,
): TournamentRoundViewState {
  switch (action.type) {
    case 'roundCreated':
      return {
        createdRound: action.round,
        phaseOverride: null,
        progress: {
          roundId: action.round.id,
          submittedCount: 0,
          totalActiveParticipants: action.totalActiveParticipants,
        },
      }
    case 'progressUpdated':
      return {
        ...state,
        progress: action.progress,
      }
    case 'phaseChanged':
      return {
        ...state,
        phaseOverride: {
          roundId: action.roundId,
          phase: action.phase,
          submissionClosedAt: action.submissionClosedAt,
        },
      }
  }
}

function tournamentParticipantViewReducer(
  state: TournamentParticipantViewState,
  action: TournamentParticipantViewAction,
): TournamentParticipantViewState {
  const nextState =
    state.baseKey === action.baseKey
      ? state
      : {
          baseKey: action.baseKey,
          joinedParticipants: [],
          leftUserIds: [],
        }

  switch (action.type) {
    case 'participantJoined': {
      const joinedParticipants = nextState.joinedParticipants.some(
        (participant) => participant.userId === action.participant.userId,
      )
        ? nextState.joinedParticipants.map((participant) =>
            participant.userId === action.participant.userId
              ? { ...participant, ...action.participant }
              : participant,
          )
        : [...nextState.joinedParticipants, action.participant]

      return {
        baseKey: action.baseKey,
        joinedParticipants,
        leftUserIds: nextState.leftUserIds.filter(
          (userId) => userId !== action.participant.userId,
        ),
      }
    }

    case 'participantLeft':
      return {
        baseKey: action.baseKey,
        joinedParticipants: nextState.joinedParticipants.filter(
          (participant) => participant.userId !== action.userId,
        ),
        leftUserIds: nextState.leftUserIds.includes(action.userId)
          ? nextState.leftUserIds
          : [...nextState.leftUserIds, action.userId],
      }
  }
}

function sequentialVotingReducer(
  state: SequentialVotingState,
  action: SequentialVotingAction,
): SequentialVotingState {
  if (action.type === 'voteSaved') {
    if (state.currentReveal?.submission.id !== action.submissionId) {
      return state
    }

    return {
      ...state,
      savedVote: action.value,
    }
  }

  const { event, roundId } = action

  if (event.name === 'voting:submission_revealed') {
    const payload = event.payload

    if (!isVotingSubmissionRevealedPayload(payload) || payload.roundId !== roundId) {
      return state
    }

    return {
      currentReveal: payload,
      finalizedResult: null,
      progress: null,
      savedVote: null,
      status: 'open',
    }
  }

  if (event.name === 'vote:progress_updated') {
    const payload = event.payload

    if (
      !isVoteProgressUpdatedPayload(payload) ||
      payload.roundId !== roundId ||
      payload.submissionId !== state.currentReveal?.submission.id
    ) {
      return state
    }

    return {
      ...state,
      progress: payload,
    }
  }

  if (event.name === 'vote:finalized') {
    const payload = event.payload

    if (
      !isVoteFinalizedPayload(payload) ||
      payload.roundId !== roundId ||
      payload.submissionId !== state.currentReveal?.submission.id
    ) {
      return state
    }

    return {
      ...state,
      finalizedResult: payload,
      status: 'finalized',
    }
  }

  if (event.name === 'round:completed') {
    const payload = event.payload

    if (!isRoundCompletionSignal(payload) || payload.roundId !== roundId) {
      return state
    }

    return {
      ...state,
      currentReveal: null,
      status: 'complete',
    }
  }

  return state
}

function isRoundCompletionSignal(
  payload: unknown,
): payload is Pick<RoundCompletedPayload, 'occurredAt' | 'roundId' | 'tournamentId'> {
  return (
    isRecord(payload) &&
    typeof payload.tournamentId === 'string' &&
    typeof payload.roundId === 'string' &&
    typeof payload.occurredAt === 'string'
  )
}

function isRoundCreatedPayload(payload: unknown): payload is RoundCreatedPayload {
  return (
    isRecord(payload) &&
    typeof payload.tournamentId === 'string' &&
    typeof payload.roundId === 'string' &&
    typeof payload.roundNumber === 'number' &&
    payload.phase === 'SUBMISSION' &&
    isRecord(payload.prompt) &&
    typeof payload.prompt.key === 'string' &&
    typeof payload.prompt.type === 'string' &&
    isRoundPromptContent(payload.prompt.content) &&
    typeof payload.submissionDeadline === 'string'
  )
}

function isRoundPromptContent(content: unknown): content is RoundPromptContent {
  return (
    typeof content === 'string' ||
    (isRecord(content) &&
      typeof content.en === 'string' &&
      typeof content.ru === 'string')
  )
}

function isRoundProgressPayload(payload: unknown): payload is RoundProgressPayload {
  return (
    isRecord(payload) &&
    typeof payload.tournamentId === 'string' &&
    typeof payload.roundId === 'string' &&
    payload.phase === 'SUBMISSION' &&
    typeof payload.submittedCount === 'number' &&
    typeof payload.totalActiveParticipants === 'number'
  )
}

function isRoundPhaseChangedPayload(
  payload: unknown,
): payload is RoundPhaseChangedPayload {
  return (
    isRecord(payload) &&
    typeof payload.tournamentId === 'string' &&
    typeof payload.roundId === 'string' &&
    typeof payload.roundNumber === 'number' &&
    payload.currentPhase === 'VOTING'
  )
}

function isVotingSubmissionRevealedPayload(
  payload: unknown,
): payload is VotingSubmissionRevealedPayload {
  return (
    isRecord(payload) &&
    typeof payload.tournamentId === 'string' &&
    typeof payload.roundId === 'string' &&
    isRecord(payload.submission) &&
    typeof payload.submission.id === 'string' &&
    typeof payload.submission.authorId === 'string' &&
    typeof payload.submission.content === 'string' &&
    typeof payload.submission.submittedAt === 'string' &&
    typeof payload.revealIndex === 'number' &&
    typeof payload.totalSubmissions === 'number' &&
    typeof payload.votingDeadline === 'string' &&
    typeof payload.occurredAt === 'string'
  )
}

function isVoteProgressUpdatedPayload(
  payload: unknown,
): payload is VoteProgressUpdatedPayload {
  return (
    isRecord(payload) &&
    typeof payload.tournamentId === 'string' &&
    typeof payload.roundId === 'string' &&
    typeof payload.submissionId === 'string' &&
    typeof payload.votedCount === 'number' &&
    typeof payload.totalEligibleActiveVoters === 'number' &&
    typeof payload.occurredAt === 'string'
  )
}

function isVoteFinalizedPayload(payload: unknown): payload is VoteFinalizedPayload {
  return (
    isRecord(payload) &&
    typeof payload.tournamentId === 'string' &&
    typeof payload.roundId === 'string' &&
    typeof payload.submissionId === 'string' &&
    typeof payload.likeCount === 'number' &&
    typeof payload.dislikeCount === 'number' &&
    typeof payload.occurredAt === 'string'
  )
}

function isRoundCompletedPayload(payload: unknown): payload is RoundCompletedPayload {
  return (
    isRecord(payload) &&
    typeof payload.tournamentId === 'string' &&
    typeof payload.roundId === 'string' &&
    typeof payload.roundNumber === 'number' &&
    Array.isArray(payload.rankings) &&
    payload.rankings.every(isRoundRanking) &&
    Array.isArray(payload.leaderboard) &&
    payload.leaderboard.every(isLeaderboardEntry) &&
    (typeof payload.nextRoundNumber === 'number' || payload.nextRoundNumber === null) &&
    typeof payload.isLastRound === 'boolean' &&
    typeof payload.occurredAt === 'string'
  )
}

function isRoundRanking(value: unknown): value is RoundRanking {
  return (
    isRecord(value) &&
    typeof value.submissionId === 'string' &&
    typeof value.authorId === 'string' &&
    typeof value.likeCount === 'number' &&
    typeof value.dislikeCount === 'number' &&
    typeof value.score === 'number'
  )
}

function isLeaderboardEntry(value: unknown): value is LeaderboardEntry {
  return (
    isRecord(value) &&
    typeof value.userId === 'string' &&
    typeof value.cumulativeScore === 'number' &&
    typeof value.rank === 'number'
  )
}

function isTournamentFinishedPayload(
  payload: unknown,
): payload is TournamentFinishedPayload {
  return (
    isRecord(payload) &&
    typeof payload.tournamentId === 'string' &&
    payload.status === 'COMPLETED' &&
    (typeof payload.overallWinnerId === 'string' || payload.overallWinnerId === null) &&
    Array.isArray(payload.finalLeaderboard) &&
    payload.finalLeaderboard.every(isLeaderboardEntry) &&
    typeof payload.occurredAt === 'string'
  )
}

function isParticipantEventPayload(payload: unknown): payload is ParticipantEventPayload {
  return (
    isRecord(payload) &&
    typeof payload.tournamentId === 'string' &&
    typeof payload.userId === 'string' &&
    (!('username' in payload) || typeof payload.username === 'string') &&
    typeof payload.occurredAt === 'string'
  )
}

function isPresenceUpdatedPayload(payload: unknown): payload is PresenceUpdatedPayload {
  return (
    isRecord(payload) &&
    typeof payload.tournamentId === 'string' &&
    typeof payload.activeCount === 'number' &&
    typeof payload.occurredAt === 'string'
  )
}

function getPromptText(content: RoundPromptContent) {
  return typeof content === 'string' ? content : content.en
}

function formatPoints(points: number, showPositiveSign = false) {
  const sign = showPositiveSign && points > 0 ? '+' : ''
  return `${sign}${points} ${Math.abs(points) === 1 ? 'point' : 'points'}`
}

function formatDeadline(deadline: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(deadline))
}

function getRemainingSeconds(deadline: string) {
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000))
}

function useRemainingSeconds(deadline: string | null) {
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    deadline ? getRemainingSeconds(deadline) : 0,
  )

  useEffect(() => {
    if (!deadline) {
      return
    }

    const intervalId = window.setInterval(() => {
      setRemainingSeconds(getRemainingSeconds(deadline))
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [deadline])

  return remainingSeconds
}

function TournamentRoundPhasePanel({
  currentUserId,
  tournament,
  lastEvent,
  recentEvents,
}: {
  currentUserId: string | undefined
  tournament: FullTournament
  lastEvent: TournamentRealtimeEvent | null
  recentEvents: TournamentRealtimeEvent[]
}) {
  const [viewState, dispatch] = useReducer(
    tournamentRoundViewReducer,
    initialTournamentRoundViewState,
  )

  useEffect(() => {
    if (!lastEvent) {
      return
    }

    if (lastEvent.name === 'round:created') {
      const payload = lastEvent.payload

      if (isRoundCreatedPayload(payload) && payload.tournamentId === tournament.id) {
        dispatch({
          type: 'roundCreated',
          round: {
            id: payload.roundId,
            number: payload.roundNumber,
            phase: payload.phase,
            prompt: payload.prompt,
            submissionDeadline: payload.submissionDeadline,
            submissionClosedAt: null,
            votingDeadline: null,
          },
          totalActiveParticipants: tournament.participants.length,
        })
      }

      return
    }

    if (lastEvent.name === 'round:progress_updated') {
      const payload = lastEvent.payload

      if (isRoundProgressPayload(payload) && payload.tournamentId === tournament.id) {
        dispatch({
          type: 'progressUpdated',
          progress: {
            roundId: payload.roundId,
            submittedCount: payload.submittedCount,
            totalActiveParticipants: payload.totalActiveParticipants,
          },
        })
      }

      return
    }

    if (lastEvent.name === 'round:phase_changed') {
      const payload = lastEvent.payload

      if (isRoundPhaseChangedPayload(payload) && payload.tournamentId === tournament.id) {
        dispatch({
          type: 'phaseChanged',
          roundId: payload.roundId,
          phase: payload.currentPhase,
          submissionClosedAt: payload.occurredAt ?? new Date().toISOString(),
        })
      }
    }

    if (lastEvent.name === 'voting:submission_revealed') {
      const payload = lastEvent.payload

      if (
        isVotingSubmissionRevealedPayload(payload) &&
        payload.tournamentId === tournament.id
      ) {
        dispatch({
          type: 'phaseChanged',
          roundId: payload.roundId,
          phase: 'VOTING',
          submissionClosedAt: new Date().toISOString(),
        })
      }
    }
  }, [lastEvent, tournament.id, tournament.participants.length])

  let currentRound = viewState.createdRound ?? tournament.currentRound
  const latestVotingReveal = [...recentEvents].reverse().find((event) => {
    return (
      event.name === 'voting:submission_revealed' &&
      isVotingSubmissionRevealedPayload(event.payload) &&
      event.payload.tournamentId === tournament.id &&
      event.payload.roundId === currentRound?.id
    )
  })

  if (currentRound && viewState.phaseOverride?.roundId === currentRound.id) {
    currentRound = {
      ...currentRound,
      phase: viewState.phaseOverride.phase,
      submissionClosedAt: viewState.phaseOverride.submissionClosedAt,
    }
  }

  if (
    currentRound &&
    latestVotingReveal &&
    isVotingSubmissionRevealedPayload(latestVotingReveal.payload)
  ) {
    currentRound = {
      ...currentRound,
      phase: 'VOTING',
      votingDeadline: latestVotingReveal.payload.votingDeadline,
    }
  }

  if (!currentRound) {
    return (
      <section className="tournament-phase-panel">
        <h3>Waiting for Round</h3>
        <p>The tournament has not started an active round yet.</p>
      </section>
    )
  }

  if (currentRound.phase === 'SUBMISSION') {
    return (
      <SubmissionPhasePanel
        key={currentRound.id}
        participantCount={tournament.participants.length}
        progress={viewState.progress}
        round={currentRound}
      />
    )
  }

  return (
    <SequentialVotingPanel
      currentUserId={currentUserId}
      recentEvents={recentEvents}
      round={currentRound}
    />
  )
}

function SequentialVotingPanel({
  currentUserId,
  recentEvents,
  round,
}: {
  currentUserId: string | undefined
  recentEvents: TournamentRealtimeEvent[]
  round: NonNullable<FullTournament['currentRound']>
}) {
  const [viewState, dispatch] = useReducer(
    sequentialVotingReducer,
    initialSequentialVotingState,
  )
  const processedSequenceRef = useRef(0)
  const [upsertVote, { isLoading, error }] = useUpsertRoundVoteMutation()
  const remainingSeconds = useRemainingSeconds(
    viewState.currentReveal?.votingDeadline ?? round.votingDeadline,
  )

  useEffect(() => {
    for (const event of recentEvents) {
      if (event.sequence <= processedSequenceRef.current) {
        continue
      }

      dispatch({ type: 'event', event, roundId: round.id })
      processedSequenceRef.current = event.sequence
    }
  }, [recentEvents, round.id])

  const reveal = viewState.currentReveal

  if (viewState.status === 'complete') {
    return (
      <section className="tournament-phase-panel voting-panel" aria-live="polite">
        <p className="tournament-phase-eyebrow">Voting complete</p>
        <h3>Round {round.number} Voting Finished</h3>
        <p>All revealed submissions have been finalized. Round results are next.</p>
      </section>
    )
  }

  if (!reveal) {
    return (
      <section className="tournament-phase-panel voting-panel" aria-live="polite">
        <p className="tournament-phase-eyebrow">Active round</p>
        <h3>Round {round.number} Voting</h3>
        <p>Waiting for the next submission to be revealed.</p>
      </section>
    )
  }

  const isOwnSubmission = reveal.submission.authorId === currentUserId
  const votedCount = viewState.progress?.votedCount ?? 0
  const totalEligibleVoters = viewState.progress?.totalEligibleActiveVoters ?? 0
  const voteProgressPercent =
    totalEligibleVoters > 0
      ? Math.min(100, Math.round((votedCount / totalEligibleVoters) * 100))
      : 0
  const votingClosed =
    viewState.status !== 'open' || remainingSeconds <= 0 || isOwnSubmission

  const handleVote = async (value: TournamentVoteValue) => {
    try {
      await upsertVote({
        roundId: round.id,
        submissionId: reveal.submission.id,
        value,
      }).unwrap()
      dispatch({
        type: 'voteSaved',
        submissionId: reveal.submission.id,
        value,
      })
    } catch {
      // RTK Query exposes the error state rendered below.
    }
  }

  return (
    <section
      className="tournament-phase-panel voting-panel"
      aria-live="polite"
      data-testid="sequential-voting-panel"
    >
      <div className="tournament-phase-header">
        <div>
          <p className="tournament-phase-eyebrow">Sequential voting</p>
          <h3>Round {round.number} Voting</h3>
        </div>
        <span className="tournament-phase-badge" data-testid="voting-countdown">
          {remainingSeconds} seconds remaining
        </span>
      </div>

      <div className="voting-step-progress">
        <strong>
          Submission {reveal.revealIndex + 1} of {reveal.totalSubmissions}
        </strong>
        <span>One submission is revealed at a time.</span>
      </div>

      <article className="voting-submission" data-testid="revealed-submission">
        <p className="tournament-prompt-label">Revealed submission</p>
        <p>{reveal.submission.content}</p>
      </article>

      <div className="submission-progress" data-testid="vote-progress">
        <div className="submission-progress-copy">
          <strong>
            {viewState.progress
              ? `${votedCount} of ${totalEligibleVoters} active voters responded`
              : 'Waiting for active voter responses'}
          </strong>
          <span className="submission-progress-note">
            The author is excluded from eligible voters.
          </span>
        </div>
        <div
          className="submission-progress-track"
          role="progressbar"
          aria-label="Voting progress"
          aria-valuemin={0}
          aria-valuemax={totalEligibleVoters}
          aria-valuenow={votedCount}
        >
          <span
            className="submission-progress-fill"
            style={{ width: `${voteProgressPercent}%` }}
          />
        </div>
      </div>

      {isOwnSubmission ? (
        <p className="voting-self-note">
          This is your submission. Self-voting is disabled.
        </p>
      ) : null}

      {viewState.finalizedResult ? (
        <p className="voting-finalized" data-testid="vote-finalized-result">
          Finalized: {viewState.finalizedResult.likeCount} likes and{' '}
          {viewState.finalizedResult.dislikeCount} dislikes. Loading next submission...
        </p>
      ) : null}

      {viewState.savedVote ? (
        <p className="submission-saved">
          Your {viewState.savedVote === 'LIKE' ? 'like' : 'dislike'} was saved.
        </p>
      ) : null}

      {error ? <p className="form-error">{getApiErrorMessage(error)}</p> : null}

      <div className="voting-actions">
        <button
          className={`vote-button vote-button-like${viewState.savedVote === 'LIKE' ? ' is-selected' : ''}`}
          disabled={votingClosed || isLoading}
          type="button"
          onClick={() => {
            void handleVote('LIKE')
          }}
        >
          {isLoading ? 'Saving...' : 'Like'}
        </button>
        <button
          className={`vote-button vote-button-dislike${viewState.savedVote === 'DISLIKE' ? ' is-selected' : ''}`}
          disabled={votingClosed || isLoading}
          type="button"
          onClick={() => {
            void handleVote('DISLIKE')
          }}
        >
          {isLoading ? 'Saving...' : 'Dislike'}
        </button>
      </div>
    </section>
  )
}

function SubmissionPhasePanel({
  participantCount,
  progress,
  round,
}: {
  participantCount: number
  progress: SubmissionProgress | null
  round: NonNullable<FullTournament['currentRound']>
}) {
  const [content, setContent] = useState('')
  const [isSaved, setIsSaved] = useState(false)
  const [upsertSubmission, { isLoading, isError }] = useUpsertRoundSubmissionMutation()
  const remainingSeconds = useRemainingSeconds(round.submissionDeadline)
  const promptId = `round-prompt-${round.id}`
  const submissionId = `round-submission-${round.id}`
  const submittedCount = progress?.roundId === round.id ? progress.submittedCount : 0
  const totalParticipants =
    progress?.roundId === round.id ? progress.totalActiveParticipants : participantCount

  const progressPercent = useMemo(() => {
    if (totalParticipants <= 0) {
      return 0
    }

    return Math.min(100, Math.round((submittedCount / totalParticipants) * 100))
  }, [submittedCount, totalParticipants])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!content.trim()) {
      return
    }

    await upsertSubmission({
      roundId: round.id,
      content: content.trim(),
    }).unwrap()
    setIsSaved(true)
  }

  return (
    <section className="tournament-phase-panel" aria-live="polite">
      <div className="tournament-phase-header">
        <div>
          <p className="tournament-phase-eyebrow">Active round</p>
          <h3>Round {round.number} Submission</h3>
        </div>
        <span className="tournament-phase-badge" data-testid="submission-countdown">
          {remainingSeconds} seconds remaining
        </span>
      </div>

      <div className="tournament-prompt" data-testid="active-round-prompt">
        <p className="tournament-prompt-label">Phrase to continue</p>
        <p id={promptId}>{getPromptText(round.prompt.content)}</p>
        <span className="tournament-prompt-deadline">
          Deadline: {formatDeadline(round.submissionDeadline)}
        </span>
      </div>

      <div className="submission-progress" data-testid="submission-progress">
        <div className="submission-progress-copy">
          <strong>
            {submittedCount} of {totalParticipants} submitted
          </strong>
          <span className="submission-progress-note">
            Voting starts after all responses.
            <span className="sr-only">Submissions are hidden until voting starts.</span>
          </span>
        </div>
        <div
          className="submission-progress-track"
          role="progressbar"
          aria-label="Submission progress"
          aria-valuemin={0}
          aria-valuemax={totalParticipants}
          aria-valuenow={submittedCount}
        >
          <span
            className="submission-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <form
        className="submission-form"
        aria-describedby={promptId}
        data-round-id={round.id}
        data-testid="round-submission-form"
        onSubmit={(event) => {
          void handleSubmit(event)
        }}
      >
        <label htmlFor={submissionId}>Continue the phrase</label>
        <textarea
          className="submission-form-textarea"
          id={submissionId}
          maxLength={4000}
          value={content}
          onChange={(event) => {
            setContent(event.target.value)
            setIsSaved(false)
          }}
          placeholder="Write what comes next..."
        />

        {isError ? (
          <p className="form-error">Could not save submission. Try again.</p>
        ) : null}
        {isSaved ? <p className="submission-saved">Submission saved.</p> : null}

        <button className="create-button" type="submit" disabled={isLoading}>
          {isLoading ? 'Submitting...' : 'Submit Response'}
        </button>
      </form>
    </section>
  )
}

function LiveTournamentResults({
  currentUserId,
  finished,
  participants,
  roundCompleted,
}: {
  currentUserId: string | undefined
  finished: TournamentFinishedPayload | null
  participants: TournamentParticipant[]
  roundCompleted: RoundCompletedPayload | null
}) {
  const leaderboard = finished?.finalLeaderboard ?? roundCompleted?.leaderboard ?? []
  const participantByUserId = useMemo(
    () => new Map(participants.map((participant) => [participant.userId, participant])),
    [participants],
  )
  const getUserDisplayName = (userId: string) =>
    getParticipantDisplayName(
      participantByUserId.get(userId) ?? { userId, cumulativeScore: 0 },
    )

  if (!roundCompleted && !finished) {
    return null
  }

  return (
    <section className="live-results-panel" aria-live="polite">
      {roundCompleted ? (
        <div className="round-results">
          <div className="live-results-header">
            <div>
              <p className="tournament-phase-eyebrow">Latest completed round</p>
              <h3>Round {roundCompleted.roundNumber} Results</h3>
            </div>
            <span className="tournament-phase-badge">
              {roundCompleted.isLastRound
                ? 'Final round'
                : `Round ${roundCompleted.nextRoundNumber} next`}
            </span>
          </div>

          <div className="round-results-list">
            {roundCompleted.rankings.map((ranking, index) => (
              <article
                className="round-result-row"
                data-testid={`round-result-${ranking.submissionId}`}
                key={ranking.submissionId}
              >
                <span className="result-rank">#{index + 1}</span>
                <div className="result-identity">
                  <strong>
                    {getUserDisplayName(ranking.authorId)}
                    {ranking.authorId === currentUserId ? ' · You' : ''}
                  </strong>
                </div>
                <div className="result-votes">
                  <span>{ranking.likeCount} likes</span>
                  <span>{ranking.dislikeCount} dislikes</span>
                </div>
                <strong className="result-score">
                  {formatPoints(ranking.score, true)}
                </strong>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="live-leaderboard" data-testid="live-leaderboard">
        <div className="live-results-header">
          <div>
            <p className="tournament-phase-eyebrow">
              {finished ? 'Final standings' : 'Cumulative standings'}
            </p>
            <h3>Leaderboard</h3>
          </div>
        </div>

        <ol className="leaderboard-list">
          {leaderboard.map((entry) => (
            <li className="leaderboard-row" key={entry.userId}>
              <span className="leaderboard-rank">{entry.rank}</span>
              <strong>
                {getUserDisplayName(entry.userId)}
                {entry.userId === currentUserId ? ' · You' : ''}
              </strong>
              <span>{formatPoints(entry.cumulativeScore)}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function TournamentFinishedPanel({
  currentUserId,
  finished,
  participants,
}: {
  currentUserId: string | undefined
  finished: TournamentFinishedPayload
  participants: TournamentParticipant[]
}) {
  const winner = participants.find(
    (participant) => participant.userId === finished.overallWinnerId,
  )

  return (
    <section
      className="tournament-phase-panel tournament-finished-panel"
      aria-live="polite"
    >
      <p className="tournament-phase-eyebrow">All rounds completed</p>
      <h3>Tournament Finished</h3>
      {finished.overallWinnerId ? (
        <p data-testid="tournament-winner">
          Winner: <strong>{getParticipantDisplayName(winner)}</strong>
          {finished.overallWinnerId === currentUserId ? ' · You' : ''}
        </p>
      ) : (
        <p>No winner was determined.</p>
      )}
      <p>The final standings are available below.</p>
    </section>
  )
}

function ParticipantsSection({
  currentUserId,
  ownerId,
  participants,
}: {
  currentUserId: string | undefined
  ownerId: string
  participants: TournamentParticipant[]
}) {
  return (
    <section className="participants-section">
      <h3>Participants</h3>

      {participants.length === 0 ? <p>No participants yet.</p> : null}

      {participants.map((participant) => (
        <div
          className="participant-row"
          data-testid={`participant-${participant.userId}`}
          key={participant.userId}
        >
          <p>
            <strong>
              {getParticipantDisplayName(participant)}
              {participant.userId === currentUserId ? ' · You' : ''}
            </strong>
          </p>

          <p>{participant.userId === ownerId ? 'Owner' : 'Participant'}</p>

          <span>Score: {participant.cumulativeScore}</span>
        </div>
      ))}
    </section>
  )
}

function TournamentUnavailableState({ onGoHome }: { onGoHome: () => void }) {
  return (
    <main className="tournament-page tournament-page-unavailable">
      <section className="tournament-unavailable-card">
        <p className="eyebrow">Tournament access</p>
        <h1>Tournament not found.</h1>
        <p>
          This tournament is no longer available to join, or your account does not have
          access to the active match.
        </p>
        <button className="create-button" type="button" onClick={onGoHome}>
          Go To Home Page
        </button>
      </section>
    </main>
  )
}

export function TournamentPage() {
  const { tournamentId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const currentUser = useAppSelector((state) => state.auth.user)
  const { activeTournament: recoveredTournament } = useLiveTournamentRecovery()
  const [hasJoined, setHasJoined] = useState(false)
  const [participantViewState, dispatchParticipantView] = useReducer(
    tournamentParticipantViewReducer,
    initialTournamentParticipantViewState,
  )
  const [activeCount, setActiveCount] = useReducer(
    (_current: number, nextActiveCount: number) => nextActiveCount,
    0,
  )

  const {
    data: draftTournament,
    isLoading: isDraftLoading,
    isError: isDraftError,
    refetch: refetchDraftTournament,
  } = useGetTournamentQuery(tournamentId ?? '', {
    skip: !tournamentId,
  })

  const draftParticipants = draftTournament?.participants ?? emptyParticipants
  const isOwner = currentUser?.id === draftTournament?.ownerId
  const isDraftParticipant = draftParticipants.some(
    (participant) => participant.userId === currentUser?.id,
  )
  const canViewFullTournament = isOwner || isDraftParticipant || hasJoined

  const {
    data: fullTournament,
    isLoading: isFullLoading,
    isError: isFullError,
    refetch: refetchFullTournament,
  } = useGetFullTournamentQuery(tournamentId ?? '', {
    skip: !tournamentId || (!canViewFullTournament && !isDraftError),
  })

  const tournament = fullTournament ?? draftTournament
  const baseParticipants = fullTournament?.participants ?? draftParticipants
  const baseParticipantKey = useMemo(
    () =>
      baseParticipants
        .map((participant) => `${participant.userId}:${participant.username ?? ''}`)
        .join('|'),
    [baseParticipants],
  )
  const displayedParticipants = useMemo(() => {
    if (participantViewState.baseKey !== baseParticipantKey) {
      return baseParticipants
    }

    const leftUserIds = new Set(participantViewState.leftUserIds)
    const displayed = baseParticipants.filter(
      (participant) => !leftUserIds.has(participant.userId),
    )
    const displayedUserIds = new Set(displayed.map((participant) => participant.userId))

    for (const participant of participantViewState.joinedParticipants) {
      if (!displayedUserIds.has(participant.userId)) {
        displayed.push(participant)
      }
    }

    return displayed
  }, [baseParticipantKey, baseParticipants, participantViewState])

  const isParticipant = displayedParticipants.some(
    (participant) => participant.userId === currentUser?.id,
  )
  const canAccessRealtimeRoom = Boolean(tournamentId && (isOwner || isParticipant))

  const { connectionStatus, lastEvent, recentEvents } = useTournamentRealtime(
    canAccessRealtimeRoom ? tournamentId : undefined,
  )

  const latestRoundCompleted = useMemo(() => {
    const event = [...recentEvents].reverse().find((candidate) => {
      return (
        candidate.name === 'round:completed' &&
        isRoundCompletedPayload(candidate.payload) &&
        candidate.payload.tournamentId === tournamentId
      )
    })

    return event && isRoundCompletedPayload(event.payload) ? event.payload : null
  }, [recentEvents, tournamentId])

  const tournamentFinished = useMemo(() => {
    const event = [...recentEvents].reverse().find((candidate) => {
      return (
        candidate.name === 'tournament:finished' &&
        isTournamentFinishedPayload(candidate.payload) &&
        candidate.payload.tournamentId === tournamentId
      )
    })

    return event && isTournamentFinishedPayload(event.payload) ? event.payload : null
  }, [recentEvents, tournamentId])

  useEffect(() => {
    if (
      !tournamentFinished ||
      !currentUser?.id ||
      tournamentFinished.tournamentId !== recoveredTournament?.id
    ) {
      return
    }

    dispatch(
      authApi.util.updateQueryData('getLiveTournament', currentUser.id, (current) => {
        current.hasActiveTournament = false
        current.tournament = null
      }),
    )
  }, [currentUser?.id, dispatch, recoveredTournament?.id, tournamentFinished])

  const realtimeLeaderboard =
    tournamentFinished?.finalLeaderboard ?? latestRoundCompleted?.leaderboard
  const scoredParticipants = useMemo(() => {
    if (!realtimeLeaderboard) {
      return displayedParticipants
    }

    const scoresByUserId = new Map(
      realtimeLeaderboard.map((entry) => [entry.userId, entry.cumulativeScore]),
    )

    return displayedParticipants.map((participant) => ({
      ...participant,
      cumulativeScore:
        scoresByUserId.get(participant.userId) ?? participant.cumulativeScore,
    }))
  }, [displayedParticipants, realtimeLeaderboard])

  const [joinTournament, { isLoading: isJoining, error: joinError }] =
    useJoinTournamentMutation()

  const [leaveTournament, { isLoading: isLeaving, error: leaveError }] =
    useLeaveTournamentMutation()

  const [startTournament, { isLoading: isStarting, error: startError }] =
    useStartTournamentMutation()

  useEffect(() => {
    if (!lastEvent || !tournamentId) {
      return
    }

    if (lastEvent.name === 'tournament:participant_joined') {
      const payload = lastEvent.payload

      if (isParticipantEventPayload(payload) && payload.tournamentId === tournamentId) {
        dispatchParticipantView({
          type: 'participantJoined',
          baseKey: baseParticipantKey,
          participant: {
            userId: payload.userId,
            ...(payload.username ? { username: payload.username } : {}),
            cumulativeScore: 0,
          },
        })
      }

      return
    }

    if (lastEvent.name === 'tournament:participant_left') {
      const payload = lastEvent.payload

      if (isParticipantEventPayload(payload) && payload.tournamentId === tournamentId) {
        dispatchParticipantView({
          type: 'participantLeft',
          baseKey: baseParticipantKey,
          userId: payload.userId,
        })
      }

      return
    }

    if (lastEvent.name === 'tournament:presence_updated') {
      const payload = lastEvent.payload

      if (isPresenceUpdatedPayload(payload) && payload.tournamentId === tournamentId) {
        setActiveCount(payload.activeCount)
      }
    }
  }, [baseParticipantKey, lastEvent, tournamentId])

  if (isDraftLoading || isFullLoading) {
    return <p>Loading tournament...</p>
  }

  if (!tournament || !tournamentId || (isDraftError && isFullError)) {
    return (
      <TournamentUnavailableState
        onGoHome={() => {
          void navigate('/')
        }}
      />
    )
  }

  const activeTournament = tournament
  const displayedStatus = tournamentFinished?.status ?? tournament.status
  const canJoin = displayedStatus === 'DRAFT' && !isOwner && !isParticipant
  const canLeave = displayedStatus === 'DRAFT' && !isOwner && isParticipant
  const canStart = displayedStatus === 'DRAFT' && isOwner
  const isDraft = displayedStatus === 'DRAFT'
  const minimumParticipantsToStart = 4
  const hasEnoughParticipantsToStart =
    displayedParticipants.length >= minimumParticipantsToStart
  const hasLiveTournamentConflict = Boolean(
    recoveredTournament && recoveredTournament.id !== tournamentId,
  )

  const handleJoin = async () => {
    const inviteToken = searchParams.get('inviteToken') ?? draftTournament?.inviteToken
    const joinPayload = inviteToken ? { tournamentId, inviteToken } : { tournamentId }

    await joinTournament(joinPayload).unwrap()
    setHasJoined(true)
    if (currentUser?.id) {
      dispatchParticipantView({
        type: 'participantJoined',
        baseKey: baseParticipantKey,
        participant: {
          userId: currentUser.id,
          username: currentUser.username,
          cumulativeScore: 0,
        },
      })
    }
    await refetchDraftTournament()
  }

  const handleLeave = async () => {
    await leaveTournament(tournamentId).unwrap()
    setHasJoined(false)
    if (currentUser?.id) {
      dispatchParticipantView({
        type: 'participantLeft',
        baseKey: baseParticipantKey,
        userId: currentUser.id,
      })
    }
    await refetchDraftTournament()
  }

  const handleStart = async () => {
    try {
      await startTournament(tournamentId).unwrap()
      await Promise.all([refetchDraftTournament(), refetchFullTournament()])
    } catch {
      // RTK Query exposes the error state rendered below.
    }
  }

  return (
    <main className="tournament-page">
      <section className="tournament-layout">
        <header className="tournament-page-header">
          <div>
            <p className="eyebrow">Tournament Setup</p>
            <h2 className="sr-only">Tournament Created</h2>
            <h1>{activeTournament.title}</h1>
          </div>
          <div className="tournament-header-status">
            <span className="tournament-status-badge">{displayedStatus}</span>
            {fullTournament ? (
              <TournamentRealtimeBadge connectionStatus={connectionStatus} />
            ) : null}
          </div>
        </header>

        <div className="tournament-main-card">
          <div
            className={`tournament-workspace${fullTournament ? '' : ' tournament-workspace-sidebar-only'}`}
          >
            {fullTournament || isDraft ? (
              <section className="tournament-primary-column">
                {fullTournament ? (
                  tournamentFinished ? (
                    <TournamentFinishedPanel
                      currentUserId={currentUser?.id}
                      finished={tournamentFinished}
                      participants={scoredParticipants}
                    />
                  ) : (
                    <TournamentRoundPhasePanel
                      key={`${fullTournament.id}-${fullTournament.currentRound?.id ?? 'waiting'}`}
                      currentUserId={currentUser?.id}
                      tournament={fullTournament}
                      lastEvent={lastEvent}
                      recentEvents={recentEvents}
                    />
                  )
                ) : null}

                <LiveTournamentResults
                  currentUserId={currentUser?.id}
                  finished={tournamentFinished}
                  participants={scoredParticipants}
                  roundCompleted={latestRoundCompleted}
                />

                {isDraft ? (
                  <>
                    <ParticipantsSection
                      currentUserId={currentUser?.id}
                      ownerId={tournament.ownerId}
                      participants={scoredParticipants}
                    />

                    {canStart ? (
                      <section className="tournament-start-panel">
                        <div>
                          <h3 className="tournament-start-title">Ready to start?</h3>
                          <p className="tournament-start-copy">
                            {hasEnoughParticipantsToStart
                              ? 'All required players are here. Start Round 1 when you are ready.'
                              : `${displayedParticipants.length} of ${minimumParticipantsToStart} participants joined. The tournament needs at least ${minimumParticipantsToStart} players.`}
                          </p>
                        </div>
                        <button
                          className="create-button tournament-start-button"
                          data-testid="start-tournament-button"
                          disabled={isStarting || !hasEnoughParticipantsToStart}
                          onClick={() => {
                            void handleStart()
                          }}
                        >
                          {isStarting ? 'Starting...' : 'Start Tournament'}
                        </button>
                      </section>
                    ) : null}
                  </>
                ) : null}
              </section>
            ) : null}

            <aside className="tournament-sidebar">
              {joinError ? (
                <p className="form-error">{getApiErrorMessage(joinError)}</p>
              ) : null}

              {leaveError ? (
                <p className="form-error">{getApiErrorMessage(leaveError)}</p>
              ) : null}

              {startError ? (
                <p className="form-error">{getApiErrorMessage(startError)}</p>
              ) : null}

              <section
                className="tournament-details-grid"
                aria-label="Tournament details"
              >
                <p>
                  <strong>Status:</strong> <span>{displayedStatus}</span>
                </p>
                <p>
                  <strong>Visibility:</strong> <span>{tournament.visibility}</span>
                </p>
                <p>
                  <strong>Rounds:</strong> <span>{tournament.roundsCount}</span>
                </p>
                <p>
                  <strong>Submission duration:</strong>{' '}
                  <span>{tournament.submissionDurationSeconds} seconds</span>
                </p>
                <p>
                  <strong>Vote duration:</strong>{' '}
                  <span>{tournament.voteDurationSeconds} seconds</span>
                </p>
                <p>
                  <strong>Realtime:</strong>{' '}
                  <span>
                    {canAccessRealtimeRoom
                      ? realtimeStatusCopy[connectionStatus].label
                      : 'Waiting'}
                  </span>
                </p>
                <p>
                  <strong>Active users:</strong>{' '}
                  <span>{canAccessRealtimeRoom ? activeCount : 0}</span>
                </p>
                <p>
                  <strong>Participant count:</strong>{' '}
                  <span>{displayedParticipants.length}</span>
                </p>
              </section>

              <section className="tournament-description-block">
                <strong>Description</strong>
                <p>{activeTournament.description ?? 'No description'}</p>
              </section>

              <section className="tournament-description-block tournament-id-block">
                <strong>Tournament ID</strong>
                <p>{activeTournament.id}</p>
              </section>

              <section
                className="tournament-sidebar-actions"
                aria-label="Tournament actions"
              >
                {hasLiveTournamentConflict && canJoin ? (
                  <p className="live-tournament-conflict" role="alert">
                    You are already active in another tournament. Return to that match
                    before joining a new one.
                  </p>
                ) : null}

                {canJoin ? (
                  <button
                    className="create-button"
                    disabled={isJoining || hasLiveTournamentConflict}
                    onClick={() => {
                      void handleJoin()
                    }}
                  >
                    {isJoining ? 'Joining...' : 'Join Tournament'}
                  </button>
                ) : null}

                {canLeave ? (
                  <button
                    className="create-button tournament-danger-button"
                    disabled={isLeaving}
                    onClick={() => {
                      void handleLeave()
                    }}
                  >
                    {isLeaving ? 'Leaving...' : 'Leave Tournament'}
                  </button>
                ) : null}

                <button
                  className="create-button tournament-secondary-button"
                  onClick={() => {
                    void navigate('/')
                  }}
                >
                  Back to Dashboard
                </button>
              </section>

              {!isDraft ? (
                <ParticipantsSection
                  currentUserId={currentUser?.id}
                  ownerId={tournament.ownerId}
                  participants={scoredParticipants}
                />
              ) : null}

              {!isDraft && canStart ? (
                <section className="tournament-start-panel">
                  <div>
                    <h3 className="tournament-start-title">Ready to start?</h3>
                    <p className="tournament-start-copy">
                      {hasEnoughParticipantsToStart
                        ? 'All required players are here. Start Round 1 when you are ready.'
                        : `${displayedParticipants.length} of ${minimumParticipantsToStart} participants joined. The tournament needs at least ${minimumParticipantsToStart} players.`}
                    </p>
                  </div>
                  <button
                    className="create-button tournament-start-button"
                    data-testid="start-tournament-button"
                    disabled={isStarting || !hasEnoughParticipantsToStart}
                    onClick={() => {
                      void handleStart()
                    }}
                  >
                    {isStarting ? 'Starting...' : 'Start Tournament'}
                  </button>
                </section>
              ) : null}
            </aside>
          </div>
        </div>
      </section>
    </main>
  )
}
