/**
 * ConfidenceEngine — no AI branch.
 * >=90 auto, 80-89 warning, <80 warning (still use best rule result).
 */
export class ConfidenceEngine {
  /**
   * @param {{ mappings: Array<{ confidence: number }>, overallConfidence?: number }} mappingResult
   * @param {{ samplePassRate?: number }} [opts]
   */
  evaluate(mappingResult, opts = {}) {
    const mappingScore =
      mappingResult?.overallConfidence != null
        ? Number(mappingResult.overallConfidence)
        : average(mappingResult?.mappings?.map((m) => m.confidence));

    const samplePassRate =
      opts.samplePassRate != null && Number.isFinite(opts.samplePassRate)
        ? Number(opts.samplePassRate)
        : 1;

    const score = Math.round(mappingScore * 0.6 + samplePassRate * 100 * 0.4);

    let band = "reject_soft";
    if (score >= 90) band = "auto";
    else if (score >= 80) band = "warning";
    else band = "warning_low";

    return {
      score: Math.max(0, Math.min(100, score)),
      band,
      autoAccept: score >= 90,
      warning: score < 90,
    };
  }
}

function average(nums) {
  const arr = (nums || []).filter((n) => Number.isFinite(n));
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export const confidenceEngine = new ConfidenceEngine();
