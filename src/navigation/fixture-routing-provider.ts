import type { LatLng, Route } from "@/core";
import { bearingBetween, haversineDistance } from "./geo-math";
import type { GeocodingResult, RoutingProvider } from "./routing-provider";

const FIXTURE_DESTINATIONS: GeocodingResult[] = [
  {
    id: "fix-park",
    name: "Central Park",
    coords: { lat: 40.7829, lng: -73.9654 },
    address: "Central Park, New York, NY",
  },
  {
    id: "fix-library",
    name: "Public Library",
    coords: { lat: 40.7532, lng: -73.9822 },
    address: "476 5th Ave, New York, NY",
  },
  {
    id: "fix-station",
    name: "Grand Central Station",
    coords: { lat: 40.7527, lng: -73.9772 },
    address: "89 E 42nd St, New York, NY",
  },
];

function buildFixtureRoute(origin: LatLng, destination: LatLng): Route {
  const totalDistance = haversineDistance(origin, destination);
  const stepCount = Math.max(2, Math.ceil(totalDistance / 100));
  const steps: Route["steps"] = [];

  for (let i = 0; i < stepCount; i++) {
    const fraction = i / (stepCount - 1);
    const coord: LatLng = {
      lat: origin.lat + (destination.lat - origin.lat) * fraction,
      lng: origin.lng + (destination.lng - origin.lng) * fraction,
    };
    const nextFraction = Math.min(1, (i + 1) / (stepCount - 1));
    const nextCoord: LatLng = {
      lat: origin.lat + (destination.lat - origin.lat) * nextFraction,
      lng: origin.lng + (destination.lng - origin.lng) * nextFraction,
    };

    const isFirst = i === 0;
    const isLast = i === stepCount - 1;
    const stepDistance = isLast ? 0 : haversineDistance(coord, nextCoord);

    steps.push({
      id: `step-${String(i)}`,
      index: i,
      instruction: isFirst
        ? "Head toward your destination."
        : isLast
          ? "You have arrived."
          : `Continue for ${Math.round(stepDistance)} meters.`,
      distanceMeters: stepDistance,
      maneuver: isFirst ? "depart" : isLast ? "arrive" : "straight",
      startsAt: coord,
      endsAt: isLast ? undefined : nextCoord,
      bearing: isLast ? undefined : bearingBetween(coord, nextCoord),
    });
  }

  const walkingSpeedMps = 1.4;
  return {
    id: crypto.randomUUID(),
    destination: { id: "fixture-dest", label: "Fixture destination" },
    origin,
    steps,
    totalDistanceMeters: totalDistance,
    totalDurationSeconds: totalDistance / walkingSpeedMps,
    createdAt: Date.now(),
  };
}

export class FixtureRoutingProvider implements RoutingProvider {
  async geocode(query: string): Promise<GeocodingResult[]> {
    const lower = query.toLowerCase();
    return FIXTURE_DESTINATIONS.filter(
      (d) =>
        d.name.toLowerCase().includes(lower) ||
        (d.address?.toLowerCase().includes(lower) ?? false),
    );
  }

  async getWalkingRoute(origin: LatLng, destination: LatLng): Promise<Route> {
    return buildFixtureRoute(origin, destination);
  }
}
