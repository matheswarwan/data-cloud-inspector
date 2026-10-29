import { describe, it, expect } from 'vitest'
import {
  fieldLabel, rowCard, indicators, personFacts, contactKind, contactValue, groupContacts, linkRows,
  emailDomain, membershipFacts, membershipChanges, isHistory, engagementTitle, byMonth, plural,
} from '../personCards.js'

describe('personCards', () => {
  it('labels fields in plain words', () => {
    expect(fieldLabel('ssot__ContractEndDate__c')).toBe('Contract end date')
    expect(fieldLabel('RATE_PLAN_CD__c')).toBe('Rate plan cd')
  })

  it('makes a card from a row: name, chips, fields, date', () => {
    const c = rowCard({ ssot__Id__c: '101', Service_Name__c: 'Home internet', Status__c: 'Open', ssot__DataSourceId__c: 'BQ', Rate_Plan__c: 'X1', Opened_Date__c: '2018-10-02', Party__c: 'p1', KQ_Id__c: 'k' }, { skip: ['Party__c'] })
    expect(c.title).toBe('Home internet')
    expect(c.chips.map((x) => x.text)).toEqual(['BQ', 'Status Open'])
    expect(c.fields.map((f) => f.label)).toEqual(['Rate plan', 'Opened date'])
    expect(c.date).toEqual({ label: 'Opened date', value: '2018-10-02' })
    expect(c.id).toBe('101')
  })

  it('falls back to the ID as the title', () => {
    expect(rowCard({ ssot__Id__c: '29444781', Market__c: 'RES' })).toMatchObject({ title: '29444781', titleMono: true })
  })

  it('finds true flags and short facts on the person', () => {
    const row = { Privilege_Flag__c: 'true', Move_Valet_Ind__c: 'Y', ssot__IsDeceased__c: false, Status__c: '1', ssot__PreferredLanguage__c: 'E' }
    expect(indicators(row)).toEqual(['Privilege', 'Move valet'])
    expect(personFacts(row)).toEqual([{ label: 'Preferred language', value: 'E' }])
  })

  it('groups contact points by address across sources', () => {
    expect(contactKind('ssot__ContactPointPhone__dlm')).toBe('phone')
    expect(contactValue({ ssot__EmailAddress__c: 'A@x.com' }, 'email')).toBe('A@x.com')
    const g = groupContacts([
      { object: 'ssot__ContactPointPhone__dlm', rows: [{ ssot__Id__c: 'p1', ssot__TelephoneNumber__c: '(905) 555-0100' }] },
      { object: 'ssot__ContactPointEmail__dlm', rows: [
        { ssot__Id__c: 'e1', ssot__EmailAddress__c: 'A@x.com', ssot__DataSourceId__c: 'BQ' },
        { ssot__Id__c: 'e2', ssot__EmailAddress__c: 'a@x.com', ssot__DataSourceId__c: 'SFMC', ssot__IsPrimary__c: 'true' },
      ] },
    ])
    expect(g.map((c) => [c.kind, c.sources.length, c.primary])).toEqual([['email', 2, true], ['phone', 1, false]])
    expect(emailDomain('A@X.com')).toBe('x.com')
  })

  it('links related rows that hold a contact point ID', () => {
    const contacts = groupContacts([{ object: 'ssot__ContactPointPhone__dlm', rows: [{ ssot__Id__c: '82083613', ssot__TelephoneNumber__c: '1' }] }])
    const svc = { Service_Id__c: '82083613', Party__c: 'ind1' }
    const other = { Service_Id__c: '999999', Party__c: 'ind1' }
    const { byContact, linked } = linkRows(contacts, [{ object: 'Services__dlm', otherField: 'Party__c', rows: [svc, other] }], ['ind1'])
    expect(byContact.get(0).map((l) => l.row)).toEqual([svc])
    expect(linked.has(other)).toBe(false)
  })

  it('reads segment membership and its changes', () => {
    expect(isHistory('Individual_SMH_x__dlm')).toBe(true)
    expect(membershipFacts({ Segment_Id__c: 's1', Snapshot_Type__c: 'NEW', Timestamp__c: '2026-05-01T00:00:00Z' })).toMatchObject({ segment: 's1', kind: 'new' })
    const rows = [
      { Segment_Id__c: 's1', Snapshot_Type__c: 'new', Timestamp__c: '2026-09-01' },
      { Segment_Id__c: 's1', Snapshot_Type__c: 'removed', Timestamp__c: '2026-09-29' },
      { Segment_Id__c: 's1', Snapshot_Type__c: 'new', Timestamp__c: '2026-10-01' },
      { Segment_Id__c: 's1', Snapshot_Type__c: 'existing', Timestamp__c: '2026-10-02' },
      { Segment_Id__c: 's2', Snapshot_Type__c: 'existing', Timestamp__c: '2026-10-02' },
    ]
    const c = membershipChanges(rows)
    expect(c).toHaveLength(1)
    expect(c[0].events.map((e) => e.kind)).toEqual(['added', 'removed', 'added back'])
    expect(c[0].since).toBe(1)
  })

  it('names engagement rows and groups them by month', () => {
    expect(engagementTitle({ ssot__Id__c: '1', ssot__CampaignName__c: 'Fall launch' })).toBe('Fall launch')
    const m = byMonth([{ time: '2026-10-22T10:00:00Z' }, { time: '2026-10-02T10:00:00Z' }, { time: '2026-09-11T10:00:00Z' }, { time: null }])
    expect(m.map((x) => x.items.length)).toEqual([2, 1, 1])
    expect(m[2].month).toBe('No date')
  })

  it('makes tile labels plural', () => {
    expect(plural('Service', 8)).toBe('services')
    expect(plural('Party Identification', 2)).toBe('party identifications')
    expect(plural('Policy', 3)).toBe('policies')
  })
})
