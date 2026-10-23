import { baseInsightName, normalizeInsight, loadInsight } from '../insights.js'

describe('calculated insight definition', () => {
  it('maps granularity variants to the base API name', () => {
    expect(baseInsightName('Daily__cio_DAY')).toBe('Daily__cio')
    expect(baseInsightName('Daily__cio')).toBe('Daily__cio')
  })
  it('normalizes the definition and decodes HTML entities in SQL', () => {
    const ci = normalizeInsight({
      apiName: 'Daily__cio', displayName: 'Daily', calculatedInsightStatus: 'ACTIVE', definitionType: 'CALCULATED_METRIC',
      expression: 'SELECT CASE WHEN a = &#39;&#39; THEN 1 END FROM x', lastRunStatus: 'SUCCESS',
      dimensions: [{ apiName: 'D__c', fieldRole: 'DIMENSION', dataType: 'Date', dateGranularity: 'DAY', formula: 'DATE_ADD(x.d, 0)' }],
      measures: [{ apiName: 'M__c', fieldRole: 'MEASURE', dataType: 'Number', fieldAggregationType: 'NONAGGREGATABLE', formula: 'COUNT(x.id)' }],
    })
    expect(ci.sql).toBe("SELECT CASE WHEN a = '' THEN 1 END FROM x")
    expect(ci.dimensions[0]).toMatchObject({ name: 'D__c', role: 'dimension', granularity: 'DAY' })
    expect(ci.measures[0]).toMatchObject({ role: 'measure', aggregation: 'NONAGGREGATABLE', formula: 'COUNT(x.id)' })
  })
  it('asks for the base name and caches per data space', async () => {
    const asked = []
    const call = async (p) => { asked.push(p); return { ok: true, data: { apiName: 'Daily__cio' } } }
    call.dataSpace = 'default'
    await loadInsight(call, '68.0', 'Daily__cio_MONTH')
    await loadInsight(call, '68.0', 'Daily__cio')
    expect(asked).toEqual(['/services/data/v68.0/ssot/calculated-insights/Daily__cio'])
  })
})
