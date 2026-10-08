# `navigation/` — route & position reasoning

Owns **route/GPS** reasoning, kept deliberately separate from visual perception.
Supports Navigation Mode (go to a destination) and feeds context to Explore Mode.

## Status

**Phase 6 — implemented.** Location tracking (browser Geolocation), heading
abstraction (GPS course vs device orientation), destination search and route
acquisition behind a swappable `RoutingProvider` interface (fixture provider
first), and a `RouteTracker` with step progression, off-route detection
(debounced), and arrival.

## What's here

| File                          | Purpose                                               |
| ----------------------------- | ----------------------------------------------------- |
| `config.ts`                   | Thresholds, timeouts, GPS accuracy limits              |
| `state.ts`                    | Location controller state machine (7 states)           |
| `location-error.ts`           | Error types + Geolocation error classification         |
| `heading.ts`                  | GPS vs device-orientation heading resolution            |
| `geo-math.ts`                 | Haversine distance, bearing, point-to-segment distance |
| `location-controller.ts`      | Geolocation lifecycle (`watchPosition` wrapper)        |
| `routing-provider.ts`         | Abstract `RoutingProvider` interface                   |
| `fixture-routing-provider.ts` | Dev/test fixture provider (no network, no API key)     |
| `route-tracker.ts`            | Step progression, off-route, arrival                   |
| `use-location.ts`             | `useLocation()` React hook                             |
| `test-helpers.ts`             | Fake GPS positions, fake routes                        |
| `index.ts`                    | Barrel exports                                         |

## Location states

| State                | Meaning                                  |
| -------------------- | ---------------------------------------- |
| `unsupported`        | Browser has no Geolocation API           |
| `permission_required`| Initial — user hasn't been asked yet     |
| `permission_denied`  | User denied location permission          |
| `acquiring`          | Waiting for first GPS fix                |
| `active`             | Fresh fix available                      |
| `error`              | Position unavailable or timeout          |
| `stale`              | Last fix is older than the stale threshold|

## Off-route detection

When the user's position deviates beyond `offRouteThresholdMeters` from the
current route segment, a timer starts. The state transitions to `off_route`
only after `offRouteDebounceMs` of continuous deviation. This prevents false
positives from GPS jitter or brief signal loss.

## Rules

- GPS/route information is a **separate input** from visual perception; the two
  are reconciled by the Decision Engine, not blended in perception.
- Navigation proposes route intent; it never bypasses the Safety Engine.
- Handle permission denial, signal loss, and stale fixes as explicit states,
  never as silent failures.
- The `RoutingProvider` interface is the swap point: fixture now, a proper
  service later. Do not use OSM's public infrastructure as an unrestricted
  production backend.
