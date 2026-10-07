"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CreateSessionInput } from "@/core";
import { useSession } from "../_session/use-session";
import { EmergencyStop } from "./emergency-stop";
import { SessionCreator } from "./session-creator";
import { SessionDetails } from "./session-details";

export function SessionPanel() {
  const { session, hydrated, start, stop, clear } = useSession();
  const router = useRouter();

  if (!hydrated) {
    return <p aria-live="polite">Preparing session…</p>;
  }

  if (session && session.status === "active") {
    return (
      <section aria-labelledby="active-session-heading">
        <h2 id="active-session-heading">Active session</h2>
        <SessionDetails session={session} />
        <div className="actions">
          {session.mode === "navigate" ? (
            <Link className="primary-button" href="/navigate">
              Continue
            </Link>
          ) : (
            <Link className="primary-button" href="/explore">
              Continue
            </Link>
          )}
          <EmergencyStop
            onStop={() => {
              stop();
              clear();
            }}
          />
        </div>
      </section>
    );
  }

  return (
    <SessionCreator
      onStart={(input: CreateSessionInput) => {
        const created = start(input);
        if (created.mode === "navigate") {
          router.push("/navigate");
        } else {
          router.push("/explore");
        }
      }}
    />
  );
}
