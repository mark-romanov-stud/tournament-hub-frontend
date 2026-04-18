# Tournament Hub Frontend

React frontend for The Precision Pulse authentication entry flow.

The project now includes:

- registration page
- login page
- authenticated routing
- RTK Query auth integration
- a small auth-focused core design system
- Vitest + Testing Library + MSW coverage for the auth flow

## Stack

- Vite 8
- React 19
- TypeScript
- Redux Toolkit + RTK Query
- React Router 7
- ESLint + Prettier + Stylelint
- Vitest + Testing Library + MSW

## Quick Start

```bash
npm install
npm run dev
```

Default app URL:

- [http://localhost:5173](http://localhost:5173)

## Environment

The frontend can target the deployed backend by default, but the API base URL can be overridden.

For local development against a local backend, create `.env.local`:

```bash
VITE_API_URL=http://localhost:3000/api/v1
```

Default fallback:

- `https://tournament-hub-backend.onrender.com/api/v1`

For local development against the hosted backend, use the Vite dev proxy instead of calling the production origin directly from the browser.

1. Create `.env.local` from `.env.example`.
2. Set:

```bash
VITE_API_URL=/api/v1
```

3. Run `npm run dev`.

The Vite dev server proxies `/api/*` to `https://tournament-hub-backend.onrender.com`.

This is a dev-only workaround, not a real backend fix. It exists because the hosted backend currently returns `Access-Control-Allow-Origin: *` together with `Access-Control-Allow-Credentials: true`, which browsers reject for `credentials: include` requests.

## Available Routes

- `/login` public guest-only login page
- `/register` public guest-only registration page
- `/` protected dashboard placeholder

## Auth Contract

Frontend is built against these backend routes:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `DELETE /auth/logout`
- `GET /users/profile`

Client auth model:

- access token and refresh token are stored in `sessionStorage`
- auth requests send `credentials: include` for backend fingerprint cookie support
- protected requests use `Authorization: Bearer <accessToken>`
- refresh sends the refresh token in both the bearer header and request body

Stored keys:

- `tournament-hub.auth.access-token`
- `tournament-hub.auth.refresh-token`

## Project Structure

```text
src/
  app/
    providers/   redux store setup
    router/      browser + memory router config
    test/        app render helpers for integration tests
  features/
    auth/
      api/       RTK Query auth client
      hooks/     bootstrap and auth completion hooks
      lib/       API error parsing
      model/     auth slice, storage, types, unit tests
      ui/        auth UI kit and route guards
    counter/     starter baseline slice kept as a simple example
  pages/
    auth/        login and registration screens
    home/        protected authenticated landing page
  test/
    handlers.ts  MSW request handlers
    server.ts    MSW node server
    setup.ts     global test lifecycle
```

## Architecture Notes

- `src/app/App.tsx` bootstraps auth once on app load.
- `src/features/auth/hooks/use-auth-bootstrap.ts` hydrates tokens from `sessionStorage` and attempts profile restoration.
- `src/features/auth/api/auth-api.ts` owns auth requests, token refresh, and retry-once reauthorization.
- `src/features/auth/ui/route-guards.tsx` protects private routes and redirects guest/authenticated users appropriately.
- `src/features/auth/ui/auth-kit.tsx` contains shared auth UI primitives used by both entry pages.

More detailed docs:

- [Frontend Architecture](./docs/frontend-architecture.md)
- [Core Design System](./docs/core-design-system.md)

## Scripts

Core workflow:

```bash
npm run dev
npm run test:run
npm run check
```

Additional scripts:

- `npm run typecheck`
- `npm run lint`
- `npm run lint:fix`
- `npm run stylelint`
- `npm run format`
- `npm run build`

## Testing

The auth flow is covered at three levels:

- unit tests for token storage and auth slice state transitions
- integration tests for registration, login, and authenticated routing
- MSW-based backend mocking for login/register/profile/refresh/logout behavior

Main test files:

- `src/features/auth/model/token-storage.test.ts`
- `src/features/auth/model/auth-slice.test.ts`
- `src/pages/auth/register-page.test.tsx`
- `src/pages/auth/login-page.test.tsx`
- `src/app/auth-routing.test.tsx`

## Manual Smoke Test

1. Open `/`.
   Expected: redirect to `/login`.
2. Open `/register`.
   Expected: validation for empty and invalid fields.
3. Register a new account.
   Expected: loading state, redirect to `/`, tokens stored in `sessionStorage`.
4. Log out from `/`.
   Expected: redirect to `/login`, stored tokens cleared.
5. Log in again.
   Expected: redirect to `/`, invalid credentials shown inline when backend rejects them.

## Known Backend Caveat

The frontend fails closed when refresh cannot recover a session, but the deployed backend currently appears to have cross-origin fingerprint/CORS issues. Because of that:

- direct browser calls from `http://localhost:5173` to the hosted backend can fail due to CORS
- local development against the hosted backend should go through the Vite dev proxy
- even with the proxy workaround, `refresh` and `logout` can remain unstable until the backend cookie configuration is corrected
