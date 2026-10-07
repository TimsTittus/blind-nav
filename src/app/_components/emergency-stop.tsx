export function EmergencyStop({ onStop }: { onStop: () => void }) {
  return (
    <button type="button" className="stop-button" onClick={onStop}>
      Stop session
    </button>
  );
}
