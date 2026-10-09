"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if (
    "standalone" in navigator &&
    (navigator as unknown as { standalone: boolean }).standalone
  ) {
    return true;
  }
  return false;
}

export function InstallPrompt() {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(isStandalone);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || isInstalled) return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      deferredPrompt.current = event as BeforeInstallPromptEvent;
      setCanInstall(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, [isInstalled]);

  const handleInstall = useCallback(async () => {
    const prompt = deferredPrompt.current;
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") {
      setCanInstall(false);
      setIsInstalled(true);
    }
    deferredPrompt.current = null;
  }, []);

  if (isInstalled) {
    return (
      <p className="install-status" role="status">
        Running as installed app.
      </p>
    );
  }

  if (!canInstall) return null;

  return (
    <div className="install-prompt">
      <p>Install blind-nav for faster access and fullscreen experience.</p>
      <button
        type="button"
        className="primary-button"
        onClick={() => void handleInstall()}
      >
        Install app
      </button>
    </div>
  );
}
