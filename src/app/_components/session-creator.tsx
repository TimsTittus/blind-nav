"use client";

import { useState } from "react";
import type { CreateSessionInput, Destination, SessionMode } from "@/core";
import {
  loadRecentDestinations,
  saveRecentDestination,
} from "./recent-destinations";

export function SessionCreator({
  onStart,
}: {
  onStart: (input: CreateSessionInput) => void;
}) {
  const [mode, setMode] = useState<SessionMode>("navigate");
  const [destination, setDestination] = useState("");
  const [recentDestinations] = useState<readonly Destination[]>(() =>
    loadRecentDestinations(),
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = destination.trim();

    if (mode === "navigate" && label.length > 0) {
      const dest: Destination = { id: crypto.randomUUID(), label };
      saveRecentDestination(dest);
      onStart({ mode, destination: dest });
    } else {
      onStart({ mode });
    }
  }

  function handleSelectRecent(dest: Destination) {
    setDestination(dest.label);
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

      {mode === "navigate" ? (
        <div className="field">
          <label htmlFor="destination">Destination</label>
          <input
            id="destination"
            name="destination"
            type="text"
            autoComplete="off"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="e.g. the corner shop"
            aria-describedby={
              recentDestinations.length > 0 ? "recent-hint" : undefined
            }
          />

          {recentDestinations.length > 0 ? (
            <div
              className="recent-destinations"
              role="group"
              aria-label="Recent destinations"
            >
              <p id="recent-hint" className="recent-destinations__label">
                Recent:
              </p>
              <ul className="recent-destinations__list">
                {recentDestinations.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      className="recent-destinations__item"
                      onClick={() => handleSelectRecent(d)}
                    >
                      {d.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        type="submit"
        className="primary-button"
        disabled={mode === "navigate" && destination.trim().length === 0}
      >
        {mode === "navigate" ? "Start navigation" : "Start exploring"}
      </button>
    </form>
  );
}
