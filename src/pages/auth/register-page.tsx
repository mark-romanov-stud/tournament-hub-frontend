import { type FormEvent, useState } from 'react'

import { useRegisterMutation } from '@/features/auth/api/auth-api'
import { useCompleteAuthentication } from '@/features/auth/hooks/use-complete-authentication'
import { getApiErrorMessages } from '@/features/auth/lib/get-api-error-messages'
import {
  AuthLinkAction,
  AuthShell,
  BrandLogo,
  InlineMessage,
  MailIcon,
  PasswordField,
  PrimaryButton,
  QuotePanel,
  StatTile,
  SurfaceCard,
  TextField,
  UserIcon,
} from '@/features/auth/ui/auth-kit'

interface RegisterFormState {
  email: string
  username: string
  password: string
}

type RegisterErrors = Partial<Record<keyof RegisterFormState, string>>

function validateRegisterForm(values: RegisterFormState) {
  const errors: RegisterErrors = {}

  if (!values.email.trim()) {
    errors.email = 'Email is required'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(values.email)) {
    errors.email = 'Enter a valid email address'
  }

  if (!values.username.trim()) {
    errors.username = 'Username is required'
  } else if (values.username.trim().length < 3 || values.username.trim().length > 14) {
    errors.username = 'Username must be 3 to 14 characters'
  }

  if (!values.password) {
    errors.password = 'Password is required'
  } else if (values.password.length < 6) {
    errors.password = 'Password must be at least 6 characters'
  }

  return errors
}

export function RegisterPage() {
  const [formState, setFormState] = useState<RegisterFormState>({
    email: '',
    username: '',
    password: '',
  })
  const [fieldErrors, setFieldErrors] = useState<RegisterErrors>({})
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [register, { isLoading }] = useRegisterMutation()
  const completeAuthentication = useCompleteAuthentication()

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextErrors = validateRegisterForm(formState)
    setFieldErrors(nextErrors)
    setFormErrors([])

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    try {
      const tokens = await register(formState).unwrap()
      await completeAuthentication(tokens)
    } catch (error) {
      setFormErrors(getApiErrorMessages(error))
    }
  }

  const updateField = <Field extends keyof RegisterFormState>(
    field: Field,
    value: RegisterFormState[Field],
  ) => {
    setFormState((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
  }

  return (
    <AuthShell className="auth-shell--register">
      <section className="register-hero">
        <BrandLogo compact />
        <div className="register-hero__copy">
          <h1>Join the Arena of Curated Excellence.</h1>
          <p>
            Experience tournament voting with architectural precision. Secure your spot in
            the gallery of competitive data.
          </p>
        </div>
        <div className="register-hero__stats">
          <StatTile description="Live tournaments" title="500+" />
          <StatTile description="Data accuracy" title="Verified" tone="mint" />
        </div>
      </section>

      <SurfaceCard className="register-card">
        <header className="auth-card__header auth-card__header--centered">
          <h2>Create Account</h2>
          <p>Enter your details to start voting</p>
        </header>

        <form
          className="auth-form"
          noValidate
          onSubmit={(event) => {
            void handleSubmit(event)
          }}
        >
          <TextField
            autoComplete="username"
            error={fieldErrors.username}
            icon={<UserIcon />}
            label="Username"
            name="username"
            placeholder="curator_john"
            value={formState.username}
            onChange={(event) => updateField('username', event.target.value)}
          />
          <TextField
            autoComplete="email"
            error={fieldErrors.email}
            icon={<MailIcon />}
            label="Email Address"
            name="email"
            placeholder="name@pulse.com"
            value={formState.email}
            onChange={(event) => updateField('email', event.target.value)}
          />
          <PasswordField
            autoComplete="new-password"
            error={fieldErrors.password}
            label="Password"
            name="password"
            placeholder="••••••••••••"
            value={formState.password}
            onChange={(event) => updateField('password', event.target.value)}
          />

          <label className="terms-note">
            <input className="terms-note__checkbox" type="checkbox" />
            <span>
              I agree to the <strong>Terms of Service</strong> and{' '}
              <strong>Privacy Policy</strong>.
            </span>
          </label>

          <InlineMessage messages={formErrors} />

          <PrimaryButton
            isLoading={isLoading}
            loadingLabel="Creating account..."
            type="submit"
          >
            Register Account
          </PrimaryButton>
        </form>

        <div className="auth-card__footer">
          <span className="auth-card__divider">Already have an account?</span>
          <AuthLinkAction className="auth-button auth-button--secondary" to="/login">
            Login to Pulse
          </AuthLinkAction>
        </div>
      </SurfaceCard>

      <QuotePanel />
    </AuthShell>
  )
}
