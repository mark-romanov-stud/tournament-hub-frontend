import { type FormEvent, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAppSelector } from '@/app/providers/store'
import {
  type FullTournament,
  type RoundPromptContent,
  type TournamentParticipant,
  type TournamentVoteValue,
  useGetFullTournamentQuery,
  useGetTournamentQuery,
  useJoinTournamentMutation,
  useLeaveTournamentMutation,
  useUpsertRoundSubmissionMutation,
  useUpsertRoundVoteMutation,
} from '@/features/auth/api/tournaments-api'
import type { TournamentRealtimeEvent } from '@/features/tournaments/realtime/tournament-realtime'
import type { TournamentConnectionStatus } from '@/features/tournaments/realtime/use-tournament-realtime'
import { useTournamentRealtime } from '@/features/tournaments/realtime/use-tournament-realtime'

interface ParticipantEventPayload {
  tournamentId: string
  userId: string
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
  joinedUserIds: string[]
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
  | { type: 'participantJoined'; baseKey: string; userId: string }
  | { type: 'participantLeft'; baseKey: string; userId: string }

const initialTournamentRoundViewState: TournamentRoundViewState = {
  createdRound: null,
  phaseOverride: null,
  progress: null,
}

const initialTournamentParticipantViewState: TournamentParticipantViewState = {
  baseKey: '',
  joinedUserIds: [],
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

function TournamentRealtimePanel({
  connectionStatus,
  lastEvent,
  lastRecoveredAt,
}: {
  connectionStatus: TournamentConnectionStatus
  lastEvent: TournamentRealtimeEvent | null
  lastRecoveredAt: string | null
}) {
  const status = realtimeStatusCopy[connectionStatus]

  return (
    <section
      className={`tournament-realtime-panel tournament-realtime-panel-${status.tone}`}
      aria-live="polite"
    >
      <div className="tournament-realtime-panel-header">
        <div>
          <p className="tournament-realtime-panel-eyebrow">Realtime room</p>
          <h3>{status.title}</h3>
        </div>

        <span
          className="tournament-realtime-panel-badge"
          data-testid="tournament-realtime-status"
        >
          <span className="tournament-realtime-panel-dot" />
          {status.label}
        </span>
      </div>

      <p className="tournament-realtime-panel-copy">{status.description}</p>

      {lastRecoveredAt ? (
        <p
          className="tournament-realtime-panel-recovery"
          data-testid="tournament-recovery-note"
        >
          State recovered after reconnect at {lastRecoveredAt}
        </p>
      ) : null}

      {lastEvent ? (
        <p
          className="tournament-realtime-panel-event"
          data-testid="tournament-latest-event"
        >
          Latest event: <strong>{lastEvent.name}</strong>
        </p>
      ) : (
        <p className="tournament-realtime-panel-event">Waiting for first event…</p>
      )}
    </section>
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
          joinedUserIds: [],
          leftUserIds: [],
        }

  switch (action.type) {
    case 'participantJoined':
      return {
        baseKey: action.baseKey,
        joinedUserIds: nextState.joinedUserIds.includes(action.userId)
          ? nextState.joinedUserIds
          : [...nextState.joinedUserIds, action.userId],
        leftUserIds: nextState.leftUserIds.filter((userId) => userId !== action.userId),
      }

    case 'participantLeft':
      return {
        baseKey: action.baseKey,
        joinedUserIds: nextState.joinedUserIds.filter(
          (userId) => userId !== action.userId,
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
    typeof payload.submissionDeadline === 'string'
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

      <div className="tournament-prompt">
        <p className="tournament-prompt-label">Prompt</p>
        <p>{getPromptText(round.prompt.content)}</p>
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
            Submissions are hidden until voting starts.
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
        onSubmit={(event) => {
          void handleSubmit(event)
        }}
      >
        <label htmlFor="round-submission">Your submission</label>
        <textarea
          className="submission-form-textarea"
          id="round-submission"
          maxLength={4000}
          value={content}
          onChange={(event) => {
            setContent(event.target.value)
            setIsSaved(false)
          }}
          placeholder="Write your response before the timer ends."
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
  roundCompleted,
}: {
  currentUserId: string | undefined
  finished: TournamentFinishedPayload | null
  roundCompleted: RoundCompletedPayload | null
}) {
  const leaderboard = finished?.finalLeaderboard ?? roundCompleted?.leaderboard ?? []

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
                    {ranking.authorId}
                    {ranking.authorId === currentUserId ? ' · You' : ''}
                  </strong>
                  <span className="result-submission-meta">
                    Submission {ranking.submissionId}
                  </span>
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
                {entry.userId}
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
}: {
  currentUserId: string | undefined
  finished: TournamentFinishedPayload
}) {
  return (
    <section
      className="tournament-phase-panel tournament-finished-panel"
      aria-live="polite"
    >
      <p className="tournament-phase-eyebrow">All rounds completed</p>
      <h3>Tournament Finished</h3>
      {finished.overallWinnerId ? (
        <p data-testid="tournament-winner">
          Winner: <strong>{finished.overallWinnerId}</strong>
          {finished.overallWinnerId === currentUserId ? ' · You' : ''}
        </p>
      ) : (
        <p>No winner was determined.</p>
      )}
      <p>The final standings are available below.</p>
    </section>
  )
}

export function TournamentPage() {
  const { tournamentId } = useParams()
  const navigate = useNavigate()
  const currentUser = useAppSelector((state) => state.auth.user)
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
  } = useGetFullTournamentQuery(tournamentId ?? '', {
    skip: !tournamentId || (!canViewFullTournament && !isDraftError),
  })

  const tournament = fullTournament ?? draftTournament
  const baseParticipants = fullTournament?.participants ?? draftParticipants
  const baseParticipantKey = useMemo(
    () => baseParticipants.map((participant) => participant.userId).join('|'),
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

    for (const userId of participantViewState.joinedUserIds) {
      if (!displayedUserIds.has(userId)) {
        displayed.push({ userId, cumulativeScore: 0 })
      }
    }

    return displayed
  }, [baseParticipantKey, baseParticipants, participantViewState])

  const isParticipant = displayedParticipants.some(
    (participant) => participant.userId === currentUser?.id,
  )
  const canAccessRealtimeRoom = Boolean(tournamentId && (isOwner || isParticipant))

  const { connectionStatus, lastEvent, lastRecoveredAt, recentEvents } =
    useTournamentRealtime(canAccessRealtimeRoom ? tournamentId : undefined)

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
          userId: payload.userId,
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
    return <p>Tournament not found.</p>
  }

  const activeTournament = tournament
  const displayedStatus = tournamentFinished?.status ?? tournament.status
  const canJoin = displayedStatus === 'DRAFT' && !isOwner && !isParticipant
  const canLeave = displayedStatus === 'DRAFT' && !isOwner && isParticipant

  const handleJoin = async () => {
    const joinPayload = draftTournament?.inviteToken
      ? { tournamentId, inviteToken: draftTournament.inviteToken }
      : { tournamentId }

    await joinTournament(joinPayload).unwrap()
    setHasJoined(true)
    if (currentUser?.id) {
      dispatchParticipantView({
        type: 'participantJoined',
        baseKey: baseParticipantKey,
        userId: currentUser.id,
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

  return (
    <main className="create-tournament-page">
      <section className="create-tournament-content">
        <p className="eyebrow">Tournament Setup</p>

        <h1 className="create-tournament-title">Tournament Created</h1>

        <p className="create-tournament-description">
          Tournament was created successfully. The owner is already added as a
          participant.
        </p>

        <div className="create-tournament-card">
          <h2>{activeTournament.title}</h2>

          {fullTournament ? (
            <>
              <TournamentRealtimePanel
                connectionStatus={connectionStatus}
                lastEvent={lastEvent}
                lastRecoveredAt={lastRecoveredAt}
              />

              {tournamentFinished ? (
                <TournamentFinishedPanel
                  currentUserId={currentUser?.id}
                  finished={tournamentFinished}
                />
              ) : (
                <TournamentRoundPhasePanel
                  key={`${fullTournament.id}-${fullTournament.currentRound?.id ?? 'waiting'}`}
                  currentUserId={currentUser?.id}
                  tournament={fullTournament}
                  lastEvent={lastEvent}
                  recentEvents={recentEvents}
                />
              )}

              <LiveTournamentResults
                currentUserId={currentUser?.id}
                finished={tournamentFinished}
                roundCompleted={latestRoundCompleted}
              />
            </>
          ) : null}

          {joinError ? (
            <p className="form-error">{getApiErrorMessage(joinError)}</p>
          ) : null}

          {leaveError ? (
            <p className="form-error">{getApiErrorMessage(leaveError)}</p>
          ) : null}

          <p style={{ marginBottom: '16px' }}>
            <strong>Status:</strong> {displayedStatus}
          </p>

          <p style={{ marginBottom: '16px' }}>
            <strong>Visibility:</strong> {tournament.visibility}
          </p>

          <p style={{ marginBottom: '16px' }}>
            <strong>Rounds:</strong> {tournament.roundsCount}
          </p>

          <p style={{ marginBottom: '16px' }}>
            <strong>Submission duration:</strong> {tournament.submissionDurationSeconds}{' '}
            seconds
          </p>

          <p style={{ marginBottom: '16px' }}>
            <strong>Vote duration:</strong> {tournament.voteDurationSeconds} seconds
          </p>

          <p style={{ marginBottom: '16px' }}>
            <strong>Realtime:</strong>{' '}
            {canAccessRealtimeRoom
              ? realtimeStatusCopy[connectionStatus].label
              : 'Waiting'}
          </p>

          <p style={{ marginBottom: '16px' }}>
            <strong>Active users:</strong> {canAccessRealtimeRoom ? activeCount : 0}
          </p>

          <p style={{ marginBottom: '16px' }}>
            <strong>Participant count:</strong> {displayedParticipants.length}
          </p>

          <p
            style={{
              marginTop: '24px',
              marginBottom: '24px',
              wordBreak: 'break-word',
            }}
          >
            <strong>Tournament ID:</strong>
            <br />
            {activeTournament.id}
          </p>

          <p style={{ marginBottom: '16px' }}>
            <strong>Description:</strong>
            <br />
            {activeTournament.description ?? 'No description'}
          </p>

          <div style={{ marginBottom: '32px' }}>
            <h3>Participants</h3>

            {scoredParticipants.length === 0 ? <p>No participants yet.</p> : null}

            {scoredParticipants.map((participant) => (
              <div
                data-testid={`participant-${participant.userId}`}
                key={participant.userId}
                style={{
                  marginTop: '12px',
                  padding: '16px',
                  borderRadius: '16px',
                  background: '#eef3fb',
                }}
              >
                <p style={{ margin: 0 }}>
                  <strong>
                    {participant.userId === tournament.ownerId ? 'Owner' : 'Participant'}
                    {participant.userId === currentUser?.id ? ' · You' : ''}
                  </strong>
                </p>

                <p
                  style={{
                    margin: '8px 0 0',
                    wordBreak: 'break-word',
                  }}
                >
                  {participant.userId}
                </p>

                <p style={{ margin: '8px 0 0' }}>Score: {participant.cumulativeScore}</p>
              </div>
            ))}
          </div>

          {canJoin ? (
            <button
              className="create-button"
              disabled={isJoining}
              onClick={() => {
                void handleJoin()
              }}
            >
              {isJoining ? 'Joining...' : 'Join Tournament'}
            </button>
          ) : null}

          {canLeave ? (
            <button
              className="create-button"
              disabled={isLeaving}
              onClick={() => {
                void handleLeave()
              }}
            >
              {isLeaving ? 'Leaving...' : 'Leave Tournament'}
            </button>
          ) : null}

          <button
            className="create-button"
            onClick={() => {
              void navigate('/')
            }}
          >
            Go To Home Page
          </button>
        </div>
      </section>
    </main>
  )
}
