# Tournament Hub Frontend

React frontend for Tournament Hub authentication and tournament management flows.

The project now includes:

- registration page
- login page
- authenticated routing
- tournament creation flow
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

Default app URL:

http://localhost:5173
Environment

The frontend can target the deployed backend by default, but the API base URL can be overridden.

For local development against a local backend, create .env.local:

VITE_API_URL=http://localhost:3000/api/v1

Default fallback:

https://tournament-hub-backend.onrender.com/api/v1

For local development against the hosted backend, use the Vite dev proxy instead of calling the production origin directly from the browser.

Create .env.local from .env.example
Set:
VITE_API_URL=/api/v1
Run:
npm run dev

The Vite dev server proxies /api/* to:

https://tournament-hub-backend.onrender.com

This is a dev-only workaround, not a real backend fix. It exists because the hosted backend currently returns:

Access-Control-Allow-Origin: *
Access-Control-Allow-Credentials: true

which browsers reject for credentials: include requests.

Available Routes
/login public guest-only login page
/register public guest-only registration page
/ protected dashboard placeholder
/tournaments/create protected tournament creation page
/tournaments/:tournamentId protected tournament details page
Auth Contract

Frontend is built against these backend routes:

POST /auth/register
POST /auth/login
POST /auth/refresh
DELETE /auth/logout
GET /users/profile

Tournament routes currently used:

POST /tournaments

Client auth model:

access token and refresh token are stored in sessionStorage
auth requests send credentials: include for backend fingerprint cookie support
protected requests use Authorization: Bearer <accessToken>
refresh sends the refresh token in both the bearer header and request body

Stored keys:

tournament-hub.auth.access-token
tournament-hub.auth.refresh-token

Architecture Notes
src/app/App.tsx bootstraps auth once on app load
src/features/auth/hooks/use-auth-bootstrap.ts hydrates tokens from sessionStorage and attempts profile restoration
src/features/auth/api/auth-api.ts owns auth requests, token refresh, and retry-once reauthorization
src/features/auth/api/tournaments-api.ts owns tournament creation requests
src/features/auth/ui/route-guards.tsx protects private routes and redirects guest/authenticated users appropriately
src/features/auth/ui/auth-kit.tsx contains shared auth UI primitives used by both entry pages
tournament creation flow redirects users directly to tournament setup/details page after successful creation

More detailed docs:

Frontend Architecture
Core Design System
Scripts

Core workflow:

npm run dev
npm run test:run
npm run check

Additional scripts:

npm run typecheck
npm run lint
npm run lint:fix
npm run stylelint
npm run format
npm run build
Testing

The auth flow is covered at three levels:

unit tests for token storage and auth slice state transitions
integration tests for registration, login, and authenticated routing
MSW-based backend mocking for login/register/profile/refresh/logout behavior

Main test files:

src/features/auth/model/token-storage.test.ts
src/features/auth/model/auth-slice.test.ts
src/pages/auth/register-page.test.tsx
src/pages/auth/login-page.test.tsx
src/app/auth-routing.test.tsx
Manual Smoke Test
Open /
Expected: redirect to /login
Open /register
Expected: validation for empty and invalid fields
Register a new account
Expected:
loading state
redirect to /
tokens stored in sessionStorage
Log out from /
Expected:
redirect to /login
stored tokens cleared
Log in again
Expected:
redirect to /
invalid credentials shown inline when backend rejects them
Open /tournaments/create
Expected: tournament creation form is displayed
Submit valid tournament data
Expected:
successful redirect to /tournaments/:id
tournament details displayed
Submit empty form
Expected: validation errors displayed inline
Create a public/private tournament
Expected: visibility is reflected on the tournament page
Known Backend Caveat

The frontend fails closed when refresh cannot recover a session, but the deployed backend currently appears to have cross-origin fingerprint/CORS issues.

Because of that:

direct browser calls from http://localhost:5173 to the hosted backend can fail due to CORS
local development against the hosted backend should go through the Vite dev proxy
even with the proxy workaround, refresh and logout can remain unstable until the backend cookie configuration is corrected
```
