import { SessionView } from "../_components/session-view";

export default function NavigatePage() {
  return (
    <section aria-labelledby="navigate-heading" className="container">
      <h1 id="navigate-heading">Navigate</h1>
      <SessionView mode="navigate" />
    </section>
  );
}
