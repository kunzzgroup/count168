/** Phase 4f — all capture types migrated to React; legacy paste is non-SPA only. */

export const MIGRATED_PASTE_TYPES = new Set([
  "1.Text",
  "2.Format",
  "CITIBET",
  "4.RETURN",
  "API_RETURN",
  "VPOWER",
  "AGENT_LINK",
  "WBET",
  "WBET_API",
  "INVOICE",
  "2.SPECIAL",
  "3.API",
  "AWC",
  "PEGASUS",
  "ALIPAY",
  "C8PLAY",
  "MAXBET",
]);

export function setLegacyPasteContext(captureType, mode = "fallback") {
  window.__DC_LEGACY_PASTE_CTX__ = {
    captureType,
    mode,
    skipAutoDetect: true,
    skipPrimaryBlocks: true,
  };
}

export function clearLegacyPasteContext() {
  delete window.__DC_LEGACY_PASTE_CTX__;
}
