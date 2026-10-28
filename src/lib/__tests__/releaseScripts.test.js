// @vitest-environment node
import JSZip from 'jszip'
import { crxToZip, compareZips, crxUrl } from '../../../scripts/verify-store.mjs'
import { itemPath, publish } from '../../../scripts/cws.mjs'

const zipOf = async (files) => { const z = new JSZip(); for (const [k, v] of Object.entries(files)) z.file(k, v); return z.generateAsync({ type: 'nodebuffer' }) }
const crxOf = (zip) => { const h = Buffer.alloc(12); h.write('Cr24', 0, 'latin1'); h.writeUInt32LE(3, 4); h.writeUInt32LE(5, 8); return Buffer.concat([h, Buffer.from('HEADR'), zip]) }

describe('store package check', () => {
  it('reads the zip inside a CRX3 and accepts what the store adds', async () => {
    const ours = await zipOf({ 'manifest.json': '{"version":"1.0.8"}', 'a.js': 'x' })
    const store = await zipOf({ 'manifest.json': '{"version":"1.0.8","update_url":"https://clients2.google.com/service/update2/crx"}', 'a.js': 'x', '_metadata/verified_contents.json': '[]' })
    const d = await compareZips(crxToZip(crxOf(store)), ours)
    expect(d).toMatchObject({ ok: true, same: 2, storeOnly: ['_metadata/verified_contents.json'], manifestAdded: ['update_url'], storeVersion: '1.0.8' })
  })
  it('reports changed, missing and extra files', async () => {
    const ours = await zipOf({ 'manifest.json': '{}', 'a.js': 'x', 'b.js': 'y' })
    const store = await zipOf({ 'manifest.json': '{"permissions":["tabs"]}', 'a.js': 'CHANGED', 'c.js': 'z' })
    const d = await compareZips(store, ours)
    expect(d).toMatchObject({ ok: false, changed: ['manifest.json', 'a.js'], missing: ['b.js'], extra: ['c.js'] })
    expect(() => crxToZip(Buffer.from('PK..'))).toThrow(/Cr24/)
    expect(crxUrl('a'.repeat(32))).toContain('x=id%3D' + 'a'.repeat(32))
  })
})

describe('Chrome Web Store client', () => {
  it('checks IDs and calls the v2 publish endpoint without leaking the token', async () => {
    expect(() => itemPath({ publisherId: 'p1', extensionId: 'bad' })).toThrow(/32-letter/)
    let seen
    const fetchFn = async (url, init) => { seen = { url, init }; return { ok: true, text: async () => '{"state":"PENDING_REVIEW"}' } }
    const r = await publish({ token: 'T', publisherId: 'pub-1', extensionId: 'b'.repeat(32), fetchFn })
    expect(r.state).toBe('PENDING_REVIEW')
    expect(seen.url).toBe(`https://chromewebstore.googleapis.com/v2/publishers/pub-1/items/${'b'.repeat(32)}:publish`)
    const failing = async () => ({ ok: false, status: 403, text: async () => '{"error":"denied"}' })
    await expect(publish({ token: 'SECRET', publisherId: 'p', extensionId: 'b'.repeat(32), fetchFn: failing })).rejects.toThrow(/HTTP 403/)
    await expect(publish({ token: 'SECRET', publisherId: 'p', extensionId: 'b'.repeat(32), fetchFn: failing })).rejects.not.toThrow(/SECRET/)
  })
})
