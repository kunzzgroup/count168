import { routeConfig } from '../routeConfig.js'

/** legacy *.php 文件名 → SPA Hash 路径（routeConfig 已登记、非 fullPage） */
const LEGACY_TO_SPA_PATH = new Map(
  routeConfig
    .filter((r) => !r.fullPage && r.legacyFile && r.legacyFile !== 'index.php')
    .map((r) => [r.legacyFile, r.path])
)

export function spaPathForLegacyPhp(legacyFile) {
  return LEGACY_TO_SPA_PATH.get(legacyFile) ?? null
}
