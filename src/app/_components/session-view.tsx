"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SessionMode } from "@/core";
import { useSession } from "../_session/use-session";
import { EmergencyStop } from "./emergency-stop";
import { SessionDetails } from "./session-details";

export function SessionView({ mode }: { mode: SessionMode }) {
  const { session, hydrated, stop, clear } = useSession();
  const router = useRouter();

  if (!hydrated) {
    return <p aria-live="polite">Preparing session…</p>;
  }

  if (!session) {
    return (
      <p>
        No active session. <Link href="/">Start one on the home page.</Link>
      </p>
    );
  }

  return (
    <>
      {session.mode !== mode ? (
        <p role="note" className="disclaimer">
          This session is in <strong>{session.mode}</strong> mode. Open the{" "}
          {session.mode === "navigate" ? (
            <Link href="/navigate">navigate page</Link>
          ) : (
            <Link href="/explore">explore page</Link>
          )}{" "}
          to match it.
        </p>
      ) : null}

      <SessionDetails session={session} />

      <p>
        This is a placeholder. Live{" "}
        {mode === "navigate" ? "navigation" : "exploration"} (camera,
        perception, safety, and spoken guidance) is not implemented yet.
      </p>

      <div className="actions">
        <EmergencyStop
          onStop={() => {
            stop();
            clear();
            router.push("/");
          }}
        />
      </div>
    </>
  );
}
