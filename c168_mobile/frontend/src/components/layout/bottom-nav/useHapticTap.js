/**
 * Optional haptic feedback for nav taps (iOS/Android where supported).
 * Call on pointerdown for <100ms perceived response.
 */
export function triggerNavHaptic() {
  if (typeof navigator === "undefined") return;
  try {
    navigator.vibrate?.(8);
  } catch {
    /* ignore */
  }
}

/** Hook wrapper for components that need a stable callback. */
export function useHapticTap() {
  return { triggerHaptic: triggerNavHaptic };
}
