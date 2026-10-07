import { SafetyIndicator } from "./safety-indicator";
import type { StatusCategory } from "./status";

/** Sits on top of the camera area: safety category + a simulated-data badge. */
export function NavigationStatusOverlay({
  category,
}: {
  category: StatusCategory;
}) {
  return (
    <div className="status-overlay">
      <SafetyIndicator category={category} />
      <p className="badge">Simulated data</p>
    </div>
  );
}
