export { LOCATION_CONFIG } from "./config";
export { LOCATION_STATES, transitionLocation } from "./state";
export type { LocationControllerState, LocationEvent } from "./state";
export { classifyGeolocationError, UNSUPPORTED_ERROR } from "./location-error";
export type { LocationError, LocationErrorKind } from "./location-error";
export { resolveHeading } from "./heading";
export type { DeviceOrientationHeading, GpsHeading } from "./heading";
export {
  bearingBetween,
  distanceToSegment,
  haversineDistance,
} from "./geo-math";
export {
  INITIAL_LOCATION_SNAPSHOT,
  LocationController,
} from "./location-controller";
export type {
  LocationControllerDeps,
  LocationSnapshot,
} from "./location-controller";
export type { GeocodingResult, RoutingProvider } from "./routing-provider";
export { FixtureRoutingProvider } from "./fixture-routing-provider";
export { IDLE_TRACKER_STATE, RouteTracker } from "./route-tracker";
export type {
  RouteStatus,
  RouteTrackerOptions,
  RouteTrackerState,
} from "./route-tracker";
export { useLocation } from "./use-location";
export type { UseLocation } from "./use-location";
