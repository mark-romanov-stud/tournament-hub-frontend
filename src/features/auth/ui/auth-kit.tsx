import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  useId,
  useState,
} from 'react'
import { Link } from 'react-router-dom'

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  error?: string | undefined
  icon: ReactNode
  label: string
}

type PasswordFieldProps = Omit<FieldProps, 'icon'> & {
  action?: ReactNode
}

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ')
}

function IconFrame({
  children,
  tone = 'brand',
}: {
  children: ReactNode
  tone?: 'brand' | 'mint'
}) {
  return (
    <span className={classNames('auth-icon-frame', `auth-icon-frame--${tone}`)}>
      {children}
    </span>
  )
}

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={classNames('brand-lockup', compact && 'brand-lockup--compact')}>
      <IconFrame>
        <svg aria-hidden="true" className="brand-logo" viewBox="0 0 48 48">
          <rect x="8" y="18" width="8" height="18" rx="2" />
          <rect x="20" y="10" width="8" height="26" rx="2" />
          <rect x="32" y="22" width="8" height="14" rx="2" />
        </svg>
      </IconFrame>
      <span className="brand-lockup__wordmark">The Precision Pulse</span>
    </div>
  )
}

export function AuthShell({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <main className={classNames('auth-shell', className)}>{children}</main>
}

export function SurfaceCard({
  children,
  accent = false,
  className,
}: {
  children: ReactNode
  accent?: boolean
  className?: string
}) {
  return (
    <section
      className={classNames('surface-card', accent && 'surface-card--accent', className)}
    >
      {children}
    </section>
  )
}

export function TextField({ error, icon, label, ...props }: FieldProps) {
  const id = useId()

  return (
    <div className="auth-field">
      <label className="auth-field__label" htmlFor={id}>
        {label}
      </label>
      <div
        className={classNames(
          'auth-field__control',
          error && 'auth-field__control--error',
        )}
      >
        <span className="auth-field__icon">{icon}</span>
        <input className="auth-field__input" id={id} type="text" {...props} />
      </div>
      {error ? <p className="auth-field__error">{error}</p> : null}
    </div>
  )
}

export function PasswordField({ action, error, label, ...props }: PasswordFieldProps) {
  const id = useId()
  const [isVisible, setIsVisible] = useState(false)

  return (
    <div className="auth-field">
      <div className="auth-field__label-row">
        <label className="auth-field__label" htmlFor={id}>
          {label}
        </label>
        {action}
      </div>
      <div
        className={classNames(
          'auth-field__control',
          error && 'auth-field__control--error',
        )}
      >
        <span className="auth-field__icon">
          <LockIcon />
        </span>
        <input
          className="auth-field__input"
          id={id}
          type={isVisible ? 'text' : 'password'}
          {...props}
        />
        <button
          aria-label={isVisible ? 'Hide password' : 'Show password'}
          className="auth-field__toggle"
          type="button"
          onClick={() => setIsVisible((value) => !value)}
        >
          <EyeIcon />
        </button>
      </div>
      {error ? <p className="auth-field__error">{error}</p> : null}
    </div>
  )
}

export function PrimaryButton({
  children,
  isLoading,
  loadingLabel,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  isLoading?: boolean
  loadingLabel?: string
}) {
  return (
    <button className="auth-button auth-button--primary" disabled={isLoading} {...props}>
      {isLoading && loadingLabel ? loadingLabel : children}
    </button>
  )
}

export function SecondaryButton({
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className="auth-button auth-button--secondary" {...props}>
      {children}
    </button>
  )
}

export function AuthLinkAction({
  children,
  className,
  to,
}: {
  children: ReactNode
  className?: string
  to: string
}) {
  return (
    <Link className={classNames('auth-link-action', className)} to={to}>
      {children}
    </Link>
  )
}

export function InlineMessage({ messages }: { messages: string[] }) {
  if (!messages.length) {
    return null
  }

  return (
    <div className="inline-message" role="alert">
      {messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </div>
  )
}

export function StatTile({
  description,
  title,
  tone = 'brand',
}: {
  description: string
  title: string
  tone?: 'brand' | 'mint'
}) {
  return (
    <article className="stat-tile">
      <IconFrame tone={tone}>
        {tone === 'mint' ? <ShieldIcon /> : <TrophyIcon />}
      </IconFrame>
      <strong className="stat-tile__title">{title}</strong>
      <span className="stat-tile__description">{description}</span>
    </article>
  )
}

export function StatusStrip({ items }: { items: { label: string; icon: ReactNode }[] }) {
  return (
    <div className="status-strip">
      {items.map((item) => (
        <span className="status-strip__item" key={item.label}>
          {item.icon}
          {item.label}
        </span>
      ))}
    </div>
  )
}

export function QuotePanel() {
  return (
    <section className="quote-panel">
      <div className="quote-panel__glow" />
      <p className="quote-panel__quote">
        “The future of tournament interaction is precise, editorial, and curated for the
        elite.”
      </p>
    </section>
  )
}

export function BarsIcon() {
  return (
    <svg aria-hidden="true" className="auth-icon" viewBox="0 0 24 24">
      <path d="M4 11.5h4V20H4zM10 4h4v16h-4zM16 8h4v12h-4z" fill="currentColor" />
    </svg>
  )
}

export function MailIcon() {
  return (
    <svg aria-hidden="true" className="auth-icon" viewBox="0 0 24 24">
      <path
        d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5zM6 7l6 4.3L18 7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

export function UserIcon() {
  return (
    <svg aria-hidden="true" className="auth-icon" viewBox="0 0 24 24">
      <path
        d="M12 12a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 12 12m-6 7a6 6 0 0 1 12 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

export function LockIcon() {
  return (
    <svg aria-hidden="true" className="auth-icon" viewBox="0 0 24 24">
      <path
        d="M8 10V8a4 4 0 1 1 8 0v2m-8 0h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

export function EyeIcon() {
  return (
    <svg aria-hidden="true" className="auth-icon auth-icon--small" viewBox="0 0 24 24">
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6m9.5 2.5a2.5 2.5 0 1 0-2.5-2.5 2.5 2.5 0 0 0 2.5 2.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

export function ShieldIcon() {
  return (
    <svg aria-hidden="true" className="auth-icon" viewBox="0 0 24 24">
      <path
        d="M12 3l7 3v5.5c0 4.2-2.5 7.9-7 9.5-4.5-1.6-7-5.3-7-9.5V6z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

export function BoltIcon() {
  return (
    <svg aria-hidden="true" className="auth-icon auth-icon--small" viewBox="0 0 24 24">
      <path
        d="M13.5 2 6 13h5l-1 9L18 11h-5z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

export function TrophyIcon() {
  return (
    <svg aria-hidden="true" className="auth-icon" viewBox="0 0 24 24">
      <path
        d="M8 4h8v3a4 4 0 0 1-8 0zm-3 1h3v2a3 3 0 0 1-3 3zm14 0h-3v2a3 3 0 0 0 3 3M10 14h4m-5 5h6m-5-5v5m-2-15h8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}
