"use client";

import { useState } from "react";
import type { CreateSessionInput, SessionMode } from "@/core";

export function SessionCreator({
  onStart,
}: {
  onStart: (input: CreateSessionInput) => void;
}) {
  const [mode, setMode] = useState<SessionMode>("navigate");
  const [destination, setDestination] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = destination.trim();
    const input: CreateSessionInput =
      mode === "navigate" && label.length > 0
        ? { mode, destination: { id: crypto.randomUUID(), label } }
        : { mode };
    onStart(input);
  }

  return (
    <form onSubmit={handleSubmit} aria-labelledby="session-creator-heading">
      <h2 id="session-creator-heading">Start a session</h2>

      <fieldset>
        <legend>Mode</legend>
        <label className="choice">
          <input
            type="radio"
            name="mode"
            value="navigate"
            checked={mode === "navigate"}
            onChange={() => setMode("navigate")}
          />
          Navigate to a destination
        </label>
        <label className="choice">
          <input
            type="radio"
            name="mode"
            value="explore"
            checked={mode === "explore"}
            onChange={() => setMode("explore")}
          />
          Explore my surroundings
        </label>
      </fieldset>

      <div className="field">
        <label htmlFor="destination">Destination (optional)</label>
        <input
          id="destination"
          name="destination"
          type="text"
          autoComplete="off"
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          disabled={mode !== "navigate"}
          placeholder="e.g. the corner shop"
        />
      </div>

      <button type="submit" className="primary-button">
        Start session
      </button>
    </form>
  );
}
