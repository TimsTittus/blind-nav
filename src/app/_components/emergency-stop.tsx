/** Always-available stop. The accessible name stays "Stop session" even when
 * the visible label is shortened (e.g. "STOP"). */
export function EmergencyStop({
  onStop,
  label = "Stop session",
}: {
  onStop: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      className="stop-button"
      aria-label="Stop session"
      onClick={onStop}
    >
      {label}
    </button>
  );
}
