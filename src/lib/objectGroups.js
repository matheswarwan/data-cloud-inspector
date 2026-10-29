// Objects grouped and ordered by how often a Data Cloud developer reaches for them (feedback
// #1035): Profile DMOs (Individual first, then unified profiles and contact points), Engagement
// DMOs, other DMOs, calculated insights, segment membership, then DLOs. Within a group the usual
// standard objects come first, the rest alphabetically by label.

// Most used first. Strings are exact API names; regular expressions match org-specific names
// (unified DMOs carry the ruleset in their name).
const COMMON = [
  'ssot__Individual__dlm',
  /^Unified.*Individual/i,
  'ssot__ContactPointEmail__dlm',
  'ssot__ContactPointPhone__dlm',
  'ssot__ContactPointAddress__dlm',
  'ssot__PartyIdentification__dlm',
  /^Unified.*ContactPointEmail/i,
  /^Unified.*ContactPointPhone/i,
  /^UnifiedLink/i,
  'ssot__Account__dlm',
  'ssot__AccountContact__dlm',
  'ssot__ContactPointApp__dlm',
  'ssot__ContactPointSocial__dlm',
  'ssot__ContactPointConsent__dlm',
  'ssot__EmailEngagement__dlm',
  'ssot__MessageEngagement__dlm',
  'ssot__WebsiteEngagement__dlm',
  'ssot__ProductBrowseEngagement__dlm',
  'ssot__ShoppingCartEngagement__dlm',
  'ssot__SalesOrder__dlm',
  'ssot__SalesOrderProduct__dlm',
  'ssot__DeviceApplicationEngagement__dlm',
  'ssot__EngagementTopic__dlm',
  'ssot__Product__dlm',
  'ssot__Case__dlm',
  'ssot__Opportunity__dlm',
]

export const GROUPS = [
  { key: 'profile', label: 'Profile' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'dmo', label: 'Other data model objects' },
  { key: 'ci', label: 'Calculated insights' },
  { key: 'membership', label: 'Segment membership' },
  { key: 'dlo', label: 'Data lake objects' },
]

export function groupOf(o) {
  if (o.kind === 'CI') return 'ci'
  if (o.kind === 'DLO') return 'dlo'
  const c = String(o.category || '').toLowerCase()
  if (c === 'segment_membership') return 'membership'
  if (c === 'profile') return 'profile'
  if (c === 'engagement') return 'engagement'
  return 'dmo'
}

/** Position in COMMON (lower is more used), or Infinity. */
export function commonRank(name) {
  const i = COMMON.findIndex((p) => (typeof p === 'string' ? p === name : p.test(name)))
  return i < 0 ? Infinity : i
}

/** `[{ key, label, objects }]`, empty groups left out. */
export function groupObjects(objects) {
  const by = new Map(GROUPS.map((g) => [g.key, []]))
  for (const o of objects) by.get(groupOf(o)).push(o)
  return GROUPS.map((g) => ({
    ...g,
    objects: by.get(g.key).sort((a, b) => commonRank(a.name) - commonRank(b.name) || a.label.localeCompare(b.label)),
  })).filter((g) => g.objects.length)
}
