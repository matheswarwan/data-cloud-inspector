// Ready-made requests for REST explore (feedback #79). Each answered on a live org
// (API v68.0, 2026-10-22). `{v}` is the API version; NAME is for the user to replace.

export const EXAMPLES = [
  { group: 'Data Cloud setup', items: [
    { label: 'Data spaces', path: 'ssot/data-spaces' },
    { label: 'Data streams (status, last run, record counts)', path: 'ssot/data-streams?limit=50' },
    { label: 'One data stream, with its fields and refresh settings', path: 'ssot/data-streams/NAME' },
    { label: 'Connections of one connector type', path: 'ssot/connections?connectorType=SalesforceDotCom' },
    { label: 'Data transforms', path: 'ssot/data-transforms?limit=50' },
  ] },
  { group: 'Data model', items: [
    { label: 'Data lake objects (with row counts)', path: 'ssot/data-lake-objects?limit=50' },
    { label: 'One data lake object', path: 'ssot/data-lake-objects/NAME__dll' },
    { label: 'Data model objects', path: 'ssot/data-model-objects?limit=50' },
    { label: 'One data model object, with fields', path: 'ssot/data-model-objects/ssot__Individual__dlm' },
    { label: 'Metadata of one object (fields, keys, relationships)', path: 'ssot/metadata?entityType=DataModelObject&entityName=ssot__Individual__dlm' },
    { label: 'What is mapped into a DMO, field by field', path: 'ssot/data-model-object-mappings?dataspace=default&dmoDeveloperName=ssot__Individual__dlm' },
    { label: 'Data graphs', path: 'ssot/data-graphs/metadata' },
    { label: 'Profile API metadata', path: 'ssot/profile/metadata' },
    { label: 'Semantic models', path: 'ssot/semantic/models?limit=50' },
  ] },
  { group: 'Identity, insights and segments', items: [
    { label: 'Identity resolution rulesets (match and reconciliation rules)', path: 'ssot/identity-resolutions' },
    { label: 'One ruleset with consolidation rate (use its record ID, 1ir...)', path: 'ssot/identity-resolutions/NAME' },
    { label: 'Calculated insights (definition, SQL, last run)', path: 'ssot/calculated-insights' },
    { label: 'One calculated insight', path: 'ssot/calculated-insights/NAME__cio' },
    { label: 'Insight metadata', path: 'ssot/insight/metadata' },
    { label: 'Segments (criteria, member count, publish status)', path: 'ssot/segments?limit=50' },
    { label: 'Activations', path: 'ssot/activations?limit=50' },
    { label: 'Activation targets', path: 'ssot/activation-targets' },
    { label: 'Data actions', path: 'ssot/data-actions' },
    { label: 'Data action targets', path: 'ssot/data-action-targets' },
  ] },
  { group: 'Query (POST, read only)', items: [
    { label: 'Query API: SQL with a row limit', method: 'POST', path: 'ssot/query-sql', body: { sql: 'SELECT ssot__Id__c, ssot__FirstName__c, ssot__LastName__c FROM ssot__Individual__dlm LIMIT 10', rowLimit: 100 } },
    { label: 'Query API v2 (older endpoint)', method: 'POST', path: 'ssot/queryv2', body: { sql: 'SELECT COUNT(*) FROM ssot__Individual__dlm' } },
  ] },
  { group: 'Salesforce core', items: [
    { label: 'Org limits (includes Data Cloud limits)', path: 'limits' },
    { label: 'Who am I', path: 'chatter/users/me' },
    { label: 'SOQL query', path: 'query?q=SELECT+Id,Name+FROM+Account+LIMIT+5' },
    { label: 'Calculated insight records (for their IDs)', path: 'query?q=SELECT+Id,Name+FROM+MktCalculatedInsight' },
    { label: 'Tooling API: data stream definitions', path: 'tooling/query?q=SELECT+Id,DeveloperName+FROM+DataStreamDefinition' },
    { label: 'All sObjects', path: 'sobjects' },
  ] },
]

export function examplePath(item, version) {
  return `/services/data/v${version}/${item.path}`
}
