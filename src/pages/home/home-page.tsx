import { useAppDispatch, useAppSelector } from '@/app/providers/store'
import {
  decrement,
  increment,
  incrementByAmount,
} from '@/features/counter/model/counter-slice'

const stackItems = [
  {
    title: 'Feature-based structure',
    description: 'Separate app bootstrap, route pages and reusable business slices.',
  },
  {
    title: 'Type-aware quality gate',
    description:
      'ESLint, Stylelint and Prettier work together instead of fighting each other.',
  },
  {
    title: 'Ready for scale',
    description:
      'Redux Toolkit and React Router are connected without overbuilding the shell.',
  },
] as const

const toolingItems = [
  {
    label: 'State management',
    note: 'Redux Toolkit + typed React Redux hooks',
    value: 'rtk',
  },
  {
    label: 'Routing',
    note: 'Data router baseline with createBrowserRouter',
    value: 'router',
  },
  {
    label: 'Quality',
    note: 'ESLint, Prettier, Stylelint, Husky, lint-staged',
    value: 'guardrails',
  },
  {
    label: 'Testing',
    note: 'Vitest + Testing Library for fast local feedback',
    value: 'vitest',
  },
] as const

export function HomePage() {
  const count = useAppSelector((state) => state.counter.value)
  const dispatch = useAppDispatch()

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-grid">
          <div>
            <span className="eyebrow">Tournament Hub Frontend</span>
            <h1 className="hero-title">React baseline with the boring parts fixed.</h1>
            <p className="hero-copy">
              Vite initializes the app, Redux Toolkit handles global state, and the repo
              already ships with the checks you actually want before a feature branch
              grows teeth.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#counter-demo">
                Open starter demo
              </a>
              <a className="button button-secondary" href="#stack">
                Review stack
              </a>
            </div>
            <div className="hero-metrics">
              <article className="metric-card">
                <span className="metric-value">19</span>
                <span className="metric-label">React baseline</span>
              </article>
              <article className="metric-card">
                <span className="metric-value">RTK</span>
                <span className="metric-label">Store already wired</span>
              </article>
              <article className="metric-card">
                <span className="metric-value">4</span>
                <span className="metric-label">Core quality gates</span>
              </article>
            </div>
          </div>

          <aside className="showcase-card" id="stack">
            <p className="showcase-kicker">Project posture</p>
            <h2 className="showcase-title">
              Small now, still ready for the first real refactor.
            </h2>
            <p className="showcase-copy">
              The repo starts light, but the layout already assumes route pages, business
              features and a central store instead of one giant component tree.
            </p>

            <ul className="stack-list">
              {stackItems.map((item) => (
                <li className="stack-item" key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section className="content-grid">
        <article className="panel-card" id="counter-demo">
          <p className="section-kicker">Redux smoke test</p>
          <h2 className="section-title">Counter slice connected to the app store.</h2>
          <p className="section-copy">
            This is intentionally simple. It proves the store, typed hooks and update
            cycle are alive before you plug in API logic or RTK Query.
          </p>

          <div className="counter-surface">
            <div className="counter-row">
              <div>
                <p className="counter-label">Current seeded value</p>
                <p className="counter-value">{count}</p>
              </div>
              <div className="counter-actions">
                <button
                  className="button counter-button counter-button-neutral"
                  type="button"
                  onClick={() => dispatch(decrement())}
                >
                  Minus one
                </button>
                <button
                  className="button counter-button counter-button-positive"
                  type="button"
                  onClick={() => dispatch(increment())}
                >
                  Plus one
                </button>
                <button
                  className="button counter-button counter-button-positive"
                  type="button"
                  onClick={() => dispatch(incrementByAmount(5))}
                >
                  Add five
                </button>
              </div>
            </div>

            <pre className="code-block">
              <code>src/features/counter/model/counter-slice.ts</code>
            </pre>
          </div>
        </article>

        <aside className="stack-card">
          <p className="section-kicker">Tooling map</p>
          <h2 className="section-title">Choices made on purpose.</h2>
          <p className="section-copy">
            Enough structure to keep the repo disciplined, without dragging in a framework
            migration before the product exists.
          </p>

          <div className="stack-grid">
            {toolingItems.map((item) => (
              <article className="stack-pair" key={item.label}>
                <div>
                  <span className="stack-label">{item.label}</span>
                  <span className="stack-note">{item.note}</span>
                </div>
                <span className="stack-pill">{item.value}</span>
              </article>
            ))}
          </div>
        </aside>
      </section>
    </main>
  )
}
