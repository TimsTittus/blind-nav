export {
  detectAll,
  detectCamera,
  detectLocalPerception,
  detectLocation,
  detectMicrophone,
  detectOrientation,
  detectSpeech,
  INITIAL_CAPABILITIES,
} from "./detect";
export type { CapabilityReport, CapabilitySet, CapabilityState } from "./types";
export { CHECKING_REPORT } from "./types";
export { useCapabilities } from "./use-capabilities";
