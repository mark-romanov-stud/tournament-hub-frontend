import './create-tournament-page.css'

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  type CreateTournamentInput,
  type TournamentVisibility,
  useCreateTournamentMutation,
} from '@/features/auth/api/tournaments-api'

interface FormErrors {
  title?: string
  description?: string
  rounds?: string
  api?: string
}

const fallbackApiErrorMessage = 'Failed to create tournament. Please try again.'
const durationOptions = [15, 30, 45]

const getApiErrorMessage = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data = (error as { data?: { message?: string[] | string } }).data

    if (Array.isArray(data?.message) && data.message.length > 0) {
      return data.message[0] ?? fallbackApiErrorMessage
    }

    if (typeof data?.message === 'string') {
      return data.message
    }
  }

  return fallbackApiErrorMessage
}

export function CreateTournamentPage() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [rounds, setRounds] = useState(3)
  const [submissionDurationSeconds, setSubmissionDurationSeconds] = useState(30)
  const [voteDurationSeconds, setVoteDurationSeconds] = useState(30)
  const [visibility, setVisibility] = useState<TournamentVisibility>('public')
  const [errors, setErrors] = useState<FormErrors>({})

  const navigate = useNavigate()
  const [createTournament, { isLoading }] = useCreateTournamentMutation()

  const clearFieldError = (fieldName: keyof FormErrors) => {
    setErrors((currentErrors) => {
      const nextErrors = { ...currentErrors }

      delete nextErrors[fieldName]
      delete nextErrors.api

      return nextErrors
    })
  }

  const validateForm = () => {
    const nextErrors: FormErrors = {}

    if (!title.trim()) {
      nextErrors.title = 'Tournament name is required'
    }

    if (!description.trim()) {
      nextErrors.description = 'Description is required'
    }

    if (rounds < 1) {
      nextErrors.rounds = 'Number of rounds must be at least 1'
    }

    setErrors(nextErrors)

    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!validateForm()) {
      return
    }

    try {
      setErrors({})

      const requestBody: CreateTournamentInput = {
        title: title.trim(),
        description: description.trim(),
        visibility,
        roundsCount: rounds,
        submissionDurationSeconds,
        voteDurationSeconds,
      }

      const tournament = await createTournament(requestBody).unwrap()

      void navigate(`/tournaments/${tournament.id}`)
    } catch (error) {
      setErrors({
        api: getApiErrorMessage(error),
      })
    }
  }

  return (
    <main className="create-tournament-page">
      <header className="create-tournament-header">
        <div className="brand">
          <span className="brand-icon">▥</span>
          <span>The Precision Pulse</span>
        </div>

        <div className="avatar" aria-label="User avatar">
          👤
        </div>
      </header>

      <section className="create-tournament-content">
        <p className="eyebrow">Creation Suite</p>

        <h1 className="create-tournament-title">Initialize Your Competition</h1>

        <p className="create-tournament-description">
          Craft a prestigious arena for elite competitors. Define your rules, set the
          stakes, and curate the experience.
        </p>

        <form
          className="create-tournament-card"
          onSubmit={(event) => {
            void handleSubmit(event)
          }}
        >
          {errors.api ? <p className="form-error">{errors.api}</p> : null}

          <label className="field">
            <span>Tournament Name</span>
            <input
              type="text"
              name="title"
              placeholder="e.g. The Grand Invitational 2024"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value)
                clearFieldError('title')
              }}
              aria-invalid={Boolean(errors.title)}
            />
            {errors.title ? <span className="field-error">{errors.title}</span> : null}
          </label>

          <label className="field">
            <span>Description</span>
            <textarea
              name="description"
              placeholder="Describe the spirit of the competition..."
              value={description}
              onChange={(event) => {
                setDescription(event.target.value)
                clearFieldError('description')
              }}
              aria-invalid={Boolean(errors.description)}
            />
            {errors.description ? (
              <span className="field-error">{errors.description}</span>
            ) : null}
          </label>

          <label className="field">
            <span>Number of Rounds</span>
            <select
              name="rounds"
              value={rounds}
              onChange={(event) => {
                setRounds(Number(event.target.value))
                clearFieldError('rounds')
              }}
              aria-invalid={Boolean(errors.rounds)}
            >
              <option value="1">1 Round</option>
              <option value="2">2 Rounds</option>
              <option value="3">3 Rounds</option>
              <option value="4">4 Rounds</option>
            </select>
            {errors.rounds ? <span className="field-error">{errors.rounds}</span> : null}
          </label>

          <label className="field">
            <span>Submission Duration</span>
            <select
              name="submissionDurationSeconds"
              value={submissionDurationSeconds}
              onChange={(event) => {
                setSubmissionDurationSeconds(Number(event.target.value))
              }}
            >
              {durationOptions.map((duration) => (
                <option key={duration} value={duration}>
                  {duration} seconds
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Vote Duration</span>
            <select
              name="voteDurationSeconds"
              value={voteDurationSeconds}
              onChange={(event) => {
                setVoteDurationSeconds(Number(event.target.value))
              }}
            >
              {durationOptions.map((duration) => (
                <option key={duration} value={duration}>
                  {duration} seconds
                </option>
              ))}
            </select>
          </label>

          <fieldset className="visibility-field">
            <legend>Visibility</legend>

            <div className="visibility-toggle">
              <label>
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  checked={visibility === 'public'}
                  onChange={() => setVisibility('public')}
                />
                <span>🌐 Public</span>
              </label>

              <label>
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  checked={visibility === 'private'}
                  onChange={() => setVisibility('private')}
                />
                <span>🔒 Private</span>
              </label>
            </div>
          </fieldset>

          <button className="create-button" type="submit" disabled={isLoading}>
            {isLoading ? 'Creating...' : '⊕ Create Tournament'}
          </button>

          <p className="draft-hint">Drafts are automatically saved</p>
        </form>
      </section>

      <nav className="bottom-nav">
        <a href="/">◎ Explore</a>
        <a className="active" href="/tournaments/create">
          🏆 Tournaments
        </a>
        <a href="/">♙ Profile</a>
      </nav>
    </main>
  )
}
