import { describe, it, expect } from 'vitest'
import { jsonPath, searchPaths, jsonGraph, parseJson, kindOf } from '../jsonView.js'

const doc = { name: 'Test Activation', target: { id: 'x1', type: 'SFMC' }, attributes: [{ field: 'Email', out: 'EmailAddress' }, { field: 'First', out: 'FirstName' }], 'odd key': 1 }

describe('jsonView', () => {
  it('paths', () => {
    expect(jsonPath([])).toBe('$')
    expect(jsonPath(['attributes', 0, 'field'])).toBe('$.attributes[0].field')
    expect(jsonPath(['odd key'])).toBe('$["odd key"]')
  })
  it('parses and types', () => {
    expect(parseJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } })
    expect(parseJson('{').ok).toBe(false)
    expect(parseJson({ a: 1 }).value).toEqual({ a: 1 })
    expect([kindOf(null), kindOf([]), kindOf({}), kindOf('a')]).toEqual(['null', 'array', 'object', 'string'])
  })
  it('searches keys and values and opens their parents', () => {
    const { hits, open } = searchPaths(doc, 'firstname')
    expect([...hits]).toEqual(['$.attributes[1].out'])
    expect([...open]).toEqual(['$', '$.attributes', '$.attributes[1]'])
    expect(searchPaths(doc, 'target').hits.has('$.target')).toBe(true)
    expect(searchPaths(doc, '').hits.size).toBe(0)
  })
  it('builds a graph of objects and arrays', () => {
    const g = jsonGraph(doc)
    expect(g.nodes.map((n) => n.title)).toEqual(['root', 'target', 'attributes', 'attributes[0]', 'attributes[1]'])
    expect(g.nodes[0].rows.map((r) => r.k)).toEqual(['name', 'odd key'])
    expect(g.edges.map((e) => e.label).sort()).toEqual(['[0]', '[1]', 'attributes', 'target'])
    expect(g.truncated).toBe(false)
    expect(jsonGraph(doc, { maxNodes: 2 }).truncated).toBe(true)
    expect(jsonGraph('plain').nodes[0].rows[0].v).toBe('"plain"')
  })
})
