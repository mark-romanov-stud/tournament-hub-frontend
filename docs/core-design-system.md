# Core Design System

## Scope

The current design system is intentionally small and focused on the auth entry flow.

It exists to support:

- login page
- registration page
- protected dashboard placeholder

It is not yet a full application-wide design system for tables, navigation, data grids, or tournament management views.

## Visual Direction

The auth flow uses a bright editorial look:

- cold blue brand palette
- frosted white surfaces
- soft gradients and glow layers
- strong rounded cards and controls
- high-contrast headings with minimal ornament

This matches the provided mobile mock direction instead of falling back to generic default dashboard styling.

## Design Tokens

Primary token groups live in [src/index.css](/Users/mromanov/extra/tournament-hub-frontend/src/index.css):

- page background colors and gradients
- surface and border colors
- text hierarchy colors
- brand and accent colors
- shadow scale
- radius scale
- font families

These variables are intended to be the first place to change when theming auth-related screens.

## Core Primitives

Shared UI primitives live in [src/features/auth/ui/auth-kit.tsx](/Users/mromanov/extra/tournament-hub-frontend/src/features/auth/ui/auth-kit.tsx).

Current primitives:

- `AuthShell`
- `BrandLogo`
- `SurfaceCard`
- `TextField`
- `PasswordField`
- `PrimaryButton`
- `SecondaryButton`
- `AuthLinkAction`
- `InlineMessage`
- `StatTile`
- `StatusStrip`
- `QuotePanel`

Supporting icons are implemented as inline SVG components to avoid adding an icon library dependency.

## Component Rules

### Forms

- labels are always visible
- validation is shown inline near the field or as form-level error blocks
- primary actions own the loading label
- password fields expose a built-in visibility toggle

### Layout

- mobile-first composition
- large cards remain centered and readable on desktop
- decorative panels never block form completion

### Status and Feedback

- backend errors are rendered from response `message[]`
- disabled elements are visibly inactive rather than hidden
- session restoration uses a neutral loading screen instead of flashing protected content

## CSS Strategy

The design system is implemented in global CSS because:

- the project is still small
- design tokens need to be shared across route screens
- the auth kit relies on consistent class-based styling without runtime styling overhead

The auth CSS keeps component-oriented naming local to the auth system. A file-level stylelint exception is used in `src/index.css` so the component class naming stays readable without loosening the repository-wide lint config.

## Extension Guidance

If the app grows beyond auth:

1. Keep adding shared primitives before introducing page-specific wrappers.
2. Promote repeated spacing/color patterns into tokens first.
3. Add new UI kits per domain only when the shared auth kit stops being an appropriate abstraction.
4. Avoid mixing tournament data widgets into the auth kit; that should become a separate application design layer.
