export async function requestCapabilityPermission(
  name: "camera" | "location" | "microphone" | string,
): Promise<void> {
  if (typeof window === "undefined") return;

  if (name === "location" && typeof navigator !== "undefined" && navigator.geolocation) {
    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve(),
        () => resolve(),
        { timeout: 10000, enableHighAccuracy: false },
      );
    });
  } else if (
    name === "camera" &&
    typeof navigator !== "undefined" &&
    navigator.mediaDevices?.getUserMedia
  ) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      // Permission dismissed or denied
    }
  } else if (
    name === "microphone" &&
    typeof navigator !== "undefined" &&
    navigator.mediaDevices?.getUserMedia
  ) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      // Permission dismissed or denied
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("capabilities:refresh"));
  }
}