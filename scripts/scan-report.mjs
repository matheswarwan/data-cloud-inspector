// Writes security/scans/<version>.md from the scanner outputs in a folder (CI release job, or
// locally after running the same tools):
//   node scripts/scan-report.mjs <results dir> <zip path>
// Expected files (missing ones are reported as "not run"): gitleaks.json, npm-audit.json,
// osv.json, semgrep.json, retire.json, guard.txt.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const json = (dir, f) => { try { return JSON.parse(readFileSync(join(dir, f), 'utf8')) } catch { return null } }

export function summarize(dir) {
  const rows = []
  const gl = json(dir, 'gitleaks.json')
  rows.push(['gitleaks (full history)', gl ? `${gl.length} leak(s)` : 'not run'])
  const na = json(dir, 'npm-audit.json')
  const v = na?.metadata?.vulnerabilities
  rows.push(['npm audit', v ? `${v.total} (critical ${v.critical}, high ${v.high}, moderate ${v.moderate}, low ${v.low})` : 'not run'])
  const osv = json(dir, 'osv.json')
  const osvCount = osv ? (osv.results || []).flatMap((r) => r.packages || []).flatMap((p) => p.vulnerabilities || []).length : null
  rows.push(['osv-scanner (lockfile; reviewed ignores in osv-scanner.toml)', osv ? `${osvCount} finding(s)` : 'not run'])
  const sg = json(dir, 'semgrep.json')
  rows.push(['semgrep (p/javascript, p/secrets, p/xss, p/owasp-top-ten)', sg ? `${sg.results.length} finding(s), ${sg.paths?.scanned?.length ?? '?'} files` : 'not run'])
  const rj = json(dir, 'retire.json')
  const rc = rj ? (rj.data || []).flatMap((x) => x.results || []).filter((r) => r.vulnerabilities?.length).length : null
  rows.push(['retire.js (dist/)', rj ? `${rc} vulnerable component(s)` : 'not run'])
  const guard = existsSync(join(dir, 'guard.txt')) ? readFileSync(join(dir, 'guard.txt'), 'utf8').trim().split('\n')[0] : 'not run'
  rows.push(['manifest guard (security/manifest-baseline.json)', guard])
  return rows
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, zip] = process.argv.slice(2)
  const version = JSON.parse(readFileSync(join(root, 'public', 'manifest.json'), 'utf8')).version
  const commit = execSync('git rev-parse HEAD', { cwd: root }).toString().trim()
  const hash = zip ? createHash('sha256').update(readFileSync(zip)).digest('hex') : 'no zip'
  const lines = [
    `# ${version} (commit ${commit})`,
    '',
    `**Automated, NOT independent.** Generated ${new Date().toISOString().slice(0, 10)} by ${process.env.GITHUB_ACTIONS ? `GitHub Actions run ${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : 'a local run'}.`,
    '',
    `- Package: \`${zip ? basename(zip) : '-'}\``,
    `- SHA-256: \`${hash}\``,
    '',
    '| Check | Result |',
    '|---|---|',
    ...summarize(dir).map(([k, r]) => `| ${k} | ${r} |`),
    '',
  ]
  mkdirSync(join(root, 'security', 'scans'), { recursive: true })
  const out = join(root, 'security', 'scans', `${version}.md`)
  writeFileSync(out, lines.join('\n'))
  console.log(`Wrote ${out}`)
}
