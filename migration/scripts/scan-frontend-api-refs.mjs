/**
 * 扫描 js/ 与 dashboard-web/src 中对 PHP API 的引用，生成 migration/generated/frontend-api-refs.json
 * 用法（在 count168test 目录）： node migration/scripts/scan-frontend-api-refs.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const OUT_DIR = path.join(ROOT, 'migration', 'generated')
const OUT_FILE = path.join(OUT_DIR, 'frontend-api-refs.json')

const SCAN_ROOTS = [path.join(ROOT, 'js'), path.join(ROOT, 'dashboard-web', 'src')]

const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'assets'])

const EXT = /\.(js|jsx|mjs)$/i

/** 归一化：统一为相对站点根的 api/... 或根级 *.php；去掉 query */
function normalizeMatch(raw) {
  let s = raw.trim()
  if (s.startsWith('./')) s = s.slice(2)
  if (s.startsWith('/api/')) s = s.slice(1) // api/...
  s = s.split('?')[0].split('#')[0]
  return s
}

const VALID_PHP = /^api\/[a-zA-Z0-9_./-]+\.php$/
const VALID_ROOT_PHP = /^(getaccountapi|domainapi|roleapi|session_check|login_bootstrap|spring_login_proxy)\.php$/
/** 无 .php 的显式路径（bridge / Spring） */
const VALID_NO_EXT = /^api\/auth\/login$/

function walk(dir, files) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const ent of entries) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (SKIP_DIR.has(ent.name)) continue
      walk(p, files)
    } else if (EXT.test(ent.name)) {
      files.push(p)
    }
  }
}

function extractLineRefs(content, relPath) {
  const lines = content.split(/\r?\n/)
  const found = []

  const isValidApiRef = (n) => {
    if (!n || n.length > 200) return false
    if (VALID_PHP.test(n) || VALID_ROOT_PHP.test(n) || VALID_NO_EXT.test(n)) return true
    return false
  }

  const tryPush = (lineIdx, raw) => {
    if (!raw) return
    const n = normalizeMatch(raw)
    if (isValidApiRef(n)) found.push({ key: n, loc: `${relPath}:${lineIdx + 1}` })
  }

  lines.forEach((line, i) => {
    const reApiPhp = /(?:['"`])([^'"`]*api\/[^'"`]+\.php[^'"`]*)/gi
    const reRootPhp =
      /(?:['"`])((?:getaccountapi|domainapi|roleapi|session_check|login_bootstrap|spring_login_proxy)\.php[^'"`]*)/gi
    const reAbsApi = /(?:['"`])(\/api\/[^'"`]+)/gi
    let m
    while ((m = reApiPhp.exec(line))) tryPush(i, m[1])
    reApiPhp.lastIndex = 0
    while ((m = reRootPhp.exec(line))) tryPush(i, m[1])
    while ((m = reAbsApi.exec(line))) tryPush(i, m[1])
  })

  return found
}

function main() {
  const files = []
  for (const r of SCAN_ROOTS) {
    if (fs.existsSync(r)) walk(r, files)
  }

  /** @type {Record<string, string[]>} */
  const refs = {}

  for (const abs of files) {
    const rel = path.relative(ROOT, abs).replace(/\\/g, '/')
    const content = fs.readFileSync(abs, 'utf8')
    for (const { key, loc } of extractLineRefs(content, rel)) {
      if (!refs[key]) refs[key] = []
      if (!refs[key].includes(loc)) refs[key].push(loc)
    }
  }

  for (const k of Object.keys(refs)) refs[k].sort()

  const sortedKeys = Object.keys(refs).sort()
  /** @type {Record<string, string[]>} */
  const sortedRefs = {}
  for (const k of sortedKeys) sortedRefs[k] = refs[k]

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

  const payload = {
    generatedAt: new Date().toISOString(),
    scanRoots: SCAN_ROOTS.map((p) => path.relative(ROOT, p).replace(/\\/g, '/')),
    totalUniqueRefs: sortedKeys.length,
    refs: sortedRefs
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8')
  console.log(`Wrote ${OUT_FILE} (${sortedKeys.length} unique refs)`)
}

main()
