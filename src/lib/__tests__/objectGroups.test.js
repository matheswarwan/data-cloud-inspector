import { describe, it, expect } from 'vitest'
import { groupObjects } from '../objectGroups.js'

const o = (name, kind, category = '', label = name) => ({ name, kind, category, label })

describe('groupObjects (feedback #1035)', () => {
  it('groups by use and puts the usual objects first', () => {
    const g = groupObjects([
      o('Zeta__dlm', 'DMO', 'Profile', 'Aardvark'),
      o('ssot__ContactPointEmail__dlm', 'DMO', 'Profile'),
      o('UnifiedssotIndividualRs1__dlm', 'DMO', 'Profile'),
      o('ssot__Individual__dlm', 'DMO', 'Profile'),
      o('ssot__EmailEngagement__dlm', 'DMO', 'Engagement'),
      o('Thing__dll', 'DLO'),
      o('Individual_SM_1__dlm', 'DMO', 'Segment_Membership'),
      o('Misc__dlm', 'DMO', 'Other'),
      o('Ltv__cio', 'CI'),
    ])
    expect(g.map((x) => x.key)).toEqual(['profile', 'engagement', 'dmo', 'ci', 'membership', 'dlo'])
    expect(g[0].objects.map((x) => x.name)).toEqual(['ssot__Individual__dlm', 'UnifiedssotIndividualRs1__dlm', 'ssot__ContactPointEmail__dlm', 'Zeta__dlm'])
  })
})
