import type { LatLng } from "@/core";

const EARTH_RADIUS_METERS = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function haversineDistance(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function bearingBetween(from: LatLng, to: LatLng): number {
  const dLng = toRad(to.lng - from.lng);
  const fromLat = toRad(from.lat);
  const toLat = toRad(to.lat);
  const y = Math.sin(dLng) * Math.cos(toLat);
  const x =
    Math.cos(fromLat) * Math.sin(toLat) -
    Math.sin(fromLat) * Math.cos(toLat) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function distanceToSegment(
  point: LatLng,
  segStart: LatLng,
  segEnd: LatLng,
): number {
  const d = haversineDistance(segStart, segEnd);
  if (d === 0) return haversineDistance(point, segStart);

  const dStartToPoint = haversineDistance(segStart, point);
  const dEndToPoint = haversineDistance(segEnd, point);
  const dStartToEnd = d;

  const s = (dStartToPoint + dEndToPoint + dStartToEnd) / 2;
  const area = Math.sqrt(
    Math.max(
      0,
      s * (s - dStartToPoint) * (s - dEndToPoint) * (s - dStartToEnd),
    ),
  );
  const perpendicular = (2 * area) / dStartToEnd;

  const alongStart = Math.sqrt(
    Math.max(0, dStartToPoint * dStartToPoint - perpendicular * perpendicular),
  );
  const alongEnd = Math.sqrt(
    Math.max(0, dEndToPoint * dEndToPoint - perpendicular * perpendicular),
  );

  if (alongStart > dStartToEnd || alongEnd > dStartToEnd) {
    return Math.min(dStartToPoint, dEndToPoint);
  }

  return perpendicular;
}
