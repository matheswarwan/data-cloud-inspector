// Manifest guard (CI and local). Fails when the built extension differs from the reviewed
// baseline in security/manifest-baseline.json:
//   - manifest security fields: permissions, hosts, oauth2 scopes, content scripts, CSP,
//     externally_connectable, web_accessible_resources, managed storage schema;
//   - URL hosts that appear anywhere in the built files (a new one can be a new network domain);
//   - source files that make network calls (fetch, XHR, sendBeacon, WebSocket, EventSource).
// A reviewed change updates the baseline in the same pull request:
//   node scripts/manifest-guard.mjs --update
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const BASELINE = join(root, 'security', 'manifest-baseline.json')
const FIELDS = ['permissions', 'optional_permissions', 'host_permissions', 'optional_host_permissions', 'oauth2', 'content_scripts', 'content_security_policy', 'externally_connectable', 'web_accessible_resources', 'storage', 'background']
// fetch as a call or as a value (`deps.fetch || fetch`), sendBeacon, XHR, sockets, importScripts.
const NETWORK = /(?<![.\w'"`/-])fetch\s*(\(|$|[),;}])|\bsendBeacon\s*\(|\bnew\s+(XMLHttpRequest|WebSocket|EventSource)\b|\bimportScripts\s*\(/m
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

function walk(dir, exts) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : walk(p, exts)
    return exts.some((e) => p.endsWith(e)) ? [p] : []
  })
}
const rel = (p) => relative(root, p).split(sep).join('/')

/** The security-relevant part of a manifest; arrays sorted so order does not matter. */
export function manifestSecurity(m) {
  const out = {}
  for (const k of FIELDS) if (m[k] !== undefined) out[k] = Array.isArray(m[k]) && m[k].every((x) => typeof x === 'string') ? [...m[k]].sort() : m[k]
  return out
}

/** Every host in http(s) URLs in the given texts, sorted. */
export function urlHosts(texts) {
  const hosts = new Set()
  for (const t of texts) for (const m of t.matchAll(/https?:\/\/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g)) hosts.add(m[1].toLowerCase())
  return [...hosts].sort()
}

/** Source files (path) that contain a network call. */
export function networkFiles(files) {
  return files.filter(({ text }) => NETWORK.test(stripComments(text))).map(({ path }) => path).sort()
}

export function compare(baseline, current) {
  const problems = []
  const a = JSON.stringify(baseline.manifest, null, 2)
  const b = JSON.stringify(current.manifest, null, 2)
  if (a !== b) problems.push(`Manifest security fields changed.\n--- baseline\n${a}\n--- now\n${b}`)
  const newHosts = current.urlHosts.filter((h) => !baseline.urlHosts.includes(h))
  if (newHosts.length) problems.push(`New URL hosts in the built files: ${newHosts.join(', ')}`)
  const newNet = current.networkFiles.filter((f) => !baseline.networkFiles.includes(f))
  if (newNet.length) problems.push(`New source files with network calls: ${newNet.join(', ')}`)
  return problems
}

export function currentState() {
  const dist = join(root, 'dist')
  const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'))
  const built = walk(dist, ['.js', '.html', '.json', '.css']).map((p) => readFileSync(p, 'utf8'))
  const src = walk(join(root, 'src'), ['.js', '.vue']).map((p) => ({ path: rel(p), text: readFileSync(p, 'utf8') }))
  return { manifest: manifestSecurity(manifest), urlHosts: urlHosts(built), networkFiles: networkFiles(src) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const now = currentState()
  if (process.argv.includes('--update')) {
    writeFileSync(BASELINE, `${JSON.stringify({ _about: 'Reviewed security baseline for scripts/manifest-guard.mjs. Change only in a reviewed pull request.', ...now }, null, 2)}\n`)
    console.log('security/manifest-baseline.json updated; review the diff.')
  } else {
    const problems = compare(JSON.parse(readFileSync(BASELINE, 'utf8')), now)
    if (problems.length) {
      console.error(`Manifest guard: ${problems.length} change(s) need review.\n\n${problems.join('\n\n')}\n\nIf intended: node scripts/manifest-guard.mjs --update, and explain it in the pull request.`)
      process.exit(1)
    }
    console.log(`Manifest guard: OK (${now.urlHosts.length} URL hosts, network calls only in ${now.networkFiles.join(', ')}).`)
  }
}
