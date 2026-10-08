import { describe, expect, it } from "vitest";
import { FixtureRoutingProvider } from "./fixture-routing-provider";

describe("FixtureRoutingProvider", () => {
  const provider = new FixtureRoutingProvider();

  describe("geocode", () => {
    it("returns matching destinations by name", async () => {
      const results = await provider.geocode("park");
      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe("Central Park");
    });

    it("returns matching destinations by address", async () => {
      const results = await provider.geocode("5th Ave");
      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe("Public Library");
    });

    it("is case-insensitive", async () => {
      const results = await provider.geocode("GRAND CENTRAL");
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe("fix-station");
    });

    it("returns empty array for no match", async () => {
      const results = await provider.geocode("zzz no match");
      expect(results).toHaveLength(0);
    });

    it("returns multiple matches", async () => {
      const results = await provider.geocode("New York");
      expect(results.length).toBeGreaterThan(1);
    });
  });

  describe("getWalkingRoute", () => {
    it("returns a route with steps", async () => {
      const origin = { lat: 40.75, lng: -73.99 };
      const destination = { lat: 40.76, lng: -73.98 };
      const route = await provider.getWalkingRoute(origin, destination);

      expect(route.steps.length).toBeGreaterThanOrEqual(2);
      expect(route.origin).toEqual(origin);
      expect(route.totalDistanceMeters).toBeGreaterThan(0);
      expect(route.totalDurationSeconds).toBeGreaterThan(0);
    });

    it("first step is depart, last step is arrive", async () => {
      const origin = { lat: 40.75, lng: -73.99 };
      const destination = { lat: 40.76, lng: -73.98 };
      const route = await provider.getWalkingRoute(origin, destination);

      expect(route.steps[0]?.maneuver).toBe("depart");
      expect(route.steps[route.steps.length - 1]?.maneuver).toBe("arrive");
    });

    it("steps have sequential indices", async () => {
      const origin = { lat: 40.75, lng: -73.99 };
      const destination = { lat: 40.76, lng: -73.98 };
      const route = await provider.getWalkingRoute(origin, destination);

      route.steps.forEach((step, i) => {
        expect(step.index).toBe(i);
      });
    });

    it("intermediate steps have bearing", async () => {
      const origin = { lat: 40.75, lng: -73.99 };
      const destination = { lat: 40.76, lng: -73.98 };
      const route = await provider.getWalkingRoute(origin, destination);

      for (const step of route.steps.slice(0, -1)) {
        expect(step.bearing).toBeDefined();
      }
    });

    it("last step has zero distance", async () => {
      const origin = { lat: 40.75, lng: -73.99 };
      const destination = { lat: 40.76, lng: -73.98 };
      const route = await provider.getWalkingRoute(origin, destination);

      expect(route.steps[route.steps.length - 1]?.distanceMeters).toBe(0);
    });
  });
});
