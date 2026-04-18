import { type FormEvent, useState } from 'react'

import { useLoginMutation } from '@/features/auth/api/auth-api'
import { useCompleteAuthentication } from '@/features/auth/hooks/use-complete-authentication'
import { getApiErrorMessages } from '@/features/auth/lib/get-api-error-messages'
import {
  AuthLinkAction,
  AuthShell,
  BoltIcon,
  BrandLogo,
  InlineMessage,
  MailIcon,
  PasswordField,
  PrimaryButton,
  ShieldIcon,
  StatTile,
  StatusStrip,
  SurfaceCard,
  TextField,
} from '@/features/auth/ui/auth-kit'

interface LoginFormState {
  email: string
  password: string
}

type LoginErrors = Partial<Record<keyof LoginFormState, string>>

function validateLoginForm(values: LoginFormState) {
  const errors: LoginErrors = {}

  if (!values.email.trim()) {
    errors.email = 'Email is required'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(values.email)) {
    errors.email = 'Enter a valid email address'
  }

  if (!values.password) {
    errors.password = 'Password is required'
  }

  return errors
}

export function LoginPage() {
  const [formState, setFormState] = useState<LoginFormState>({
    email: '',
    password: '',
  })
  const [fieldErrors, setFieldErrors] = useState<LoginErrors>({})
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [login, { isLoading }] = useLoginMutation()
  const completeAuthentication = useCompleteAuthentication()

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextErrors = validateLoginForm(formState)
    setFieldErrors(nextErrors)
    setFormErrors([])

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    try {
      const tokens = await login(formState).unwrap()
      await completeAuthentication(tokens)
    } catch (error) {
      setFormErrors(getApiErrorMessages(error))
    }
  }

  const updateField = <Field extends keyof LoginFormState>(
    field: Field,
    value: LoginFormState[Field],
  ) => {
    setFormState((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
  }

  return (
    <AuthShell className="auth-shell--login">
      <div className="login-stage">
        <BrandLogo />

        <SurfaceCard accent className="login-card">
          <header className="auth-card__header auth-card__header--centered">
            <h1>Welcome Back</h1>
            <p>Access the curator dashboard and cast your vote.</p>
          </header>

          <form
            className="auth-form"
            noValidate
            onSubmit={(event) => {
              void handleSubmit(event)
            }}
          >
            <TextField
              autoComplete="email"
              error={fieldErrors.email}
              icon={<MailIcon />}
              label="Email Address"
              name="email"
              placeholder="name@company.com"
              value={formState.email}
              onChange={(event) => updateField('email', event.target.value)}
            />
            <PasswordField
              action={
                <button className="forgot-link" disabled type="button">
                  Forgot?
                </button>
              }
              autoComplete="current-password"
              error={fieldErrors.password}
              label="Password"
              name="password"
              placeholder="••••••••"
              value={formState.password}
              onChange={(event) => updateField('password', event.target.value)}
            />

            <InlineMessage messages={formErrors} />

            <PrimaryButton
              isLoading={isLoading}
              loadingLabel="Logging in..."
              type="submit"
            >
              Log In to Dashboard
            </PrimaryButton>
          </form>

          <p className="auth-switch">
            New to the arena?{' '}
            <AuthLinkAction to="/register">Create an account</AuthLinkAction>
          </p>

          <StatusStrip
            items={[
              { label: 'Secure Access', icon: <ShieldIcon /> },
              { label: 'Real-time Data', icon: <BoltIcon /> },
            ]}
          />
        </SurfaceCard>

        <div className="login-stage__tiles">
          <StatTile description="Tournament prestige" title="Curated" />
          <StatTile description="Judging pulse" title="Live" tone="mint" />
        </div>
      </div>
    </AuthShell>
  )
}
