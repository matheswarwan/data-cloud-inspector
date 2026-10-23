import { normalizeStream, fieldMap, describeSchedule } from '../streams.js'

const raw = {
  name: 'Contact_Home', label: 'Contact_Home', status: 'ACTIVE', isEnabled: true, lastRunStatus: 'SUCCESS', totalRecords: 150, lastAddedRecords: 0, lastProcessedRecords: 0,
  connectorInfo: { connectorType: 'SalesforceDotCom', connectorDetails: { name: 'SalesforceDotCom_Home', sourceObject: 'Contact' } },
  refreshConfig: { frequency: { frequencyType: 'BATCH', hours: [], refreshDayOfMonth: [] }, fullRefreshIntervalDays: 'DAYS_10', refreshMode: 'UPSERT' },
  dataLakeObjectInfo: { name: 'Contact_Home__dll', dataLakeFieldInfoRepresentation: [{ name: 'Id__c', label: 'Contact ID', dataType: 'Text', isPrimaryKey: true }, { name: 'Email__c', label: 'Email', dataType: 'Email' }] },
  sourceFields: [{ name: 'Id', datatype: 'Text' }, { name: 'Email', datatype: 'Email' }, { name: 'Fax', datatype: 'Phone' }],
  problemRecordDataLakeObjectName: '',
}

describe('data streams', () => {
  it('normalizes a stream', () => {
    const s = normalizeStream(raw)
    expect(s).toMatchObject({ connector: 'SalesforceDotCom', sourceObject: 'Contact', frequency: 'BATCH', refreshMode: 'UPSERT', totalRecords: 150 })
    expect(s.dlo.fields[0]).toEqual({ name: 'Id__c', label: 'Contact ID', type: 'Text', primaryKey: true })
  })
  it('matches source fields to DLO fields by name', () => {
    expect(fieldMap(normalizeStream(raw)).map((f) => [f.name, f.dloField])).toEqual([['Id', 'Id__c'], ['Email', 'Email__c'], ['Fax', '']])
  })
  it('describes the schedule', () => {
    expect(describeSchedule(normalizeStream(raw))).toBe('when the source changes (batch), upsert mode, full refresh every 10 days')
    expect(describeSchedule(normalizeStream({ ...raw, refreshConfig: { frequency: { frequencyType: 'DAILY', hours: [6] }, refreshMode: 'FULL_REFRESH' } }))).toBe('every day, at 6:00, full refresh mode')
  })
})
