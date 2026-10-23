// Ten random people to try a lookup with (feedback #105): Profiles and Bulk lookup offer them
// when the search box is empty. One query: Individual with an email and phone where there is one.

const IND = 'ssot__Individual__dlm'
const EMAIL = 'ssot__ContactPointEmail__dlm'
const PHONE = 'ssot__ContactPointPhone__dlm'

/** The SQL for `n` random people, using only the objects the org has. */
export function samplesSql(objectNames, n = 10) {
  const has = (x) => objectNames.includes(x)
  if (!has(IND)) return ''
  const cols = ['i.ssot__Id__c AS id', 'MAX(i.ssot__FirstName__c) AS first_name', 'MAX(i.ssot__LastName__c) AS last_name']
  const joins = []
  if (has(EMAIL)) { cols.push('MAX(e.ssot__EmailAddress__c) AS email'); joins.push(`LEFT JOIN ${EMAIL} e ON e.ssot__PartyId__c = i.ssot__Id__c`) }
  if (has(PHONE)) { cols.push('MAX(p.ssot__TelephoneNumber__c) AS phone'); joins.push(`LEFT JOIN ${PHONE} p ON p.ssot__PartyId__c = i.ssot__Id__c`) }
  return [`SELECT ${cols.join(', ')}`, `FROM ${IND} i`, ...joins, 'GROUP BY i.ssot__Id__c', 'ORDER BY RANDOM()', `LIMIT ${n}`].join('\n')
}

/** `[{ name, email, phone, id, value }]` from the query result; `value` is what to search for. */
export function samplesFrom(result) {
  const cols = (result?.columns || []).map((c) => c.name)
  const at = (row, k) => { const i = cols.indexOf(k); return i < 0 || row[i] == null ? '' : String(row[i]) }
  return (result?.rows || []).map((r) => {
    const s = { id: at(r, 'id'), name: [at(r, 'first_name'), at(r, 'last_name')].filter(Boolean).join(' '), email: at(r, 'email'), phone: at(r, 'phone') }
    return { ...s, value: s.email || s.phone || s.id }
  }).filter((s) => s.value)
}
