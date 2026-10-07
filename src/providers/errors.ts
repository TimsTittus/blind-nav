import type { z } from "zod";
import { InvalidModelResponseError } from "@/core";

export { AiProviderError, InvalidModelResponseError } from "@/core";

export function invalidModelResponse(
  error: z.ZodError,
  message?: string,
): InvalidModelResponseError {
  return InvalidModelResponseError.fromZodError(error, message);
}
