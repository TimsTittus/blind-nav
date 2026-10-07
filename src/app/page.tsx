/**
 * Placeholder landing page for the foundation phase.
 *
 * This intentionally contains NO application features (no camera, AI,
 * navigation, GPS, or speech). It exists so the scaffold builds, renders, and
 * can be verified for baseline accessibility. Feature work begins in a later
 * phase per docs/architecture.md.
 */
export default function HomePage() {
  return (
    <section aria-labelledby="page-heading" className="container">
      <h1 id="page-heading">blind-nav</h1>
      <p>
        Browser-based prototype for AI-assisted navigation and obstacle
        awareness for visually impaired users.
      </p>
      <p role="note" className="disclaimer">
        Prototype only. This system does not guarantee obstacle or collision
        avoidance and is not a certified mobility, safety, or medical device. Do
        not rely on it for safety. Always use your established mobility aids and
        techniques.
      </p>
      <p>
        The engineering foundation is in place. Application features are not yet
        implemented. See <code>docs/architecture.md</code> for the planned
        system design.
      </p>
    </section>
  );
}
