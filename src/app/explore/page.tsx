import { SessionView } from "../_components/session-view";

export default function ExplorePage() {
  return (
    <section aria-labelledby="explore-heading" className="container">
      <h1 id="explore-heading">Explore</h1>
      <SessionView mode="explore" />
    </section>
  );
}
