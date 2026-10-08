import type { Destination } from "@/core";

const STORAGE_KEY = "blind-nav:recent-destinations";
const MAX_RECENT = 5;

export function loadRecentDestinations(): readonly Destination[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDestinationLike).slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function saveRecentDestination(destination: Destination): void {
  try {
    const existing = loadRecentDestinations().filter(
      (d) => d.label !== destination.label,
    );
    const updated = [destination, ...existing].slice(0, MAX_RECENT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // localStorage unavailable — silently skip
  }
}

function isDestinationLike(value: unknown): value is Destination {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as Destination).id === "string" &&
    "label" in value &&
    typeof (value as Destination).label === "string"
  );
}
