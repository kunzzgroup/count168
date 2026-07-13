/** Universal Smart Paste Engine — public exports (Phase 1). */

export {
  isSmartPasteUniversalEnabled,
  SMART_PASTE_SKIP_CAPTURE_TYPES,
} from "./featureFlag.js";
export { ClipboardCaptureService, clipboardCaptureService } from "./ClipboardCaptureService.js";
export { ParserEngine, parserEngine } from "./ParserEngine.js";
export { CleaningEngine, cleaningEngine } from "./CleaningEngine.js";
export { HeaderDetectionEngine, headerDetectionEngine } from "./HeaderDetectionEngine.js";
export { RuleMappingEngine, ruleMappingEngine } from "./RuleMappingEngine.js";
export { ConfidenceEngine, confidenceEngine } from "./ConfidenceEngine.js";
export { ValidationEngine, validationEngine } from "./ValidationEngine.js";
export {
  DataCaptureImporter,
  dataCaptureImporter,
  detectedTableToMatrix,
  accountingRecordsToMatrix,
} from "./DataCaptureImporter.js";
export {
  SmartPasteOrchestrator,
  smartPasteOrchestrator,
  trySmartPasteUniversal,
} from "./SmartPasteOrchestrator.js";
