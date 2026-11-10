/**
 * Tek kutu, iki iş: sembol eklemek ve formül yazmak.
 *   "aselsan"           → sonuç → Enter → listeye eklendi
 *   "ons * dolar / oz"  → canlı sonuç → Enter → ad ve birim → formül kaydedildi ("Gram Altın", ₺)
 * Operatör yazılınca o ana kadar yazılan kelime en iyi eşleşen sembole dönüşür.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { CATALOG, instrumentFromHit, KEYWORDS, type SearchHit } from '../core/catalog'
import { FormulaEngine } from '../core/engine'
import * as Fmt from '../core/format'
import {
  CONSTANTS, FUNCTIONS, isFunctionToken, isNumberToken, isVariableToken, render, suggestKey, tokenize, TROY_OUNCE_GRAMS, uniqueKey,
} from '../core/formula'
import type { Formula, Instrument, Quote } from '../core/models'
import { actions, allKeys, getLive, getState, useApp, useLive } from '../data/store'
import { fold, normalizeCode, search } from '../data/tv'
import { Icon } from '../ui/Icon'
import { ChangeBadge, FN_LABELS } from '../ui/market'
import { Dialog, useToast } from '../ui/overlay'
import { setQuery } from '../ui/router'

interface Candidate {
  key: string
  name: string
  meta: string
  /** Listede yoksa eklenecek enstrüman */
  instrument?: Instrument
  inList: boolean
  isFormula?: boolean
  isConstant?: boolean
  price?: number
  priceText?: string
  change?: number
}

const OPS = new Set(['+', '-', '*', '/', '^', '(', ')', ';', ',', '×', '÷', '−'])

const FN_KEYS: { token: string; label: string; title: string }[] = [
  { token: 'pct(', label: '% fark', title: 'a’nın b’ye göre yüzde farkı: % fark(a ; b)' },
  { token: 'chg(', label: 'günlük %', title: 'Günlük yüzde değişim' },
  { token: 'prev(', label: 'önceki', title: 'Önceki kapanıştaki değer' },
  { token: 'avg(', label: 'ortalama', title: 'ortalama(a ; b ; …)' },
  { token: 'min(', label: 'en küçük', title: 'en küçük(a ; b ; …)' },
  { token: 'max(', label: 'en büyük', title: 'en büyük(a ; b ; …)' },
  { token: 'round(', label: 'yuvarla', title: 'yuvarla(x ; basamak)' },
]

export function Composer({ onClose, initialQuery, editKey }: { onClose: () => void; initialQuery?: string; editKey?: string }) {
  const state = useApp()
  const live = useLive()
  const toast = useToast()
  const editing = editKey ? state.formulas.find((f) => f.key === editKey) : undefined
  const [tokens, setTokens] = useState<string[]>(() => (editing ? tokenize(editing.expression) : []))
  const [draft, setDraft] = useState('')
  const [needed, setNeeded] = useState<Instrument[]>([])
  const [neededQuotes, setNeededQuotes] = useState<Record<string, Quote>>({})
  const [active, setActive] = useState(0)
  const [selectedTok, setSelectedTok] = useState<number | null>(null)
  const [remote, setRemote] = useState<{ q: string; hits: SearchHit[]; loading: boolean; error?: string }>({ q: '', hits: [], loading: false })
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const formulaMode = tokens.length > 0

  // İlk sorgu (ör. "Formül dene" düğmesi): işlenmiş gibi davran
  useEffect(() => {
    if (initialQuery) handleText(initialQuery)
    inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Uzak arama (TradingView), 250 ms gecikmeyle
  useEffect(() => {
    const q = draft.trim()
    if (q.length < 2 || isNumberToken(q)) { setRemote({ q, hits: [], loading: false }); return }
    const ac = new AbortController()
    setRemote((r) => ({ ...r, q, loading: true }))
    const t = setTimeout(() => {
      search(q, ac.signal)
        .then((hits) => setRemote({ q, hits, loading: false }))
        .catch((e) => { if (e.name !== 'AbortError') setRemote({ q, hits: [], loading: false, error: 'Arama yapılamadı' }) })
    }, 250)
    return () => { clearTimeout(t); ac.abort() }
  }, [draft])

  const ctxInstruments = useMemo(() => [...state.instruments, ...needed], [state.instruments, needed])
  const candidates = useMemo(() => buildCandidates(draft, state.formulas, ctxInstruments, state.instruments, live.quotes, remote.q === draft.trim() ? remote.hits : []),
    [draft, state.formulas, ctxInstruments, state.instruments, live.quotes, remote])
  useEffect(() => setActive(0), [draft])

  const engine = useMemo(() => new FormulaEngine({ instruments: ctxInstruments, formulas: state.formulas.filter((f) => f.key !== editKey), quotes: { ...live.quotes, ...neededQuotes } }),
    [ctxInstruments, state.formulas, live.quotes, neededQuotes, editKey])
  const expression = render(tokens)
  // Yazılmakta olan kelime: en iyi eşleşmeyle önizle (henüz eklenmeden)
  const pendingTok = formulaMode && draft.trim() ? previewToken(draft, candidates[0]) : undefined
  const previewEngine = useMemo(() => {
    const c = candidates[0]
    if (!pendingTok || !c?.instrument || c.inList) return engine
    const q: Record<string, Quote> = c.price != null ? { [c.instrument.key]: { price: c.price, prevClose: c.change != null ? c.price / (1 + c.change / 100) : undefined, time: Date.now() } } : {}
    return new FormulaEngine({ instruments: [...ctxInstruments, c.instrument], formulas: state.formulas.filter((f) => f.key !== editKey), quotes: { ...live.quotes, ...neededQuotes, ...q } })
  }, [engine, pendingTok, candidates, ctxInstruments, state.formulas, live.quotes, neededQuotes, editKey])
  const result = formulaMode ? previewEngine.evaluateExpression(pendingTok ? render([...tokens, pendingTok]) : expression, editKey) : undefined
  const unit = suggestUnit(tokens)

  function addNeeded(c: Candidate) {
    if (!c.instrument || c.inList || needed.some((n) => n.key === c.instrument!.key)) return
    setNeeded((n) => [...n, c.instrument!])
    if (c.price != null) {
      const prev = c.change != null ? c.price / (1 + c.change / 100) : undefined
      setNeededQuotes((q) => ({ ...q, [c.instrument!.key]: { price: c.price!, prevClose: prev, time: Date.now() } }))
    }
  }

  /** Kelimeyi en iyi eşleşen sembole çevirir; yoksa olduğu gibi (hata olarak görünür). */
  function resolveWord(word: string): string | null {
    const w = word.trim()
    if (!w) return null
    const n = Fmt.parseInput(w)
    if (n != null && !/^-/.test(w)) return String(n)
    const up = w.toUpperCase().replace(/\s+/g, '_')
    if (up in CONSTANTS) return up
    if (allKeys().includes(up) || needed.some((x) => x.key === up)) return up
    const list = buildCandidates(w, getState().formulas, [...getState().instruments, ...needed], getState().instruments, getLive().quotes,
      remote.q === w ? remote.hits : [])
    const best = list[0]
    if (!best) return up
    addNeeded(best)
    return best.key
  }

  /** Yazılanı işler: operatörlerde kelimeyi sembole çevirip parça olarak ekler. */
  function handleText(text: string) {
    let buf = ''
    const out: string[] = []
    let changed = false
    const chars = [...text]
    for (let k = 0; k < chars.length; k++) {
      const ch = chars[k]
      // Türkçe ondalık: "31,1" sayıdır. Sayıdan sonraki virgül: ardından rakam gelirse ondalık,
      // başka bir şey gelirse ayırıcı; henüz bir şey yazılmadıysa karar bekler.
      if (ch === ',' && /^\s*\d+$/.test(buf)) {
        const next = chars[k + 1]
        if (next === undefined) { buf += ','; continue }
        if (/\d/.test(next)) { buf += '.'; continue }
      }
      if (OPS.has(ch)) {
        changed = true
        const word = buf
        buf = ''
        const fn = word.trim().toLowerCase()
        if (ch === '(' && (FUNCTIONS as readonly string[]).includes(fn)) { out.push(fn + '('); continue }
        const r = resolveWord(word)
        if (r) out.push(r)
        out.push(ch === '×' ? '*' : ch === '÷' ? '/' : ch === '−' ? '-' : ch === ',' ? ';' : ch)
      } else buf += ch
    }
    if (changed) setTokens((t) => [...t, ...out])
    setDraft(buf)
    setSelectedTok(null)
  }

  function insertToken(tok: string) {
    const r = resolveWord(draft)
    setTokens((t) => [...t, ...(r ? [r] : []), tok])
    setDraft('')
    inputRef.current?.focus()
  }

  function pick(c: Candidate) {
    if (formulaMode || OPS_PENDING(draft)) {
      addNeeded(c)
      setTokens((t) => [...t, c.key])
      setDraft('')
      inputRef.current?.focus()
      return
    }
    if (c.isConstant) { setTokens([c.key]); setDraft(''); return }
    if (c.inList) {
      onClose()
      setQuery('s', c.key)
      return
    }
    if (c.instrument) {
      actions.addInstrument(c.instrument)
      const key = c.instrument.key
      toast(`${c.instrument.name} listeye eklendi`, { label: 'Geri al', run: () => actions.removeKey(key) })
      setDraft('')
      inputRef.current?.focus()
    }
  }

  function startSave() {
    const r = resolveWord(draft)
    const all = r ? [...tokens, r] : tokens
    if (r) { setTokens(all); setDraft('') }
    if (!all.length) return
    setSaving(true)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, candidates.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (formulaMode && (!draft.trim() || e.metaKey || e.ctrlKey)) return startSave()
      const c = candidates[active]
      if (c) pick(c)
      else if (formulaMode) startSave()
    } else if (e.key === '=' ) { e.preventDefault(); startSave() }
    else if (e.key === 'Backspace' && !draft) {
      e.preventDefault()
      if (selectedTok != null) { setTokens((t) => t.filter((_, i) => i !== selectedTok)); setSelectedTok(null) }
      else setTokens((t) => t.slice(0, -1))
    } else if (e.key === 'Escape') {
      if (draft) { e.preventDefault(); e.stopPropagation(); setDraft('') }
    }
  }

  const label = (t: string) => {
    if (t === '*') return '×'
    if (t === '/') return '÷'
    if (t === '-') return '−'
    if (isNumberToken(t)) return t.replace('.', ',')
    if (isFunctionToken(t)) return (FN_LABELS[t] ?? t)
    return ctxInstruments.find((i) => i.key === t)?.name ?? state.formulas.find((f) => f.key === t)?.name ?? t
  }

  const mine = candidates.filter((c) => c.inList || c.isFormula || c.isConstant)
  const markets = candidates.filter((c) => !(c.inList || c.isFormula || c.isConstant))

  return (
    <Dialog onClose={onClose} className="composer" head={false} labelledBy="composer-label">
      <h2 id="composer-label" className="sr-only">{editing ? 'Formülü düzenle' : 'Sembol ara ya da formül yaz'}</h2>
      <div className="composer-input" onClick={() => inputRef.current?.focus()}>
        <Icon name={formulaMode ? 'formula' : 'search'} />
        {tokens.map((t, i) => (
          <button key={i} type="button" className={'tok ' + tokClass(t, state.formulas.some((f) => f.key === t)) + (selectedTok === i ? ' sel' : '')}
            onClick={(e) => { e.stopPropagation(); setSelectedTok(selectedTok === i ? null : i); inputRef.current?.focus() }}
            aria-label={`${label(t)}${selectedTok === i ? ', seçili; silmek için geri tuşu' : ''}`}>{label(t)}</button>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => handleText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={formulaMode ? 'sembol, sayı ya da işlem' : 'Dolar, gram altın, THYAO, ALTIN.S1… ya da ons*dolar/oz'}
          aria-label="Ara ya da formül yaz"
          aria-autocomplete="list"
          aria-controls="composer-results"
          aria-activedescendant={candidates[active] ? `cand-${active}` : undefined}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
        />
        {(tokens.length > 0 || draft) && (
          <button className="icon-btn small" aria-label="Temizle" onClick={(e) => { e.stopPropagation(); setTokens([]); setDraft(''); setNeeded([]); inputRef.current?.focus() }}>
            <Icon name="close" />
          </button>
        )}
        <button className="btn ghost small mobile-only" onClick={(e) => { e.stopPropagation(); onClose() }}>Vazgeç</button>
      </div>

      {formulaMode && (
        <div className="composer-result" aria-live="polite">
          <span style={{ color: 'var(--ink-3)' }}>=</span>
          {result?.value != null
            ? <span className="eq num">{Fmt.value(result.value, decimalsFor(result.value, unit[1]), unit[0], unit[1])}</span>
            : <span className="err">{result?.error ?? '…'}</span>}
          {result?.value != null && <ChangeBadge change={Fmt.changeFor(result.value, result.prev, unit[1])} />}
          {pendingTok && candidates[0] && Fmt.parseInput(draft.trim()) == null && (
            <span className="note" style={{ margin: 0 }}>“{draft.trim()}”: {candidates[0].name}</span>
          )}
          <span className="spacer" />
          <button className="btn primary small" onClick={startSave} disabled={result?.value == null && !draft}>
            {editing ? 'Kaydet' : 'Formülü kaydet'}
          </button>
        </div>
      )}

      <div className="keys" aria-label="İşlemler">
        {[['*', '×'], ['/', '÷'], ['+', '+'], ['-', '−'], ['(', '('], [')', ')'], ['^', 'xʸ'], [';', ';']].map(([t, l]) => (
          <button key={t} type="button" onClick={() => insertToken(t)} aria-label={l === 'xʸ' ? 'üs' : l}>{l}</button>
        ))}
        <button type="button" className="fn" onClick={() => insertToken('OZ')} title={`1 troy ons = ${Fmt.number(TROY_OUNCE_GRAMS, 7)} gram`}>OZ</button>
        {formulaMode && FN_KEYS.map((f) => (
          <button key={f.token} type="button" className="fn" title={f.title} onClick={() => insertToken(f.token)}>{f.label}</button>
        ))}
      </div>

      <ul className="results" id="composer-results" role="listbox" aria-label="Sonuçlar">
        {!draft.trim() && !formulaMode && <Suggestions onPick={(q) => handleText(q)} />}
        {mine.length > 0 && <li className="sect" role="presentation">Listende</li>}
        {mine.map((c) => <ResultRow key={'m' + c.key} c={c} i={candidates.indexOf(c)} active={active} onPick={pick} formulaMode={formulaMode} onHover={setActive} />)}
        {markets.length > 0 && <li className="sect" role="presentation">Piyasalar</li>}
        {markets.map((c) => <ResultRow key={'r' + c.key + c.meta} c={c} i={candidates.indexOf(c)} active={active} onPick={pick} formulaMode={formulaMode} onHover={setActive} />)}
        {draft.trim().length >= 2 && remote.loading && !markets.length && <li className="sect" role="presentation">Piyasalarda aranıyor…</li>}
        {draft.trim().length >= 2 && !remote.loading && !candidates.length && (
          <li className="sect" role="presentation">{remote.error ?? `“${draft.trim()}” bulunamadı. Kodu TradingView’daki gibi yazmayı dene: BIST:THYAO, OANDA:XAUUSD.`}</li>
        )}
      </ul>

      <div className="composer-foot">
        <span><kbd>↑</kbd> <kbd>↓</kbd> seç</span>
        <span><kbd>Enter</kbd> {formulaMode ? 'ekle / kaydet' : 'listeye ekle'}</span>
        <span><kbd>* / + −</kbd> formüle geç</span>
        <span className="spacer" />
        <span><kbd>Esc</kbd> kapat</span>
      </div>

      {saving && (
        <SaveFormula tokens={tokens} editing={editing} needed={needed} value={result?.value}
          labelOf={label} onCancel={() => setSaving(false)}
          onSaved={(f) => { setSaving(false); onClose(); toast(`${f.name} kaydedildi`); setQuery('s', f.key) }} />
      )}
    </Dialog>
  )
}

function previewToken(draft: string, best?: Candidate): string | undefined {
  const n = Fmt.parseInput(draft.trim())
  if (n != null) return String(n)
  return best?.key
}

function OPS_PENDING(draft: string) {
  return [...draft].some((c) => OPS.has(c))
}

function tokClass(t: string, isFormula: boolean) {
  if (isFunctionToken(t)) return 'fn'
  if (isNumberToken(t)) return 'num'
  if (isVariableToken(t)) return 'var' + (isFormula ? ' formula' : '')
  return 'op'
}

function ResultRow({ c, i, active, onPick, formulaMode, onHover }: { c: Candidate; i: number; active: number; onPick: (c: Candidate) => void; formulaMode: boolean; onHover: (i: number) => void }) {
  return (
    <li id={`cand-${i}`} role="option" aria-selected={i === active} className="result" onMouseMove={() => i !== active && onHover(i)}
      onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(c)}>
      <div style={{ minWidth: 0 }}>
        <div className="name">{c.isFormula && <span className="fx-mark" style={{ marginRight: 6 }}>ƒ</span>}{c.name}</div>
        <div className="meta">{c.meta}{c.inList && !formulaMode ? ', listende' : ''}</div>
      </div>
      <span className="num" style={{ fontWeight: 600 }}>{c.priceText ?? ''}</span>
      {c.change != null ? <ChangeBadge change={Fmt.changeFor(100 + c.change, 100, '')} /> : <span />}
    </li>
  )
}

function Suggestions({ onPick }: { onPick: (q: string) => void }) {
  const ideas: [string, string][] = [
    ['dolar', 'Dolar/TL'], ['altın.s1', 'Darphane altın sertifikası'], ['thyao', 'THY hissesi'], ['nvidia', 'Nvidia'],
    ['trhpi', 'Konut fiyat endeksi'], ['ons*dolar/oz', 'Gram altın formülü'], ['xu100/dolar', 'BIST 100, dolar bazında'],
  ]
  return (
    <>
      <li className="sect" role="presentation">Örnekler</li>
      {ideas.map(([q, l]) => (
        <li key={q} className="result" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(q)}>
          <div><div className="name">{q}</div><div className="meta">{l}</div></div><span /><span />
        </li>
      ))}
    </>
  )
}

function buildCandidates(query: string, formulas: Formula[], instruments: Instrument[], myList: Instrument[], quotes: Record<string, Quote>, hits: SearchHit[]): Candidate[] {
  const q = query.trim()
  if (!q) return []
  const n = fold(q)
  const engine = new FormulaEngine({ instruments, formulas, quotes })
  const score = (hay: string, name: string) => {
    const f = fold(hay)
    if (!f.includes(n)) return -1
    const fn = fold(name)
    return fn === n ? 3 : fn.startsWith(n) ? 2 : f.split(/[\s:/._-]/).some((w) => w.startsWith(n)) ? 1 : 0
  }
  const code = normalizeCode(q)
  const out: (Candidate & { s: number })[] = []
  for (const i of instruments) {
    const s = score([i.name, i.key, i.symbol, i.note, KEYWORDS[i.key]].filter(Boolean).join(' '), i.name)
    if (s < 0) continue
    const qq = quotes[i.key]
    const inList = myList.some((m) => m.key === i.key)
    out.push({
      key: i.key, name: i.name, meta: i.symbol, inList, instrument: inList ? undefined : i,
      price: qq?.price, priceText: qq ? Fmt.value(qq.price, i.decimals, i.prefix, i.suffix) : undefined,
      change: qq?.prevClose ? (qq.price / qq.prevClose - 1) * 100 : undefined,
      s: s + (code && (i.key === code || i.symbol.split(':')[1] === code) ? 10 : 0) + 0.5,
    })
  }
  for (const f of formulas) {
    const s = score(`${f.name} ${f.key}`, f.name)
    if (s < 0) continue
    const r = engine.evaluateKey(f.key)
    out.push({
      key: f.key, name: f.name, meta: 'Hesaplama', inList: true, isFormula: true,
      priceText: r.value != null ? Fmt.value(r.value, f.decimals, f.prefix, f.suffix) : undefined,
      change: r.value != null && r.prev ? (r.value / r.prev - 1) * 100 : undefined, s: s + 0.4,
    })
  }
  if ('oz'.startsWith(n) || n.includes('gram') || n.includes('ons')) {
    out.push({ key: 'OZ', name: 'OZ, ons → gram', meta: `Sabit ${Fmt.number(TROY_OUNCE_GRAMS, 7)}`, inList: true, isConstant: true, s: n === 'oz' ? 20 : -0.5 })
  }
  // Katalog (listede olmayanlar)
  const taken = allKeys()
  for (const c of CATALOG) {
    if (instruments.some((i) => i.symbol === c.symbol)) continue
    const s = score([c.name, c.key, c.symbol, c.note, KEYWORDS[c.key]].filter(Boolean).join(' '), c.name)
    if (s < 0) continue
    out.push({ key: uniqueKey(c.key, taken), name: c.name, meta: c.symbol, inList: false, instrument: { ...c, key: uniqueKey(c.key, taken) }, s: s + (code && c.symbol.split(':')[1] === code ? 10 : 0) })
  }
  // Piyasalar (TradingView)
  const seen = new Set([...instruments.map((i) => i.symbol.toUpperCase()), ...out.map((o) => o.meta.toUpperCase())])
  hits.forEach((h, idx) => {
    if (seen.has(h.symbol.toUpperCase())) return
    seen.add(h.symbol.toUpperCase())
    const ins = instrumentFromHit(h, [...taken, ...out.map((o) => o.key)])
    const exact = code && (h.ticker.toUpperCase() === code || h.symbol.split(':')[1] === code)
    out.push({
      key: ins.key, name: ins.name, meta: [h.symbol, h.typeLabel].filter(Boolean).join(', '), inList: false, instrument: ins,
      price: h.price, priceText: h.price != null ? Fmt.value(h.price, ins.decimals, ins.prefix, ins.suffix) : undefined, change: h.change,
      s: (exact ? 9 : 0) - idx * 0.01 - 1,
    })
  })
  return out.sort((a, b) => b.s - a.s).slice(0, 24)
}

/** Birim önerisi: dolar kuruyla çarpılıyorsa ₺, bölünüyorsa $; yüzde fonksiyonlarında %. */
export function suggestUnit(tokens: string[]): [string, string] {
  const i = tokens.indexOf('USDTRY')
  if (i > 0 && tokens[i - 1] === '/') return ['$', '']
  if (i >= 0 && (tokens[i - 1] === '*' || tokens[i + 1] === '*')) return ['', '₺']
  if (tokens[0] === 'pct(' || tokens[0] === 'chg(') return ['', '%']
  return ['', '']
}

/** Ad önerisi: ONS×USDTRY÷OZ → "Gram Altın", XU100÷USDTRY → "BIST 100 ($)" */
export function suggestName(tokens: string[], titleOf: (k: string) => string): string {
  const vars = tokens.filter((t) => isVariableToken(t) && t !== 'OZ')
  if (tokens.length === 5 && tokens[1] === '*' && tokens[2] === 'USDTRY' && tokens[3] === '/' && tokens[4] === 'OZ') {
    const n = titleOf(tokens[0])
    return n.startsWith('Ons ') ? 'Gram ' + n.slice(4) : `${n} (₺/gr)`
  }
  if (tokens.length === 3 && tokens[1] === '/' && tokens[2] === 'USDTRY') return titleOf(tokens[0]) + ' ($)'
  if (tokens.length === 3 && tokens[1] === '*' && tokens[2] === 'USDTRY') return titleOf(tokens[0]) + ' (₺)'
  if (tokens.length === 3 && tokens[1] === '/' && vars.length === 2) return `${titleOf(tokens[0])} / ${titleOf(tokens[2])}`
  return tokens.map((t) => (t === '*' ? '×' : t === '/' ? '÷' : isFunctionToken(t) ? FN_LABELS[t] ?? t : isVariableToken(t) ? titleOf(t) : t)).join(' ').slice(0, 40)
}

const decimalsFor = (v: number, suffix: string) => (suffix === '%' ? 2 : Math.abs(v) >= 1000 ? 2 : Math.abs(v) >= 1 ? 2 : 4)

function SaveFormula({ tokens, editing, needed, value, labelOf, onCancel, onSaved }: {
  tokens: string[]; editing?: Formula; needed: Instrument[]; value?: number
  labelOf: (t: string) => string; onCancel: () => void; onSaved: (f: Formula) => void
}) {
  const [name, setName] = useState(() => editing?.name ?? suggestName(tokens, labelOf))
  const initialUnit = editing ? (editing.prefix ? 'p:' + editing.prefix : editing.suffix ? 's:' + editing.suffix : '') : (() => {
    const [p, s] = suggestUnit(tokens)
    return p ? 'p:' + p : s ? 's:' + s : ''
  })()
  const [unit, setUnit] = useState(initialUnit)
  const [decimals, setDecimals] = useState(editing?.decimals ?? (value != null ? decimalsFor(value, unit.slice(2)) : 2))
  const expression = render(tokens)
  const prefix = unit.startsWith('p:') ? unit.slice(2) : ''
  const suffix = unit.startsWith('s:') ? unit.slice(2) : ''
  const save = () => {
    const nm = name.trim() || 'Formül'
    const key = editing?.key ?? uniqueKey(suggestKey(nm), [...allKeys(), ...needed.map((n) => n.key)])
    const f: Formula = { key, name: nm, expression, decimals, prefix, suffix }
    actions.upsertFormula(f, editing?.key, needed)
    onSaved(f)
  }
  return (
    <Dialog title={editing ? 'Formülü kaydet' : 'Formülü adlandır'} size="small" onClose={onCancel}
      footer={<>
        {editing && <button className="btn ghost danger left" onClick={() => { actions.removeKey(editing.key); onCancel() }}>Sil</button>}
        <button className="btn ghost" onClick={onCancel}>Geri dön</button>
        <button className="btn primary" onClick={save}>Kaydet</button>
      </>}>
      <div className="dialog-body">
        <div className="field">
          <label htmlFor="f-name">Ad</label>
          <input id="f-name" className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
        </div>
        <div className="field"><span className="label">Birim</span>
          <div className="chips">
            {[['', 'Yok'], ['s:₺', '₺'], ['p:$', '$'], ['p:€', '€'], ['s:%', '%']].map(([v, l]) => (
              <button key={v} className="chip" aria-pressed={unit === v} onClick={() => setUnit(v)}>{l}</button>
            ))}
          </div>
          <span className="help">% seçilirse günlük değişim puan farkı olarak gösterilir (%29,27 → %29,77: +0,50 p).</span>
        </div>
        <div className="field"><span className="label">Ondalık basamak</span>
          <div className="chips">{[0, 1, 2, 3, 4].map((d) => <button key={d} className="chip" aria-pressed={decimals === d} onClick={() => setDecimals(d)}>{d}</button>)}</div>
        </div>
        {value != null && <p className="note">Şu an: <b className="num">{Fmt.value(value, decimals, prefix, suffix)}</b></p>}
        {needed.length > 0 && <p className="note">Listene de eklenecek: {needed.map((n) => n.name).join(', ')}</p>}
      </div>
    </Dialog>
  )
}
