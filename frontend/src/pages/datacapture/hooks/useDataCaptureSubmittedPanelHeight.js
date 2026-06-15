import { useRef } from "react";

/** Refs for the top form band; equal card height is handled via CSS grid stretch. */
export function useDataCaptureSubmittedPanelHeight() {
  const topSectionRef = useRef(null);
  const formColumnRef = useRef(null);

  return { topSectionRef, formColumnRef };
}
