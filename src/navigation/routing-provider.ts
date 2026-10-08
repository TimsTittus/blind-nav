import type { LatLng, Route } from "@/core";

export interface GeocodingResult {
  id: string;
  name: string;
  coords: LatLng;
  address?: string;
}

export interface RoutingProvider {
  geocode(query: string): Promise<GeocodingResult[]>;
  getWalkingRoute(origin: LatLng, destination: LatLng): Promise<Route>;
}
