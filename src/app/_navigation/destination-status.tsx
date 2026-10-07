export function DestinationStatus({
  destination,
  nextStep,
}: {
  destination: string | null;
  nextStep: string | null;
}) {
  return (
    <dl className="destination">
      <div>
        <dt>Destination</dt>
        <dd>{destination ?? "Not set"}</dd>
      </div>
      <div>
        <dt>Next</dt>
        <dd>{nextStep ?? "Unavailable"}</dd>
      </div>
    </dl>
  );
}
