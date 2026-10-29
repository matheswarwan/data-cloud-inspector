import { describe, it, expect } from 'vitest'
import { findCreditObjects, guessFields, dailySql, totalsSql, orgsSql, shapeDaily, shapeTotals, envName, sortEnvs, forecast, balances, cutoffDate } from '../credits.js'

const f = (name, type = 'TEXT') => ({ name, label: name, type, businessType: type })
const daily = { name: 'TenantDailyEntitlementConsumption__dll', kind: 'DLO', fields: [f('utilizationdate__c', 'DATE'), f('carddefinitiondevelopername__c'), f('unitsconsumed__c', 'NUMBER'), f('usageconsumed__c', 'NUMBER'), f('usagebusinessenvtype__c'), f('coreorgid__c'), f('DataSource__c')] }
const hourly = { name: 'TenantHourlyEntitlementConsumption__dll', kind: 'DLO', fields: [f('usagehourbucket__c', 'DATE_TIME'), f('resourcetype__c'), f('unitsconsumed__c', 'NUMBER'), f('rowdetail__c'), f('entitlementbusinessenvtype__c'), f('businessenvtype__c'), f('UsageReportingOrgId__c')] }
const enriched = { name: 'TenantEnrichedUsageEvent__dll', kind: 'DLO', fields: [f('eventtime__c', 'DATE_TIME'), f('cardname__c'), f('unitsconsumed__c', 'NUMBER'), f('usagevalue__c', 'NUMBER'), f('usagebusinessenvtype__c'), f('usagereportingorgid__c'), f('entitlementorgid__c')] }
const realEnt = { name: 'TenantEntitlementTransaction__dll', kind: 'DLO', fields: [f('startdate__c', 'DATE_TIME'), f('entitlementcarddefdevlname__c'), f('quantity__c', 'NUMBER'), f('rawquantity__c', 'NUMBER'), f('businessenvtype__c')] }
const ent = { name: 'TenantEntitlementTransaction__dll', kind: 'DLO', fields: [f('CardDefinitionDeveloperName__c'), f('Quantity__c', 'NUMBER'), f('TransactionDate__c', 'DATE')] }
const odd = { name: 'TenantBillingUsageEvent__dlm', kind: 'DMO', fields: [f('ssot__Id__c'), f('When__c', 'DATE_TIME'), f('Amount2__c', 'NUMBER')] }

describe('credits (#145)', () => {
  it('finds the consumption objects, DLO first', () => {
    const found = findCreditObjects([odd, { name: 'Other__dll', kind: 'DLO', fields: [] }, ent, daily, hourly, { ...odd, name: 'TenantBillingUsageEvent__dll', kind: 'DLO' }])
    expect(found.map((x) => `${x.role.id}:${x.object.name}`)).toEqual([
      'daily:TenantDailyEntitlementConsumption__dll', 'hourly:TenantHourlyEntitlementConsumption__dll',
      'events:TenantBillingUsageEvent__dll', 'events:TenantBillingUsageEvent__dlm', 'entitlements:TenantEntitlementTransaction__dll',
    ])
  })
  it('guesses fields by known names, then by type', () => {
    expect(guessFields(daily)).toEqual({ date: 'utilizationdate__c', amount: 'unitsconsumed__c', group: 'carddefinitiondevelopername__c', status: '', env: 'usagebusinessenvtype__c', org: '' })
    expect(guessFields(hourly)).toEqual({ date: 'usagehourbucket__c', amount: 'unitsconsumed__c', group: 'resourcetype__c', status: 'rowdetail__c', env: 'businessenvtype__c', org: 'UsageReportingOrgId__c' })
    expect(guessFields(enriched)).toEqual({ date: 'eventtime__c', amount: 'unitsconsumed__c', group: 'cardname__c', status: '', env: 'usagebusinessenvtype__c', org: 'usagereportingorgid__c' })
    expect(guessFields(realEnt)).toMatchObject({ amount: 'quantity__c', group: 'entitlementcarddefdevlname__c' })
    expect(guessFields(ent)).toMatchObject({ date: 'TransactionDate__c', amount: 'Quantity__c', group: 'CardDefinitionDeveloperName__c' })
    expect(guessFields(odd)).toMatchObject({ date: 'When__c', amount: 'Amount2__c', group: '' })
  })
  it('writes the SQL', () => {
    const now = new Date('2026-10-25T12:00:00Z')
    expect(cutoffDate(10, now)).toBe('2026-10-15')
    const sql = dailySql(hourly.name, guessFields(hourly), { days: 10, now })
    expect(sql).toContain("DATE_TRUNC('day', usagehourbucket__c) AS day, resourcetype__c AS grp, businessenvtype__c AS env, SUM(unitsconsumed__c) AS total")
    expect(sql).toContain('GROUP BY 1, 2, 3')
    expect(sql).toContain("WHERE usagehourbucket__c >= CAST('2026-10-15 00:00:00' AS timestamp) AND rowdetail__c = 'PROCESSED'")
    expect(dailySql('X', { date: 'd', amount: 'a', group: '' }, { days: 1, now })).toContain("'all' AS grp, '' AS env")
    expect(totalsSql(ent.name, { amount: 'Quantity__c', group: 'Card__c', date: '' })).toBe("SELECT Card__c AS grp, '' AS env, SUM(Quantity__c) AS total\nFROM TenantEntitlementTransaction__dll\nGROUP BY 1, 2\nORDER BY 3 DESC")
    expect(orgsSql(hourly.name, guessFields(hourly))).toBe("SELECT businessenvtype__c AS env, UsageReportingOrgId__c AS org, SUM(unitsconsumed__c) AS total, MIN(usagehourbucket__c) AS first_day, MAX(usagehourbucket__c) AS last_day\nFROM TenantHourlyEntitlementConsumption__dll\nWHERE rowdetail__c = 'PROCESSED'\nGROUP BY 1, 2\nORDER BY 3 DESC")
  })
  it('fills every day and totals per group', () => {
    const now = new Date('2026-10-05T08:00:00Z')
    const { series, groups } = shapeDaily([['2026-10-01T00:00:00.000Z', 'A', '5'], ['2026-10-01', 'B', 3], ['2026-10-03', 'A', 2], [null, 'A', 9]], { days: 5, now })
    expect(series.map((p) => `${p.day}=${p.total}`)).toEqual(['2026-09-30=0', '2026-10-01=8', '2026-10-02=0', '2026-10-03=2', '2026-10-04=0', '2026-10-05=0'])
    expect(groups).toEqual([{ name: 'A', total: 7 }, { name: 'B', total: 3 }])
  })
  it('splits days and totals by environment', () => {
    const now = new Date('2026-10-03T08:00:00Z')
    const { series, groups, envs } = shapeDaily([['2026-10-01', 'A', 'Production', 5], ['2026-10-01', 'A', 'SANDBOX', 2], ['2026-10-02', 'B', null, 1], ['2026-10-02', 'A', 'Scratch', 4]], { days: 2, now })
    expect(series.map((p) => p.total)).toEqual([7, 5, 0])
    expect(groups).toEqual([{ name: 'A', total: 11 }, { name: 'B', total: 1 }])
    expect(Object.keys(envs)).toEqual(['Production', 'Sandbox', 'Scratch', 'Not set'])
    expect(envs.Sandbox.series.map((p) => p.total)).toEqual([2, 0, 0])
    expect(envs.Scratch.groups).toEqual([{ name: 'A', total: 4 }])
    expect(envName(' production ')).toBe('Production')
    expect(sortEnvs(['Other', 'Sandbox', 'Production'])).toEqual(['Production', 'Sandbox', 'Other'])
    expect(shapeTotals([['A', 'Production', 10, '2026-01-02', '2026-10-01'], ['A', 'Sandbox', 3, '2026-01-01', '2026-09-01'], ['B', '', 1, null, null]])).toEqual([
      { name: 'A', total: 13, first: '2026-01-01', last: '2026-10-01', envs: { Production: 10, Sandbox: 3 } },
      { name: 'B', total: 1, first: '', last: '', envs: { 'Not set': 1 } },
    ])
  })
  it('forecasts from the daily burn, without today', () => {
    const now = new Date('2026-10-31T10:00:00Z')
    const series = Array.from({ length: 30 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, total: 10 }))
    series.push({ day: '2026-10-31', total: 1 }) // today, partial
    const fc = forecast(series, { remaining: 1000, now })
    expect(fc.avg30).toBe(10)
    expect(fc.trend).toBe('flat')
    expect(Math.round(fc.next30)).toBe(300)
    expect(fc.projected[0].day).toBe('2026-10-31')
    expect(Math.round(fc.toYearEnd)).toBe(620) // Oct 31 to Dec 31
    expect(fc.runOutDays).toBe(100)
    expect(fc.runOutDate).toBe('2027-02-08')
    const rising = forecast(Array.from({ length: 20 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, total: i })), { now })
    expect(rising.trend).toBe('rising')
    expect(rising.projected[0].total).toBeCloseTo(20)
    expect(forecast([], { now }).next30).toBe(0)
  })
  it('works out what is left per card', () => {
    expect(balances([{ name: 'A', total: 100 }, { name: 'C', total: 5 }], [{ name: 'A', total: 30 }])).toEqual([
      { name: 'A', purchased: 100, consumed: 30, remaining: 70 },
      { name: 'C', purchased: 5, consumed: null, remaining: null },
    ])
  })
})

describe('probing the Wallet DLOs (feedback #1011)', () => {
  it('keeps the DLOs SQL can read, with their columns as fields', async () => {
    const { probeCreditObjects, findCreditObjects } = await import('../credits.js')
    const asked = []
    const q = async (sql) => {
      asked.push(sql)
      if (/TenantBillingUsageEvent__dll/.test(sql)) return { columns: [{ name: 'EventTime__c', type: 'DateTime' }, { name: 'UsageValue__c', type: 'Number' }] }
      throw new Error('Object not found')
    }
    const list = await probeCreditObjects(q)
    expect(asked).toContain('SELECT * FROM TenantBillingUsageEvent__dll LIMIT 1')
    expect(list).toEqual([{ name: 'TenantBillingUsageEvent__dll', label: 'TenantBillingUsageEvent', kind: 'DLO', probed: true, fields: [{ name: 'EventTime__c', type: 'DateTime' }, { name: 'UsageValue__c', type: 'Number' }] }])
    expect(findCreditObjects(list).map((x) => x.role.id)).toEqual(['events'])
  })
})

describe('credits per day by card and money (feedback #1042)', () => {
  it('lists what used the credits each day, for all and per environment', async () => {
    const { shapeDaily } = await import('../credits.js')
    const now = new Date('2026-10-29T12:00:00Z')
    const r = shapeDaily([
      ['2026-10-28', 'PlatformServicesCard', 'Production', 100],
      ['2026-10-28', 'DataStorageCard', 'Production', 5],
      ['2026-10-28', 'PlatformServicesCard', 'Sandbox', 20],
    ], { days: 3, now })
    const day = r.series.find((p) => p.day === '2026-10-28')
    expect(day.total).toBe(125)
    expect(day.groups).toEqual([{ name: 'PlatformServicesCard', total: 120 }, { name: 'DataStorageCard', total: 5 }])
    expect(r.envs.Sandbox.series.find((p) => p.day === '2026-10-28').groups).toEqual([{ name: 'PlatformServicesCard', total: 20 }])
    expect(r.series.find((p) => p.day === '2026-10-27').groups).toEqual([])
  })
  it('keeps a price per org and shows money', async () => {
    const { creditPrice, setCreditPrice, moneyText } = await import('../credits.js')
    localStorage.clear()
    expect(creditPrice('00D000000000001AAA')).toBe(null)
    setCreditPrice('00D000000000001AAA', '0.001', 'USD')
    const p = creditPrice('00D000000000001')
    expect(p).toEqual({ price: 0.001, currency: 'USD' })
    expect(moneyText(1000, p)).toMatch(/\$1\.00$/)
    expect(moneyText(1234567, p)).toMatch(/\$1,235$/)
    expect(moneyText(10, null)).toBe('')
    setCreditPrice('00D000000000001AAA', '')
    expect(creditPrice('00D000000000001AAA')).toBe(null)
  })
})

describe('credits per resource and rounded numbers (feedback #1046)', () => {
  it('finds the enriched usage events and their fields', async () => {
    const { resourceSource, resourcesSql } = await import('../credits.js')
    const f = (n) => ({ name: n, type: 'string' })
    const src = resourceSource([{ name: 'TenantEnrichedUsageEvent__dll', kind: 'DLO', fields: ['eventtime__c', 'unitsconsumed__c', 'usagevalue__c', 'resourcetype__c', 'resourceidorapiname__c', 'rootresourcetype__c', 'usagetypedevelopername__c', 'carddefinitiondevelopername__c', 'usagebusinessenvtype__c'].map(f) }])
    expect(src).toEqual({ object: 'TenantEnrichedUsageEvent__dll', fields: { date: 'eventtime__c', amount: 'unitsconsumed__c', type: 'resourcetype__c', name: 'resourceidorapiname__c', usage: 'usagetypedevelopername__c', card: 'carddefinitiondevelopername__c', env: 'usagebusinessenvtype__c', unit: '', event: '', status: '' } })
    expect(resourcesSql(src, { days: 30, now: new Date('2026-10-29T00:00:00Z') })).toContain("SUM(unitsconsumed__c) AS credits\nFROM TenantEnrichedUsageEvent__dll\nWHERE eventtime__c >= CAST('2026-09-29 00:00:00' AS timestamp)")
    expect(resourceSource([{ name: 'TenantDailyEntitlementConsumption__dll', kind: 'DLO', fields: [f('unitsconsumed__c')] }])).toBe(null)
  })
  it('sums resources and keeps the top per day', async () => {
    const { shapeResources, shapeResourceDays, resourcesForDay } = await import('../credits.js')
    const r = shapeResources([['DataTransform', 'DT_A', 'BatchTransform', 'PlatformServicesCard', 'Production', 300], ['DataStream', 'S_B', 'Ingest', 'PlatformServicesCard', 'Production', 100], ['DataTransform', 'DT_A', 'BatchTransform', 'PlatformServicesCard', 'Sandbox', 50]])
    expect(r.map((x) => [x.name, x.credits])).toEqual([['DT_A', 350], ['S_B', 100]])
    expect(r[0].envs).toEqual({ Production: 300, Sandbox: 50 })
    const days = shapeResourceDays([['2026-10-28', 'DataTransform', 'DT_A', 'Production', 30], ['2026-10-28', 'DataStream', 'S_B', 'Production', 10], ['2026-10-28', 'DataStream', 'S_C', 'Sandbox', 5]], { keep: 1 })
    expect(days['2026-10-28'].Production).toEqual([{ type: 'DataTransform', name: 'DT_A', credits: 30 }, { type: '', name: '1 other resources', credits: 10, other: true }])
    expect(resourcesForDay(days, '2026-10-28').map((x) => x.credits)).toEqual([30, 5, 10])
    expect(resourcesForDay(days, '2026-10-01')).toEqual([])
  })
  it('rounds big numbers into words', async () => {
    const { approx, moneyText } = await import('../credits.js')
    expect(approx(512093864)).toBe('~512 million')
    expect(approx(3512000)).toBe('~3.5 million')
    expect(approx(84321)).toBe('~84.3 thousand')
    expect(approx(843)).toBe('843')
    expect(approx(12109372862)).toBe('~12.1 billion')
    expect(approx(null)).toBe('—')
    expect(moneyText(512093864, { price: 0.01, currency: 'USD' })).toMatch(/^~.*\$5\.1 million$/)
  })
})

describe('credits by card with resource types (feedback #1054)', () => {
  it('lists purchased, used, left and share per card, and the types inside each', async () => {
    const { cardRows, shapeCardTypes, cardTypesSql } = await import('../credits.js')
    const rows = cardRows([{ name: 'PlatformServicesCard', total: 11.5e9 }, { name: 'DataStorageCard', total: 27600 }], [{ name: 'PlatformServicesCard', total: 603e6 }, { name: 'DataStorageCard', total: 35393 }, { name: 'EinsteinAI', total: 200 }])
    expect(rows.map((r) => [r.name, r.left, r.share && Math.round(r.share * 1000) / 10])).toEqual([['PlatformServicesCard', 10897e6, 5.2], ['DataStorageCard', -7793, 128.2], ['EinsteinAI', null, null]])
    const ct = shapeCardTypes([['PlatformServicesCard', 'DataTransform', 'BatchTransform', 'Credits', 400], ['PlatformServicesCard', 'DataStream', 'Ingest', 'Credits', 100], ['PlatformServicesCard', 'DataTransform', 'BatchTransform', 'Credits', 50], ['DataStorageCard', 'None', 'DataStorage', 'TB', 5]])
    expect(ct.PlatformServicesCard.parts.map((p) => [p.label, p.credits])).toEqual([['DataTransform', 450], ['DataStream', 100]])
    expect(ct.DataStorageCard).toEqual({ unit: 'TB', parts: [{ label: 'DataStorage', type: '', usage: 'DataStorage', credits: 5 }] })
    expect(cardTypesSql({ object: 'E__dll', fields: { card: 'carddefinitiondevelopername__c', type: 'resourcetype__c', usage: 'usagetypedevelopername__c', unit: 'unit__c', amount: 'unitsconsumed__c', status: '' } })).toBe('SELECT carddefinitiondevelopername__c AS card, resourcetype__c AS type, usagetypedevelopername__c AS usage, MAX(unit__c) AS unit, SUM(unitsconsumed__c) AS credits\nFROM E__dll\nGROUP BY 1, 2, 3')
    const { cardInfo } = await import('../credits.js')
    expect(cardInfo('DataStorageCard')).toMatch(/storage/)
    expect(cardInfo('Something')).toBe('')
  })
})

describe('projection follows the weekly pattern (feedback #1058)', () => {
  it('shapes the projected days by weekday and keeps the weekly total', async () => {
    const { forecast } = await import('../credits.js')
    const now = new Date('2026-10-29T12:00:00Z')
    const series = []
    for (let i = 70; i >= 1; i--) {
      const d = new Date(now.getTime() - i * 86400000)
      const w = d.getUTCDay()
      series.push({ day: d.toISOString().slice(0, 10), total: w === 0 || w === 6 ? 50 : 150 })
    }
    const f = forecast(series, { now })
    expect(f.weekly).toBe(true)
    const week = f.projected.slice(0, 7)
    const weekend = week.filter((p) => [0, 6].includes(new Date(`${p.day}T00:00:00Z`).getUTCDay()))
    const weekdays = week.filter((p) => ![0, 6].includes(new Date(`${p.day}T00:00:00Z`).getUTCDay()))
    expect(Math.abs(weekend[0].total - 50)).toBeLessThan(3)
    expect(Math.abs(weekdays[0].total - 150)).toBeLessThan(3)
    expect(Math.abs(week.reduce((n, p) => n + p.total, 0) - 850)).toBeLessThan(10)
    expect(forecast(series.slice(-10), { now }).weekly).toBe(false)
  })
})

describe('each usage event counted once (feedback #1060)', () => {
  it('reads distinct rows when the events have an id', async () => {
    const { resourceSource, cardTypesSql } = await import('../credits.js')
    const f = (n) => ({ name: n, type: 'string' })
    const src = resourceSource([{ name: 'TenantEnrichedUsageEvent__dll', kind: 'DLO', fields: ['eventtime__c', 'unitsconsumed__c', 'resourcetype__c', 'resourceidorapiname__c', 'usagetypedevelopername__c', 'carddefinitiondevelopername__c', 'unit__c', 'tenantbillingusageeventid__c'].map(f) }])
    expect(src.fields.event).toBe('tenantbillingusageeventid__c')
    expect(cardTypesSql(src)).toContain('FROM (SELECT DISTINCT tenantbillingusageeventid__c, eventtime__c, resourcetype__c, resourceidorapiname__c, usagetypedevelopername__c, carddefinitiondevelopername__c, unit__c, unitsconsumed__c FROM TenantEnrichedUsageEvent__dll) e')
  })
})

describe('credit page helpers (design Option D)', () => {
  it('labels and steps the chart axis', async () => {
    const { shortNum, niceTicks } = await import('../credits.js')
    expect(shortNum(2e6)).toBe('2M')
    expect(shortNum(1500)).toBe('1.5K')
    expect(niceTicks(5.4e6)).toEqual({ top: 6e6, ticks: [0, 2e6, 4e6, 6e6] })
  })
  it('sorts cards by share used and lists unused ones', async () => {
    const { cardGrid } = await import('../credits.js')
    const g = cardGrid([
      { name: 'A', used: 10, purchased: 100, share: 0.1, left: 90 },
      { name: 'S', used: 128, purchased: 100, share: 1.28, left: -28 },
      { name: 'U', used: 0, purchased: 50, share: 0, left: 50 },
    ], [{ name: 'S', envs: { Production: 128 }, first: '2025-02-01', last: '2026-10-28' }])
    expect(g.used.map((c) => c.name)).toEqual(['S', 'A'])
    expect(g.used[0].envs).toEqual({ Production: 128 })
    expect(g.unused.map((c) => c.name)).toEqual(['U'])
  })
  it('raises over-purchase and rising sandbox alerts', async () => {
    const { creditAlerts } = await import('../credits.js')
    const a = creditAlerts([{ name: 'S', left: -1 }, { name: 'A', left: 3 }], [{ env: 'Production', trend: 'rising', last30: 5 }, { env: 'Sandbox', trend: 'rising', last30: 5 }])
    expect(a.map((x) => x.kind)).toEqual(['over', 'rising'])
  })
  it('sums the top resources', async () => {
    const { topResources } = await import('../credits.js')
    const t = topResources([{ credits: 6 }, { credits: 3 }, { credits: 1 }], 2)
    expect(t).toMatchObject({ count: 3, total: 10, topShare: 0.9 })
  })
})
