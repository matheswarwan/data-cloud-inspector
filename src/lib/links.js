// Links into the org's own UI. https://<my domain>/<record id> redirects to the record's
// Lightning page; checked on a live org (2026-10-22) for data streams (1ds), DLOs (1dl),
// calculated insights (0kX), segments (1sg), identity resolution rulesets (1ir),
// activation targets (85U) and CRM records. DMO IDs (0gj) only reach the home page; a DMO
// opens in the Data Model tab by API name (URL from the user, feedback #81).

const PREFIXES = {
  '1ds': 'Data stream',
  '1dl': 'Data lake object',
  '0kX': 'Calculated insight',
  '1sg': 'Segment',
  '1ir': 'Identity resolution ruleset',
  '85U': 'Activation target',
  '85R': 'Segment activation',
  '003': 'Contact',
  '001': 'Account',
  '00Q': 'Lead',
  '005': 'User',
}

const ID_RE = /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/

/** The kind of record an ID points to, or null when it is not a linkable record ID. */
export function recordKind(value) {
  const v = String(value ?? '')
  if (!ID_RE.test(v)) return null
  return PREFIXES[v.slice(0, 3)] || null
}

export function recordUrl(host, id) {
  return host && id ? `https://${host}/${id}` : null
}

export function lightningHost(host) {
  return String(host || '').replace(/\.my\.salesforce\.com$/, '.lightning.force.com')
}

export function dmoUrl(host, apiName) {
  return host && apiName ? `https://${lightningHost(host)}/lightning/n/standard-DataModel?c__objectApiName=${encodeURIComponent(apiName)}` : null
}

/** Record IDs of DLOs, DMOs and calculated insights by API name (the metadata has none). */
export async function loadRecordIds(call, version, fetchAllPages) {
  const ids = {}
  const [dlos, dmos, cis] = await Promise.all([
    fetchAllPages(call, `/services/data/v${version}/ssot/data-lake-objects?limit=50`, 'dataLakeObjects').catch(() => []),
    fetchAllPages(call, `/services/data/v${version}/ssot/data-model-objects?limit=50`, 'dataModelObject').catch(() => []),
    call(`/services/data/v${version}/query?q=${encodeURIComponent('SELECT Id, Name FROM MktCalculatedInsight')}`).catch(() => null),
  ])
  for (const o of dlos) if (o.name && o.id) ids[o.name] = o.id
  for (const o of dmos) if (o.name && o.id) ids[o.name] = o.id
  for (const r of cis?.ok ? cis.data?.records || [] : []) ids[`${r.Name}__cio`] = r.Id
  return ids
}
