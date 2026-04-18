# Tournament Hub Frontend

Starter repository for a React frontend with a practical production baseline.

## Stack

- Vite 8 + React 19 + TypeScript
- Redux Toolkit + React Redux
- React Router
- ESLint with type-aware rules
- Prettier + Stylelint
- Vitest + Testing Library
- Husky + lint-staged

## Project structure

```text
src/
  app/        app bootstrap, router, store
  features/   isolated business features
  pages/      route-level screens
  test/       test setup
```

## Scripts

```bash
npm install
npm run dev
npm run check
```

Extra commands:

- `npm run lint`
- `npm run stylelint`
- `npm run format`
- `npm run test`
- `npm run build`

## CI/CD

The repository is prepared for:

- GitHub Actions CI on pull requests to `main`
- branch protection with required `ci` status checks
- Vercel Preview Deployments for branches and pull requests
- Vercel Production Deployment on merge to `main`

Vercel-specific project configuration lives in [vercel.json](/Users/mromanov/extra/tournament-hub-frontend/vercel.json).

For setup details, see [docs/ci-cd.md](./docs/ci-cd.md).

## Why this setup

- `Vite` stays as the runtime baseline instead of a hand-rolled scaffold.
- `Redux Toolkit` is ready from day one, but the example logic stays small.
- Type-aware `ESLint` catches real TS mistakes instead of just style noise.
- `Prettier`, `Stylelint`, `Husky` and `lint-staged` keep the repo clean before code lands.

## Alternatives

- Swap `React Router` for file-based routing if you later move to `TanStack Router` or `Next.js`.
- Swap `Redux Toolkit` for `Zustand` if the app remains mostly local-state driven.
- Add `RTK Query` as soon as API integration begins.
