/**
 * Sözlüğü Android uygulamasına aktarır (tek kaynak: src/core/glossary.ts):
 *   npm run research -- research/glossary-export.research.ts
 * src/core/glossary.test.ts, gömülü dosyanın güncel olduğunu denetler.
 */
import { it } from 'vitest'
import { GLOSSARY } from '../src/core/glossary'
import { save } from './grid'

it('sözlüğü Android varlığına yaz', () => {
  save('../app/src/main/assets/glossary.json', GLOSSARY)
})
