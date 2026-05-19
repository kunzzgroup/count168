/** Phase 4e — context passed when React delegates to legacy paste fallback. */

export const MIGRATED_PASTE_TYPES = new Set([
  "1.Text",
  "CITIBET",
  "2.Format",
  "4.RETURN",
  "API_RETURN",
  "VPOWER",
  "AGENT_LINK",
  "WBET",
  "WBET_API",
]);

/**
 * @param {string} captureType
 * @param {'primary' | 'fallback'} mode
 */
export function setLegacyPasteContext(captureType, mode = "fallback") {
  const skipPrimaryBlocks =
    mode === "primary" || MIGRATED_PASTE_TYPES.has(captureType);

  window.__DC_LEGACY_PASTE_CTX__ = {
    captureType,
    mode,
    skipAutoDetect: true,
    skipPrimaryBlocks,
  };
}

export function clearLegacyPasteContext() {
  delete window.__DC_LEGACY_PASTE_CTX__;
}
