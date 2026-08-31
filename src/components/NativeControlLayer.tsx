import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type SupportedControl = HTMLSelectElement | HTMLInputElement
type ControlKind = 'select' | 'color' | 'date'
type ActiveControl = { element: SupportedControl; kind: ControlKind; title: string; value: string }

const COLOR_PRESETS = ['#f6c945', '#ffd166', '#f2b134', '#ff9f1c', '#ef5da8', '#8b5cf6', '#6c8cff', '#18a0aa', '#2fbf71', '#ef5350']
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

function controlKind(element: Element | null): ControlKind | null {
  if (element instanceof HTMLSelectElement) return 'select'
  if (!(element instanceof HTMLInputElement)) return null
  if (element.type === 'color') return 'color'
  if (element.type === 'date') return 'date'
  return null
}

function resolveControl(target: EventTarget | null): { element: SupportedControl; kind: ControlKind } | null {
  if (!(target instanceof HTMLElement)) return null
  const direct = target.closest('select, input[type="color"], input[type="date"]')
  const directKind = controlKind(direct)
  if (directKind && direct instanceof HTMLElement && 'disabled' in direct && !direct.disabled) return { element: direct as SupportedControl, kind: directKind }
  const label = target.closest('label')
  const labelled = label?.control ?? null
  const labelledKind = controlKind(labelled)
  if (labelledKind && labelled instanceof HTMLElement && 'disabled' in labelled && !labelled.disabled) return { element: labelled as SupportedControl, kind: labelledKind }
  return null
}

function controlTitle(element: SupportedControl, kind: ControlKind): string {
  const aria = element.getAttribute('aria-label')?.trim()
  if (aria) return aria
  const label = element.closest('label')
  const explicit = label?.querySelector(':scope > span, :scope > strong')?.textContent?.trim()
  if (explicit) return explicit
  if (element.name) return element.name
  return kind === 'select' ? '選択' : kind === 'color' ? '色を選択' : '日付を選択'
}

function setControlValue(element: SupportedControl, value: string) {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)) }

function hexToHsl(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : 'f6c945'
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const delta = max - min
  let h = 0
  if (delta) {
    if (max === r) h = 60 * (((g - b) / delta) % 6)
    else if (max === g) h = 60 * ((b - r) / delta + 2)
    else h = 60 * ((r - g) / delta + 4)
  }
  if (h < 0) h += 360
  const l = (max + min) / 2
  const s = delta ? delta / (1 - Math.abs(2 * l - 1)) : 0
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)]
}

function hslToHex(h: number, s: number, l: number): string {
  const saturation = clamp(s, 0, 100) / 100
  const lightness = clamp(l, 0, 100) / 100
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const section = ((h % 360) + 360) % 360 / 60
  const x = chroma * (1 - Math.abs(section % 2 - 1))
  let r = 0; let g = 0; let b = 0
  if (section < 1) [r, g] = [chroma, x]
  else if (section < 2) [r, g] = [x, chroma]
  else if (section < 3) [g, b] = [chroma, x]
  else if (section < 4) [g, b] = [x, chroma]
  else if (section < 5) [r, b] = [x, chroma]
  else [r, b] = [chroma, x]
  const m = lightness - chroma / 2
  return `#${[r, g, b].map((value) => Math.round((value + m) * 255).toString(16).padStart(2, '0')).join('')}`
}

function parseDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return new Date()
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function dateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function NativeControlLayer() {
  const [active, setActive] = useState<ActiveControl | null>(null)
  const [hsl, setHsl] = useState<[number, number, number]>([47, 90, 62])
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))

  const open = (element: SupportedControl, kind: ControlKind) => {
    const value = element.value
    setActive({ element, kind, title: controlTitle(element, kind), value })
    if (kind === 'color') setHsl(hexToHsl(value))
    if (kind === 'date') {
      const selected = parseDate(value)
      setCalendarMonth(new Date(selected.getFullYear(), selected.getMonth(), 1))
    }
  }

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const resolved = resolveControl(event.target)
      if (!resolved || event.button > 0) return
      event.preventDefault()
      open(resolved.element, resolved.kind)
    }
    const onClick = (event: MouseEvent) => {
      if (resolveControl(event.target)) event.preventDefault()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && active) { event.preventDefault(); setActive(null); return }
      const resolved = resolveControl(event.target)
      if (!resolved || !['Enter', ' ', 'ArrowDown'].includes(event.key)) return
      event.preventDefault()
      open(resolved.element, resolved.kind)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [active])

  const dateCells = useMemo(() => {
    const year = calendarMonth.getFullYear(); const month = calendarMonth.getMonth()
    const first = new Date(year, month, 1).getDay()
    return Array.from({ length: 42 }, (_, index) => new Date(year, month, index - first + 1))
  }, [calendarMonth])

  if (!active) return null

  const apply = (value: string, close = true) => {
    if (!active.element.isConnected) { setActive(null); return }
    setControlValue(active.element, value)
    setActive((current) => current ? { ...current, value } : current)
    if (close) setActive(null)
  }

  const updateHsl = (index: 0 | 1 | 2, value: number) => {
    const next: [number, number, number] = [...hsl]
    next[index] = value
    setHsl(next)
    apply(hslToHex(...next), false)
  }

  return <div className="vp-control-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setActive(null) }}>
    <section className="vp-control-sheet" role="dialog" aria-modal="true" aria-label={active.title} onPointerDown={(event) => event.stopPropagation()}>
      <header><div><span>VISTAPLAY CONTROL</span><h2>{active.title}</h2></div><button type="button" className="icon-button" onClick={() => setActive(null)} aria-label="閉じる"><X /></button></header>

      {active.kind === 'select' && <div className="vp-option-list">
        {Array.from((active.element as HTMLSelectElement).options).map((option) => <button type="button" className={`vp-option ${active.value === option.value ? 'selected' : ''}`} disabled={option.disabled} key={`${option.value}-${option.index}`} onClick={() => apply(option.value)}><span>{option.text}</span>{active.value === option.value && <Check />}</button>)}
      </div>}

      {active.kind === 'color' && <div className="vp-color-picker">
        <div className="vp-color-preview"><span style={{ background: active.value }} /><strong>{active.value.toUpperCase()}</strong></div>
        <div className="vp-color-presets" aria-label="色プリセット">{COLOR_PRESETS.map((color) => <button type="button" key={color} className={active.value.toLowerCase() === color ? 'selected' : ''} style={{ '--swatch': color } as React.CSSProperties} aria-label={color} onClick={() => { setHsl(hexToHsl(color)); apply(color, false) }}>{active.value.toLowerCase() === color && <Check />}</button>)}</div>
        <div className="vp-color-sliders">
          <label><span>色相 <strong>{hsl[0]}°</strong></span><input type="range" min="0" max="359" value={hsl[0]} onChange={(event) => updateHsl(0, Number(event.target.value))} style={{ '--range-hue': hsl[0] } as React.CSSProperties} /></label>
          <label><span>彩度 <strong>{hsl[1]}%</strong></span><input type="range" min="0" max="100" value={hsl[1]} onChange={(event) => updateHsl(1, Number(event.target.value))} /></label>
          <label><span>明るさ <strong>{hsl[2]}%</strong></span><input type="range" min="18" max="88" value={hsl[2]} onChange={(event) => updateHsl(2, Number(event.target.value))} /></label>
        </div>
        <div className="vp-color-footer"><input value={active.value.toUpperCase()} maxLength={7} aria-label="HEXカラー" onChange={(event) => { const value = event.target.value; setActive((current) => current ? { ...current, value } : current); if (/^#[0-9a-f]{6}$/i.test(value)) { setHsl(hexToHsl(value)); setControlValue(active.element, value.toLowerCase()) } }} /><button type="button" className="primary-button" onClick={() => setActive(null)}>完了</button></div>
      </div>}

      {active.kind === 'date' && <div className="vp-calendar">
        <div className="vp-calendar-heading"><button type="button" className="icon-button" aria-label="前の月" onClick={() => setCalendarMonth((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}><ChevronLeft /></button><strong>{calendarMonth.getFullYear()}年 {calendarMonth.getMonth() + 1}月</strong><button type="button" className="icon-button" aria-label="次の月" onClick={() => setCalendarMonth((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}><ChevronRight /></button></div>
        <div className="vp-calendar-grid vp-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="vp-calendar-grid">{dateCells.map((date) => { const value = dateValue(date); const input = active.element as HTMLInputElement; const outside = date.getMonth() !== calendarMonth.getMonth(); const disabled = Boolean((input.min && value < input.min) || (input.max && value > input.max)); return <button type="button" key={value} disabled={disabled} className={`${outside ? 'outside' : ''} ${active.value === value ? 'selected' : ''}`} onClick={() => apply(value)}>{date.getDate()}</button> })}</div>
        <div className="vp-calendar-footer"><button type="button" className="secondary-button" onClick={() => apply('')}>クリア</button><button type="button" className="secondary-button" onClick={() => { const today = new Date(); setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1)); apply(dateValue(today)) }}>今日</button></div>
      </div>}
    </section>
  </div>
}
