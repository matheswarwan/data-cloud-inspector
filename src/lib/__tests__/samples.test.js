import { describe, it, expect } from 'vitest'
import { samplesSql, samplesFrom } from '../samples.js'

describe('samples', () => {
  it('joins email and phone when the org has them', () => {
    const sql = samplesSql(['ssot__Individual__dlm', 'ssot__ContactPointEmail__dlm', 'ssot__ContactPointPhone__dlm'])
    expect(sql).toContain('LEFT JOIN ssot__ContactPointEmail__dlm e ON e.ssot__PartyId__c = i.ssot__Id__c')
    expect(sql).toContain('LEFT JOIN ssot__ContactPointPhone__dlm p')
    expect(sql).toMatch(/ORDER BY RANDOM\(\)\nLIMIT 10$/)
    expect(samplesSql(['ssot__Individual__dlm'])).not.toContain('JOIN')
    expect(samplesSql([])).toBe('')
  })
  it('reads rows and picks email, then phone, then id', () => {
    const result = { columns: [{ name: 'id' }, { name: 'first_name' }, { name: 'last_name' }, { name: 'email' }, { name: 'phone' }], rows: [
      ['003a', 'Greg', 'Walker', 'g@example.com', '(415) 555-0100'],
      ['003b', 'Ann', null, null, '(415) 555-0101'],
      ['003c', null, null, null, null],
    ] }
    expect(samplesFrom(result).map((s) => [s.name, s.value])).toEqual([['Greg Walker', 'g@example.com'], ['Ann', '(415) 555-0101'], ['', '003c']])
    expect(samplesFrom(null)).toEqual([])
  })
})
