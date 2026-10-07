/** Abstraction over `document.visibilityState` so it can be faked in tests. */
export interface VisibilitySource {
  isHidden(): boolean;
  subscribe(listener: () => void): () => void;
}

const NEVER_HIDDEN: VisibilitySource = {
  isHidden: () => false,
  subscribe: () => () => {},
};

export function documentVisibility(
  doc: Document | undefined = typeof document === "undefined"
    ? undefined
    : document,
): VisibilitySource {
  if (!doc) return NEVER_HIDDEN;
  return {
    isHidden: () => doc.visibilityState === "hidden",
    subscribe(listener) {
      doc.addEventListener("visibilitychange", listener);
      return () => doc.removeEventListener("visibilitychange", listener);
    },
  };
}
