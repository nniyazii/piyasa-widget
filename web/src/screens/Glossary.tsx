import { useEffect, useMemo, useRef, useState } from 'react'
import { GLOSSARY, termById, type Term } from '../core/glossary'
import { fold } from '../data/tv'
import { Icon } from '../ui/Icon'
import { href } from '../ui/router'

/** Terimler sözlüğü: arama, konu başlıkları; #/sozluk/:id terime gider. */
export function Glossary({ target }: { target?: string }) {
  const [q, setQ] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const n = fold(q.trim())
  const groups = useMemo(() => GLOSSARY.map((g) => ({ ...g, terms: n ? g.terms.filter((t) => matches(t, n)) : g.terms })).filter((g) => g.terms.length), [n])
  const hits = groups.reduce((a, g) => a + g.terms.length, 0)

  // Bağlantıyla gelinen terime kaydır ve kısa süre işaretle
  useEffect(() => {
    if (!target) return
    setQ('')
    requestAnimationFrame(() => {
      const el = document.getElementById('t-' + target)
      if (!el) return
      el.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      el.classList.remove('is-target')
      void el.offsetWidth
      el.classList.add('is-target')
    })
  }, [target])

  return (
    <div className="gloss">
      <p className="lede">Uygulamada geçen göstergeler ve kavramlar: ne anlama geldikleri, nasıl hesaplandıkları ve Piyasa’nın onları nereden aldığı.</p>
      <div className="gloss-search">
        <Icon name="search" />
        <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Terim ara: RSI, F/K, piyasa değeri…" aria-label="Sözlükte ara" />
        {q && <button className="icon-btn" onClick={() => { setQ(''); input.current?.focus() }} aria-label="Aramayı temizle"><Icon name="close" /></button>}
      </div>
      {n && <p className="note" aria-live="polite">{hits ? `${hits} terim` : 'Bu aramayla eşleşen terim yok. Kısaltmayı ya da başka bir adını dene (ör. EPS, ROE, EBITDA).'}</p>}

      <div className="gloss-body">
        <nav className="gloss-index" aria-label="Konular">
          {groups.map((g) => (
            <div key={g.id}>
              <a className="g" href={'#g-' + g.id} onClick={(e) => { e.preventDefault(); document.getElementById('g-' + g.id)?.scrollIntoView({ block: 'start' }) }}>{g.title}</a>
              <ul>{g.terms.map((t) => <li key={t.id}><a href={href('sozluk/' + t.id)}>{shortName(t)}</a></li>)}</ul>
            </div>
          ))}
        </nav>
        <div className="gloss-list">
          {groups.map((g) => (
            <section key={g.id} id={'g-' + g.id} className="gloss-group">
              <h2>{g.title}</h2>
              {g.terms.map((t) => <Entry key={t.id} t={t} />)}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

function Entry({ t }: { t: Term }) {
  return (
    <article className="term" id={'t-' + t.id}>
      <h3><a href={href('sozluk/' + t.id)}>{t.term}</a></h3>
      {t.aka?.length ? <p className="aka">Diğer adları: {t.aka.join(', ')}</p> : null}
      <p className="def">{t.short}</p>
      {t.formula && (
        <div className="formula" role="group" aria-label="Hesap">
          {t.formula.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
      {t.body?.map((p, i) => <p key={i}>{p}</p>)}
      {t.example && <p className="ex"><b>Örnek.</b> {t.example}</p>}
      {t.inApp && <p className="app"><b>Piyasa’da.</b> {t.inApp}</p>}
      {t.related?.length ? (
        <p className="rel">İlgili: {t.related.map((r, i) => {
          const x = termById(r)
          return x ? <span key={r}>{i ? ', ' : ''}<a href={href('sozluk/' + r)}>{shortName(x)}</a></span> : null
        })}</p>
      ) : null}
    </article>
  )
}

/** Dizinde kısa ad: parantez içi açılımı at ("RSI (göreceli güç endeksi)" → "RSI") */
const shortName = (t: Term) => t.term.replace(/\s*\(.*\)$/, '')

function matches(t: Term, n: string) {
  const hay = fold([t.term, ...(t.aka ?? []), t.short].join(' '))
  return n.split(/\s+/).every((w) => hay.includes(w))
}
