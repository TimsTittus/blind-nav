"use client";

import { useEffect, useState } from "react";
import { detectAll, INITIAL_CAPABILITIES } from "./detect";
import type { CapabilitySet } from "./types";

export function useCapabilities(): CapabilitySet {
  const [caps, setCaps] = useState<CapabilitySet>(INITIAL_CAPABILITIES);

  useEffect(() => {
    let cancelled = false;

    void detectAll().then((result) => {
      if (!cancelled) setCaps(result);
    });

    const onPermissionChange = () => {
      void detectAll().then((result) => {
        if (!cancelled) setCaps(result);
      });
    };

    const unsubscribers: Array<() => void> = [];

    if (typeof window !== "undefined") {
      window.addEventListener("focus", onPermissionChange);
      window.addEventListener("capabilities:refresh", onPermissionChange);
      unsubscribers.push(() => {
        window.removeEventListener("focus", onPermissionChange);
        window.removeEventListener("capabilities:refresh", onPermissionChange);
      });
    }

    if (
      typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.addEventListener === "function"
    ) {
      navigator.mediaDevices.addEventListener(
        "devicechange",
        onPermissionChange,
      );
      unsubscribers.push(() => {
        navigator.mediaDevices?.removeEventListener(
          "devicechange",
          onPermissionChange,
        );
      });
    }
    if (typeof navigator !== "undefined" && navigator.permissions) {
      for (const name of ["camera", "microphone", "geolocation"]) {
        void navigator.permissions
          .query({ name: name as PermissionName })
          .then((status) => {
            if (cancelled) return;
            const handler = () => onPermissionChange();
            status.addEventListener("change", handler);
            unsubscribers.push(() =>
              status.removeEventListener("change", handler),
            );
          })
          .catch(() => {});
      }
    }

    return () => {
      cancelled = true;
      unsubscribers.forEach((unsub) => unsub());
    };
  }, []);

  return caps;
}
