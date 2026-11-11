import { termForField } from '../core/glossary'
import { describe, field, type Condition } from '../core/screener'
import { href } from './router'

/** Koşul çipleri: her çip, sol alanın sözlükteki tanımına gider. */
export function CondChips({ conditions }: { conditions: Condition[] }) {
  return (
    <ul className="conds">
      {conditions.map((c, i) => {
        const t = termForField(c.left)
        return (
          <li key={i}>
            {t ? <a href={href('sozluk/' + t.id)} title={`${field(c.left).label} nedir?`}>{describe(c)}</a> : describe(c)}
          </li>
        )
      })}
    </ul>
  )
}
