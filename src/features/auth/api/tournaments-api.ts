import { authApi } from '@/features/auth/api/auth-api'

export type TournamentVisibility = 'public' | 'private'
export type ApiTournamentVisibility = 'PUBLIC' | 'PRIVATE'

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
  status?: string
  inviteToken?: string | null
  ownerId: string
  participants?: TournamentParticipant[]
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
  }),
})

export const { useCreateTournamentMutation, useGetTournamentQuery } = tournamentsApi
