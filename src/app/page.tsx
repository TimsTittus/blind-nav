import { SessionPanel } from "./_components/session-panel";

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

      <SessionPanel />
    </section>
  );
}
