// After a release: download the CRX the Chrome Web Store serves and compare it, file by file,
// with our zip. The store adds _metadata/ (its signed hashes) and may add `update_url` or
// `key` to the manifest; those are reported, not counted as differences.
//   node scripts/verify-store.mjs <extension id> <our zip> [report.md]
// Exit code 1 when any file differs, is missing or is extra.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

const STORE_ADDS = new Set(['update_url', 'key'])
const sha = (b) => createHash('sha256').update(b).digest('hex')

/** The zip inside a CRX3 file ("Cr24", version 3, header length, header, zip). */
export function crxToZip(buf) {
  if (buf.subarray(0, 4).toString('latin1') !== 'Cr24') throw new Error('Not a CRX file (no Cr24 magic)')
  const version = buf.readUInt32LE(4)
  if (version !== 3) throw new Error(`CRX version ${version}; only CRX3 is handled`)
  return buf.subarray(12 + buf.readUInt32LE(8))
}

async function entries(zipBuf) {
  const zip = await JSZip.loadAsync(zipBuf)
  const out = new Map()
  for (const f of Object.values(zip.files)) if (!f.dir) out.set(f.name, await f.async('nodebuffer'))
  return out
}

export async function compareZips(storeZip, ourZip) {
  const store = await entries(storeZip)
  const ours = await entries(ourZip)
  const diff = { same: 0, changed: [], missing: [], extra: [], storeOnly: [], manifestAdded: [] }
  for (const [name, buf] of ours) {
    const theirs = store.get(name)
    if (!theirs) { diff.missing.push(name); continue }
    if (name === 'manifest.json') {
      const a = JSON.parse(buf.toString('utf8'))
      const b = JSON.parse(theirs.toString('utf8'))
      for (const k of Object.keys(b)) if (!(k in a) && STORE_ADDS.has(k)) { diff.manifestAdded.push(k); delete b[k] }
      if (JSON.stringify(a) === JSON.stringify(b)) diff.same++
      else diff.changed.push(name)
    } else if (sha(buf) === sha(theirs)) diff.same++
    else diff.changed.push(name)
  }
  for (const name of store.keys()) {
    if (ours.has(name)) continue
    if (name.startsWith('_metadata/')) diff.storeOnly.push(name)
    else diff.extra.push(name)
  }
  diff.ok = !diff.changed.length && !diff.missing.length && !diff.extra.length
  diff.storeVersion = JSON.parse(store.get('manifest.json')?.toString('utf8') || '{}').version
  return diff
}

export const crxUrl = (id, chrome = '140.0.0.0') =>
  `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${chrome}&acceptformat=crx3&x=${encodeURIComponent(`id=${id}&installsource=ondemand&uc`)}`

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [id, zipPath, reportPath] = process.argv.slice(2)
  if (!/^[a-p]{32}$/.test(id || '') || !zipPath) { console.error('usage: node scripts/verify-store.mjs <extension id> <our zip> [report.md]'); process.exit(1) }
  const res = await fetch(crxUrl(id))
  if (!res.ok) { console.error(`Download failed: HTTP ${res.status}`); process.exit(1) }
  const crx = Buffer.from(await res.arrayBuffer())
  const ourZip = readFileSync(zipPath)
  const d = await compareZips(crxToZip(crx), ourZip)
  const lines = [
    `# Store package check: ${id}`,
    '',
    `Checked ${new Date().toISOString()}. Store version ${d.storeVersion}; our zip \`${zipPath.split('/').pop()}\` (SHA-256 \`${sha(ourZip)}\`); store CRX SHA-256 \`${sha(crx)}\`.`,
    '',
    `**Result: ${d.ok ? 'the store package has exactly our files' : 'DIFFERENT'}.** ${d.same} files identical.`,
    '',
    `- Changed: ${d.changed.join(', ') || 'none'}`,
    `- In our zip, not in the store package: ${d.missing.join(', ') || 'none'}`,
    `- In the store package, not in our zip: ${d.extra.join(', ') || 'none'}`,
    `- Added by the store (expected): ${[...d.storeOnly, ...d.manifestAdded.map((k) => `manifest "${k}"`)].join(', ') || 'none'}`,
    '',
  ]
  const text = lines.join('\n')
  if (reportPath) { mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, text) }
  console.log(text)
  process.exit(d.ok ? 0 : 1)
}
