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

export const LocationStateSchema = z.object({
  coords: LatLngSchema,
  accuracyMeters: MetersSchema.optional(),
  altitudeMeters: z.number().optional(),
  speedMps: SpeedMpsSchema.optional(),
  timestamp: EpochMillisSchema,
});

export const HeadingStateSchema = z.object({
  degrees: HeadingDegreesSchema,
  accuracyDegrees: z.number().min(0).optional(),
  timestamp: EpochMillisSchema,
});

export const DestinationSchema = z.object({
  id: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  coords: LatLngSchema.optional(),
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
});

export const RouteSchema = z.object({
  id: UuidSchema,
  destination: DestinationSchema,
  steps: z.array(RouteStepSchema),
  totalDistanceMeters: MetersSchema.optional(),
  createdAt: EpochMillisSchema,
});

export type LocationState = z.infer<typeof LocationStateSchema>;
export type HeadingState = z.infer<typeof HeadingStateSchema>;
export type Destination = z.infer<typeof DestinationSchema>;
export type Maneuver = z.infer<typeof ManeuverSchema>;
export type RouteStep = z.infer<typeof RouteStepSchema>;
export type Route = z.infer<typeof RouteSchema>;
