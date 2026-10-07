import { z } from "zod";

export const NonEmptyStringSchema = z.string().min(1);

export const UuidSchema = z.uuid();

export const EpochMillisSchema = z.number().int().min(0);

export const ConfidenceSchema = z.number().min(0).max(1);

export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const HeadingDegreesSchema = z.number().min(0).max(360);

export const MetersSchema = z.number().min(0);

export const SpeedMpsSchema = z.number().min(0);

export type Uuid = z.infer<typeof UuidSchema>;
export type EpochMillis = z.infer<typeof EpochMillisSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type LatLng = z.infer<typeof LatLngSchema>;
