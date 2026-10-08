import { z } from "zod";
import {
  EpochMillisSchema,
  HeadingDegreesSchema,
  LatLngSchema,
  MetersSchema,
  NonEmptyStringSchema,
  SpeedMpsSchema,
  UuidSchema,
} from "./primitives";

export const HeadingSourceSchema = z.enum([
  "gps",
  "device_orientation",
  "unknown",
]);

export const LocationStateSchema = z.object({
  coords: LatLngSchema,
  accuracyMeters: MetersSchema.optional(),
  altitudeMeters: z.number().optional(),
  speedMps: SpeedMpsSchema.optional(),
  heading: HeadingDegreesSchema.optional(),
  timestamp: EpochMillisSchema,
});

export const HeadingStateSchema = z.object({
  degrees: HeadingDegreesSchema,
  source: HeadingSourceSchema,
  accuracyDegrees: z.number().min(0).optional(),
  timestamp: EpochMillisSchema,
});

export const DestinationSchema = z.object({
  id: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  coords: LatLngSchema.optional(),
  address: NonEmptyStringSchema.optional(),
});

export const ManeuverSchema = z.enum([
  "depart",
  "straight",
  "turn-left",
  "turn-right",
  "slight-left",
  "slight-right",
  "cross",
  "arrive",
  "other",
]);

export const RouteStepSchema = z.object({
  id: NonEmptyStringSchema,
  index: z.number().int().min(0),
  instruction: NonEmptyStringSchema,
  distanceMeters: MetersSchema.optional(),
  maneuver: ManeuverSchema.optional(),
  startsAt: LatLngSchema.optional(),
  endsAt: LatLngSchema.optional(),
  bearing: HeadingDegreesSchema.optional(),
});

export const RouteSchema = z.object({
  id: UuidSchema,
  destination: DestinationSchema,
  origin: LatLngSchema.optional(),
  steps: z.array(RouteStepSchema),
  totalDistanceMeters: MetersSchema.optional(),
  totalDurationSeconds: z.number().min(0).optional(),
  createdAt: EpochMillisSchema,
});

export type HeadingSource = z.infer<typeof HeadingSourceSchema>;
export type LocationState = z.infer<typeof LocationStateSchema>;
export type HeadingState = z.infer<typeof HeadingStateSchema>;
export type Destination = z.infer<typeof DestinationSchema>;
export type Maneuver = z.infer<typeof ManeuverSchema>;
export type RouteStep = z.infer<typeof RouteStepSchema>;
export type Route = z.infer<typeof RouteSchema>;
