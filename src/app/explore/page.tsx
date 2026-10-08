import { ExploreScreen } from "../_explore/explore-screen";

export default function ExplorePage() {
  return (
    <section aria-labelledby="explore-heading" className="container">
      <h1 id="explore-heading">Explore</h1>
      <ExploreScreen />
    </section>
  );
}
