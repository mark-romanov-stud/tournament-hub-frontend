# CI/CD and Vercel Deployment

## CI

GitHub Actions CI is defined in [`.github/workflows/ci.yml`](/Users/mromanov/extra/tournament-hub-frontend/.github/workflows/ci.yml).

It runs on:

- pull requests targeting `main`
- pushes to `main`

The workflow executes:

1. `npm ci`
2. `npm run check`

`npm run check` currently covers:

- type checking
- ESLint
- Stylelint
- tests
- production build

This makes the `ci` job a good required status check for pull requests.

## Branch Protection

Recommended ruleset for `main`:

- require pull requests before merging
- require 1 approval
- require review from code owners
- dismiss stale approvals
- require approval of the most recent reviewable push
- require conversation resolution
- require status checks to pass
- require branches to be up to date before merging
- require linear history
- block force pushes
- restrict deletions

Keep `.github/CODEOWNERS` aligned with the actual repository owner or reviewer group.

## Vercel

This project is prepared for Vercel Git-based deployments.

[vercel.json](/Users/mromanov/extra/tournament-hub-frontend/vercel.json) pins:

- `framework: vite`
- `buildCommand: npm run build`
- `outputDirectory: dist`
- SPA rewrite from `/(.*)` to `/index.html`

The rewrite is required because the app uses client-side routing. Without it, direct requests to routes like `/login` or `/register` will return 404 on refresh.

## Vercel Setup

1. Import the GitHub repository into Vercel.
2. Confirm the framework preset is `Vite`.
3. Confirm the production branch is `main`.
4. Confirm build settings:
   - build command: `npm run build`
   - output directory: `dist`
5. Add environment variables in both `Preview` and `Production`:
   - `VITE_API_URL=https://tournament-hub-backend.onrender.com/api/v1`

Do not use `VITE_API_URL=/api/v1` on Vercel. That relative value is only appropriate for local development through the Vite dev proxy.

## Deployment Flow

Expected flow after Vercel is connected:

- push branch -> Vercel Preview Deployment
- open/update PR -> preview URL updates
- merge PR into `main` -> Vercel Production Deployment

GitHub Actions should stay responsible for CI gating, while Vercel should stay responsible for deployment.
