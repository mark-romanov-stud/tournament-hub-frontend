import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAppDispatch, useAppSelector } from '@/app/providers/store'
import { useLogoutMutation } from '@/features/auth/api/auth-api'
import { useGetTournamentsQuery } from '@/features/auth/api/tournaments-api'
import { authActions } from '@/features/auth/model/auth-slice'
import { clearStoredSession } from '@/features/auth/model/token-storage'
import { useLiveTournamentRecovery } from '@/features/tournaments/live/live-tournament-recovery-context'

const uuidPattern =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const roomCodePattern = new RegExp(`^(${uuidPattern})(?:[:.\\s]+(${uuidPattern}))?$`, 'u')
const tournamentPathPattern = new RegExp(`/tournaments/(${uuidPattern})`, 'u')

function parseRoomCode(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  try {
    const url = new URL(trimmed, window.location.origin)
    const match = tournamentPathPattern.exec(url.pathname)

    if (match?.[1]) {
      return {
        inviteToken: url.searchParams.get('inviteToken'),
        tournamentId: match[1],
      }
    }
  } catch {
    // Fall through to compact code parsing.
  }

  const compactMatch = roomCodePattern.exec(trimmed)

  if (!compactMatch?.[1]) {
    return null
  }

  return {
    inviteToken: compactMatch[2] ?? null,
    tournamentId: compactMatch[1],
  }
}

export function HomePage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [logout, { isLoading }] = useLogoutMutation()
  const [roomCode, setRoomCode] = useState('')
  const [roomCodeError, setRoomCodeError] = useState<string | null>(null)
  const [isJoinCodeOpen, setIsJoinCodeOpen] = useState(false)
  const user = useAppSelector((state) => state.auth.user)
  const { activeTournament } = useLiveTournamentRecovery()

  const {
    data: tournaments = [],
    isLoading: isTournamentsLoading,
    isError: isTournamentsError,
  } = useGetTournamentsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  })

  const handleLogout = async () => {
    try {
      await logout().unwrap()
    } catch {
      // Fail closed on the client even if the backend logout request fails.
    } finally {
      clearStoredSession()
      dispatch(authActions.sessionCleared())
      void navigate('/login', { replace: true })
    }
  }

  const handleJoinByCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const parsedCode = parseRoomCode(roomCode)

    if (!parsedCode) {
      setRoomCodeError('Enter a tournament link, tournament id, or invite code.')
      return
    }

    setRoomCodeError(null)

    const inviteQuery = parsedCode.inviteToken
      ? `?inviteToken=${encodeURIComponent(parsedCode.inviteToken)}`
      : ''

    setIsJoinCodeOpen(false)
    void navigate(`/tournaments/${parsedCode.tournamentId}${inviteQuery}`)
  }

  return (
    <main className="dashboard-shell">
      <section className="dashboard-card">
        <p className="dashboard-card__eyebrow">Authenticated space</p>

        <h1>Curator Dashboard</h1>

        <p className="dashboard-card__copy">
          The private route is active. The authenticated shell is now reserved for
          signed-in curators only.
        </p>

        <dl className="dashboard-card__meta">
          <div>
            <dt>Username</dt>
            <dd>{user?.username ?? 'Unknown curator'}</dd>
          </div>

          <div>
            <dt>Email</dt>
            <dd>{user?.email ?? 'Unknown email'}</dd>
          </div>
        </dl>

        <div className="dashboard-actions">
          {activeTournament ? (
            <button
              className="auth-button auth-button--secondary dashboard-card__action"
              disabled
              type="button"
            >
              Finish Live Match First
            </button>
          ) : (
            <Link
              to="/tournaments/create"
              className="auth-button auth-button--primary dashboard-card__action"
            >
              Create Tournament
            </Link>
          )}

          <button
            className="auth-button auth-button--secondary dashboard-card__action"
            type="button"
            onClick={() => {
              setIsJoinCodeOpen(true)
            }}
          >
            Join by Code
          </button>

          <button
            className="auth-button auth-button--primary dashboard-card__action"
            disabled={isLoading}
            type="button"
            onClick={() => {
              void handleLogout()
            }}
          >
            {isLoading ? 'Logging out...' : 'Log Out'}
          </button>
        </div>

        <section className="dashboard-tournaments">
          <h2>Tournaments</h2>

          {isTournamentsLoading ? <p>Loading tournaments...</p> : null}

          {isTournamentsError ? <p>Failed to load tournaments.</p> : null}

          {!isTournamentsLoading && !isTournamentsError && tournaments.length === 0 ? (
            <p>No tournaments yet.</p>
          ) : null}

          <div className="dashboard-tournament-list">
            {tournaments.map((tournament) => (
              <div className="dashboard-tournament-item" key={tournament.id}>
                <strong>{tournament.title}</strong>

                <p>Status: {tournament.status}</p>

                <Link
                  to={`/tournaments/${tournament.id}`}
                  className="auth-button auth-button--primary"
                >
                  Open Tournament
                </Link>
              </div>
            ))}
          </div>
        </section>

        {isJoinCodeOpen ? (
          <div className="dashboard-modal-backdrop" role="presentation">
            <section
              aria-labelledby="join-code-title"
              aria-modal="true"
              className="dashboard-modal"
              role="dialog"
            >
              <div className="dashboard-modal__header">
                <div>
                  <p className="dashboard-card__eyebrow">Tournament access</p>
                  <h2 id="join-code-title">Join by code</h2>
                </div>
                <button
                  aria-label="Close"
                  className="dashboard-modal__close"
                  type="button"
                  onClick={() => {
                    setIsJoinCodeOpen(false)
                    setRoomCodeError(null)
                  }}
                >
                  Close
                </button>
              </div>

              <p className="dashboard-modal__copy">
                Paste a tournament UUID for a public room. For a private room, paste the
                invite link from the owner, or use tournament UUID and invite token in the
                format UUID:INVITE_TOKEN. The owner can copy the tournament UUID from the
                tournament page, and the private invite link from the browser address
                after creating the private tournament.
              </p>

              <form className="dashboard-join-code" onSubmit={handleJoinByCode}>
                <label htmlFor="room-code">Room code or invite link</label>
                <div className="dashboard-join-code__row">
                  <input
                    autoFocus
                    id="room-code"
                    placeholder="Tournament UUID or invite link"
                    value={roomCode}
                    onChange={(event) => {
                      setRoomCode(event.target.value)
                      setRoomCodeError(null)
                    }}
                  />
                  <button className="auth-button auth-button--primary" type="submit">
                    Join
                  </button>
                </div>
                {roomCodeError ? <p role="alert">{roomCodeError}</p> : null}
              </form>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  )
}
