import { describe, it, expect } from 'vitest'
import { profileMemory, rememberProfile, groupIndex, groupPath, forgetAll } from '../profileMemory.js'

describe('profile memory (feedback #1037)', () => {
  it('starts empty for another org and keeps the newest 15 profiles', () => {
    const m = profileMemory('org1|default')
    m.search = { text: 'ann' }
    for (let i = 0; i < 20; i++) rememberProfile(m, `/profile/s/${i}`, { i })
    expect(m.profiles.size).toBe(15)
    expect(m.profiles.has('/profile/s/0')).toBe(false)
    expect(profileMemory('org1|default').search).toEqual({ text: 'ann' })
    const other = profileMemory('org2|default')
    expect(other.search).toBe(null)
    expect(other.profiles.size).toBe(0)
    forgetAll(other)
    expect(other.key).toBe('org2|default')
  })
  it('finds the result a profile route shows', () => {
    const groups = [{ unifiedId: 'U1', sources: [{ id: 'a' }, { id: 'b' }] }, { unifiedId: null, sources: [{ id: 'c' }] }]
    expect(groupIndex(groups, 'u', 'U1')).toBe(0)
    expect(groupIndex(groups, 's', 'b')).toBe(0)
    expect(groupIndex(groups, 's', 'c')).toBe(1)
    expect(groupIndex(groups, 's', 'z', 'U1')).toBe(0)
    expect(groupIndex(groups, 's', 'z')).toBe(-1)
    expect(groups.map(groupPath)).toEqual(['/profile/u/U1', '/profile/s/c'])
  })
})
