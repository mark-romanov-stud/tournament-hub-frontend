import { authApi } from '@/features/auth/api/auth-api'

export type TournamentVisibility = 'public' | 'private'
export type ApiTournamentVisibility = 'PUBLIC' | 'PRIVATE'
export type TournamentStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'

export interface TournamentParticipant {
  userId: string
  cumulativeScore: number
}

export interface CreateTournamentInput {
  title: string
  description: string
  visibility: TournamentVisibility
  roundsCount: number
  submissionDurationSeconds: number
  voteDurationSeconds: number
}

export interface JoinTournamentInput {
  tournamentId: string
  inviteToken?: string
}

export interface Tournament {
  id: string
  createdAt?: string
  updatedAt?: string
  title: string
  description: string | null
  visibility: ApiTournamentVisibility
  roundsCount: number
  submissionDurationSeconds: number
  voteDurationSeconds: number
  status: TournamentStatus
  inviteToken?: string | null
  ownerId: string
  participants?: TournamentParticipant[]
}

export type FullTournamentParticipant = TournamentParticipant

export type RoundPromptContent = string | { en: string; ru: string }

export interface FullTournament {
  id: string
  title: string
  description: string | null
  visibility: ApiTournamentVisibility
  status: string
  roundsCount: number
  submissionDurationSeconds: number
  voteDurationSeconds: number
  ownerId: string
  participants: FullTournamentParticipant[]
  currentRound: {
    id: string
    number: number
    phase: string
    prompt: {
      key: string
      type: string
      content: RoundPromptContent
    }
    submissionDeadline: string
    submissionClosedAt: string | null
    votingDeadline: string | null
  } | null
}

export interface UpsertRoundSubmissionInput {
  roundId: string
  content: string
}

export interface RoundSubmission {
  id: string
  roundId: string
  authorId: string
  content: string
  submittedAt?: string
}

function mapVisibilityToApi(visibility: TournamentVisibility): ApiTournamentVisibility {
  return visibility === 'public' ? 'PUBLIC' : 'PRIVATE'
}

function unwrapTournamentList(response: {
  data: Tournament[] | { items?: Tournament[] }
}) {
  if (Array.isArray(response.data)) {
    return response.data
  }

  return response.data.items ?? []
}

export const tournamentsApi = authApi.injectEndpoints({
  endpoints: (builder) => ({
    getTournaments: builder.query<Tournament[], void>({
      query: () => ({
        url: '/tournaments',
        method: 'GET',
      }),
      transformResponse: unwrapTournamentList,
    }),

    createTournament: builder.mutation<Tournament, CreateTournamentInput>({
      query: ({
        title,
        description,
        visibility,
        roundsCount,
        submissionDurationSeconds,
        voteDurationSeconds,
      }) => ({
        url: '/tournaments',
        method: 'POST',
        body: {
          title,
          description,
          visibility: mapVisibilityToApi(visibility),
          roundsCount,
          submissionDurationSeconds,
          voteDurationSeconds,
        },
      }),
      transformResponse: (response: { data: Tournament }) => response.data,
    }),

    getTournament: builder.query<Tournament, string>({
      query: (id) => ({
        url: `/tournaments/${id}`,
        method: 'GET',
      }),
      transformResponse: (response: { data: Tournament }) => response.data,
    }),

    getFullTournament: builder.query<FullTournament, string>({
      query: (id) => ({
        url: `/tournaments/${id}/full`,
        method: 'GET',
      }),
      transformResponse: (response: { data: FullTournament }) => response.data,
    }),

    upsertRoundSubmission: builder.mutation<RoundSubmission, UpsertRoundSubmissionInput>({
      query: ({ roundId, content }) => ({
        url: `/rounds/${roundId}/submissions`,
        method: 'POST',
        body: { content },
      }),
      transformResponse: (response: { data: RoundSubmission }) => response.data,
    }),

    joinTournament: builder.mutation<boolean, JoinTournamentInput>({
      query: ({ tournamentId, inviteToken }) => ({
        url: `/tournaments/${tournamentId}/join`,
        method: 'POST',
        body: inviteToken ? { inviteToken } : {},
      }),
      transformResponse: (response: { data: boolean }) => response.data,
    }),

    leaveTournament: builder.mutation<boolean, string>({
      query: (tournamentId) => ({
        url: `/tournaments/${tournamentId}/leave`,
        method: 'POST',
      }),
      transformResponse: (response: { data: boolean }) => response.data,
    }),
  }),
})

export const {
  useCreateTournamentMutation,
  useGetFullTournamentQuery,
  useGetTournamentQuery,
  useGetTournamentsQuery,
  useJoinTournamentMutation,
  useLeaveTournamentMutation,
  useLazyGetFullTournamentQuery,
  useUpsertRoundSubmissionMutation,
} = tournamentsApi
