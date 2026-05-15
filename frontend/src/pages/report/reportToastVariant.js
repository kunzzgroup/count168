/** Map report page notify types to maintenance toast CSS variants. */
export function reportToastMaintenanceVariant(type) {
  if (type === "danger" || type === "error") return "error";
  if (type === "info") return "info";
  return "success";
}
