// @vitest-environment node
import { manifestSecurity, urlHosts, networkFiles, compare } from '../../../scripts/manifest-guard.mjs'

const base = { manifest: manifestSecurity({ permissions: ['storage', 'cookies'], host_permissions: ['https://*.my.salesforce.com/*'] }), urlHosts: ['www.w3.org'], networkFiles: ['src/background/fetchProxy.js'] }

describe('manifest guard', () => {
  it('passes the same state, whatever the permission order', () => {
    const now = { ...base, manifest: manifestSecurity({ permissions: ['cookies', 'storage'], host_permissions: ['https://*.my.salesforce.com/*'] }) }
    expect(compare(base, now)).toEqual([])
  })
  it('fails on a new permission, a new host and a new URL domain', () => {
    const now = { manifest: manifestSecurity({ permissions: ['cookies', 'storage', 'tabs'], host_permissions: ['<all_urls>'] }), urlHosts: ['www.w3.org', 'evil.example.com'], networkFiles: base.networkFiles }
    const problems = compare(base, now)
    expect(problems[0]).toMatch(/Manifest security fields changed/)
    expect(problems[1]).toMatch(/evil\.example\.com/)
  })
  it('finds network calls in code, not in comments', () => {
    const files = [
      { path: 'a.js', text: 'const f = deps.fetch || fetch\n' },
      { path: 'b.js', text: '// we fetch; nothing\n/* fetch(x) */ const fetchAll = 1' },
      { path: 'c.js', text: 'navigator.sendBeacon(u, d)' },
      { path: 'd.vue', text: '<p>or fetch one record</p> new WebSocket(u)' },
    ]
    expect(networkFiles(files)).toEqual(['a.js', 'c.js', 'd.vue'])
    expect(urlHosts(['see https://Diagramforce.com/x and http://www.w3.org/2000/svg'])).toEqual(['diagramforce.com', 'www.w3.org'])
  })
})
