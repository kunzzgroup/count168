/**
 * @deprecated Use `useDataCapturePageLifecycle` from DataCapturePage instead.
 */
import { callDataCaptureRuntime } from "./dataCaptureRuntime.js";

export async function initDataCaptureSpaPage() {
  callDataCaptureRuntime("recomputeSubmitState");
}
