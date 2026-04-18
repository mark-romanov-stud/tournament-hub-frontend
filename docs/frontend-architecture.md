# Frontend Architecture

## Goal

This frontend currently centers on the authentication entry flow:

- registration
- login
- protected routing
- minimal authenticated landing screen

The code is organized so auth state, API integration, and shared UI primitives stay isolated from route pages.

## Layers

### App Layer

Main files:

- [src/app/App.tsx](/Users/mromanov/extra/tournament-hub-frontend/src/app/App.tsx)
- [src/app/router/router.tsx](/Users/mromanov/extra/tournament-hub-frontend/src/app/router/router.tsx)
- [src/app/providers/store.ts](/Users/mromanov/extra/tournament-hub-frontend/src/app/providers/store.ts)

Responsibilities:

- create the router
- mount Redux
- run auth bootstrap on application startup
- provide browser and memory router variants for runtime and tests

### Feature Layer

Auth is grouped under `src/features/auth`.

Submodules:

- `api/`: RTK Query endpoints and reauth logic
- `model/`: auth state, types, token persistence
- `hooks/`: higher-level auth orchestration
- `ui/`: route guards and reusable auth components
- `lib/`: API error helpers

This keeps transport, storage, and rendering concerns separate.

### Page Layer

Main pages:

- [src/pages/auth/register-page.tsx](/Users/mromanov/extra/tournament-hub-frontend/src/pages/auth/register-page.tsx)
- [src/pages/auth/login-page.tsx](/Users/mromanov/extra/tournament-hub-frontend/src/pages/auth/login-page.tsx)
- [src/pages/home/home-page.tsx](/Users/mromanov/extra/tournament-hub-frontend/src/pages/home/home-page.tsx)

Pages handle:

- form state
- client validation
- user-facing error rendering
- page composition from shared auth primitives

Pages do not own token storage or retry logic directly.

## Auth Flow

### Login and Registration

1. User submits form.
2. Page calls RTK Query mutation.
3. Backend returns `{ accessToken, refreshToken }` inside the common response envelope.
4. Tokens are persisted to `sessionStorage`.
5. Frontend fetches `/users/profile`.
6. On success, Redux auth state is populated and the user is redirected to `/`.

### App Bootstrap

Bootstrap is handled by [src/features/auth/hooks/use-auth-bootstrap.ts](/Users/mromanov/extra/tournament-hub-frontend/src/features/auth/hooks/use-auth-bootstrap.ts).

Sequence:

1. Read tokens from `sessionStorage`.
2. If no tokens exist, mark bootstrap complete and keep user signed out.
3. If tokens exist, fetch `/users/profile`.
4. If the profile request returns `401`, RTK Query base query attempts a single refresh.
5. If refresh succeeds, tokens are replaced and the original request is retried.
6. If refresh fails, local auth state is cleared and the app fails closed to guest mode.

### Route Protection

[src/features/auth/ui/route-guards.tsx](/Users/mromanov/extra/tournament-hub-frontend/src/features/auth/ui/route-guards.tsx) provides two guards:

- `ProtectedRoute`
  - blocks `/` for unauthenticated users
  - redirects to `/login`
- `GuestRoute`
  - blocks `/login` and `/register` for authenticated users
  - redirects to `/`

During bootstrap both guards show a neutral session restoration screen instead of rendering stale content.

## State Management

Redux store currently contains:

- `auth` slice for session/bootstrap/user state
- `counter` starter slice
- `authApi` RTK Query reducer

`auth` slice is intentionally small:

- bootstrap status
- tokens
- current user

The network cache remains inside RTK Query rather than being duplicated manually in Redux.

## API Client Strategy

[src/features/auth/api/auth-api.ts](/Users/mromanov/extra/tournament-hub-frontend/src/features/auth/api/auth-api.ts) uses `fetchBaseQuery`.

Important behavior:

- `Authorization` header is attached automatically for protected requests
- `credentials: 'include'` is enabled for backend fingerprint cookie support
- refresh sends the refresh token in both the bearer header and JSON body
- only one refresh attempt is made per failed protected request
- failed refresh clears client auth state

### Local Development Against Hosted Backend

[vite.config.ts](/Users/mromanov/extra/tournament-hub-frontend/vite.config.ts) includes a Vite dev proxy for `/api`.

This supports a specific local workflow:

1. Create `.env.local`.
2. Set `VITE_API_URL=/api/v1`.
3. Run the frontend through Vite dev server.

In that mode, browser requests stay same-origin to `http://localhost:5173`, while Vite forwards `/api/*` to `https://tournament-hub-backend.onrender.com`.

This is intentionally documented as a dev-only workaround. It does not fix the deployed backend contract itself, and refresh/logout can still be unreliable until backend CORS and cookie settings are corrected.

## Testing Strategy

### Unit

- token persistence behavior
- auth slice transitions

### Integration

- registration validation, success, and error flows
- login success and invalid credentials
- route protection and bootstrap restoration
- expired token refresh path

### Mocking

MSW handlers in [src/test/handlers.ts](/Users/mromanov/extra/tournament-hub-frontend/src/test/handlers.ts) emulate:

- register
- login
- profile
- refresh
- logout

This keeps tests close to actual network behavior without depending on the real backend.
