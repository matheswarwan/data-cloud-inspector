// Reproducible package: zips dist/ with sorted paths, a fixed date and fixed file modes, so the
// same commit built with `npm ci && npm run build` always gives the same bytes. Writes
//   out/data-cloud-inspector-<version>-<commit>.zip  and  .zip.sha256  (sha256sum format)
// Copy the zip to releases/ by hand (or in CI) when it is a release; this never overwrites one.
//   node scripts/package.mjs            package the current dist/
//   node scripts/package.mjs --verify   build twice (clean) and check the hashes match
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const FIXED_DATE = new Date(Date.UTC(1980, 0, 1, 0, 0, 0))

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

export async function zipDist() {
  const zip = new JSZip()
  for (const p of files(dist).map((f) => relative(dist, f).split(sep).join('/')).sort()) {
    zip.file(p, readFileSync(join(dist, p)), { date: FIXED_DATE, unixPermissions: 0o644, createFolders: false })
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 }, platform: 'UNIX' })
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

async function main() {
  const verify = process.argv.includes('--verify')
  const build = () => execSync('npm run build', { cwd: root, stdio: 'ignore' })
  if (verify) build()
  const buf = await zipDist()
  const version = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8')).version
  let commit = 'nogit'
  try { commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim() } catch { /* not a checkout */ }
  const dirty = (() => { try { return execSync('git status --porcelain -- src public scripts package.json package-lock.json', { cwd: root }).toString().trim() !== '' } catch { return false } })()
  const name = `data-cloud-inspector-${version}-${commit}${dirty ? '-dirty' : ''}.zip`
  const hash = sha256(buf)
  if (verify) {
    rmSync(dist, { recursive: true, force: true })
    build()
    const again = sha256(await zipDist())
    console.log(again === hash ? `Reproducible: ${hash}` : `NOT reproducible: ${hash} then ${again}`)
    if (again !== hash) process.exit(1)
  }
  mkdirSync(join(root, 'out'), { recursive: true })
  writeFileSync(join(root, 'out', name), buf)
  writeFileSync(join(root, 'out', `${name}.sha256`), `${hash}  ${name}\n`)
  console.log(`out/${name}\n${buf.length} bytes\nsha256 ${hash}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
