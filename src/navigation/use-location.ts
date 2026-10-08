"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  INITIAL_LOCATION_SNAPSHOT,
  LocationController,
} from "./location-controller";

const getServerSnapshot = () => INITIAL_LOCATION_SNAPSHOT;

export function useLocation() {
  const [controller] = useState(() => new LocationController());
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    getServerSnapshot,
  );

  useEffect(() => () => controller.stop(), [controller]);

  const actions = useMemo(
    () => ({
      start: () => controller.start(),
      stop: () => controller.stop(),
    }),
    [controller],
  );

  return {
    ...snapshot,
    ...actions,
  };
}

export type UseLocation = ReturnType<typeof useLocation>;
