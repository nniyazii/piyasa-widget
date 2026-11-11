import { describe, expect, it } from 'vitest'
import { ALL_TERMS, termForField } from './glossary'
import { FIELDS } from './screener'

describe('sözlük', () => {
  it('her tarama alanı bir terimle anlatılır', () => {
    for (const f of FIELDS) expect(termForField(f.id), f.label).toBeDefined()
  })
  it('kimlikler tekil, ilişkili terimler var', () => {
    const ids = ALL_TERMS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of ALL_TERMS) for (const r of t.related ?? []) expect(ids, `${t.id} → ${r}`).toContain(r)
    for (const t of ALL_TERMS) expect(t.id).toMatch(/^[a-z0-9-]+$/)
  })
})
