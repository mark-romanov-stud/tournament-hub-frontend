import { authApi } from '@/features/auth/api/auth-api'

export type TournamentVisibility = 'public' | 'private'
export type ApiTournamentVisibility = 'PUBLIC' | 'PRIVATE'
export type TournamentStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'

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
}

function mapVisibilityToApi(visibility: TournamentVisibility): ApiTournamentVisibility {
  return visibility === 'public' ? 'PUBLIC' : 'PRIVATE'
}

export const tournamentsApi = authApi.injectEndpoints({
  endpoints: (builder) => ({
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

    joinTournament: builder.mutation<boolean, JoinTournamentInput>({
      query: ({ tournamentId, inviteToken }) => ({
        url: `/tournaments/${tournamentId}/join`,
        method: 'POST',
        body: {
          inviteToken,
        },
      }),
      transformResponse: (response: { data: boolean }) => response.data,
    }),
  }),
})

export const {
  useCreateTournamentMutation,
  useGetTournamentQuery,
  useJoinTournamentMutation,
} = tournamentsApi
