// Problem records: rows a data stream could not ingest go to its problem record DLO
// (data stream field problemRecordDataLakeObjectName). Their fields on a live org (API v68.0,
// 2026-10-22): error_code__c, detailed_error__c, error_fields__c, error_row__c,
// error_timestamp__c, error_context__c.

import { runQuery } from './query.js'
import { toObjects } from './profile.js'

export function latestProblemsSql(dlo, limit = 100) {
  return `SELECT error_timestamp__c, error_code__c, detailed_error__c, error_fields__c, error_row__c, error_context__c\nFROM ${dlo}\nORDER BY error_timestamp__c DESC\nLIMIT ${limit}`
}

/** `Map(dlo -> { count, latest, error })` for the given problem record DLOs, 4 at a time. */
export async function problemCounts(call, version, dlos) {
  const out = new Map()
  const list = [...new Set(dlos.filter(Boolean))]
  for (let i = 0; i < list.length; i += 4) {
    await Promise.all(list.slice(i, i + 4).map(async (dlo) => {
      try {
        const r = toObjects(await runQuery(call, version, `SELECT COUNT(*) AS n, MAX(error_timestamp__c) AS latest FROM ${dlo}`, { rowLimit: 1 }))[0] || {}
        out.set(dlo, { count: Number(r.n || 0), latest: r.latest || null, error: '' })
      } catch (err) {
        out.set(dlo, { count: null, latest: null, error: err.message })
      }
    }))
  }
  return out
}

/** A stream health item updated with its problem records. */
export function withProblems(item, info) {
  if (!info || !item.problemDlo) return item
  if (info.error) return { ...item, problems: info }
  if (!info.count) return { ...item, problems: info }
  const note = `${info.count.toLocaleString()} problem record${info.count === 1 ? '' : 's'}${info.latest ? `, latest ${info.latest}` : ''}`
  const level = item.level === 'ok' ? 'warn' : item.level
  return { ...item, problems: info, level, reason: item.level === 'ok' ? `Rows were rejected: ${note}` : `${item.reason}; ${note}` }
}
