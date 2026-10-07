import { z } from "zod";

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_APP_ENV: z.enum(["development", "test", "production"]).optional(),
});

export type PublicEnv = z.infer<typeof PublicEnvSchema>;

export const publicEnv: PublicEnv = PublicEnvSchema.parse({
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
});
