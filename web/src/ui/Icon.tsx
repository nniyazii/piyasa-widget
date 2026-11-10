/** Elle çizilmiş, tek çizgi kalınlığında küçük simge seti (24×24). */
const PATHS: Record<string, string> = {
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.5 15.5 20 20',
  plus: 'M12 5v14M5 12h14',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.3.9a7.5 7.5 0 0 0-2.6-1.5L14 2.6h-4l-.4 2.4A7.5 7.5 0 0 0 7 6.5l-2.3-.9-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.3-.9a7.5 7.5 0 0 0 2.6 1.5l.4 2.4h4l.4-2.4a7.5 7.5 0 0 0 2.6-1.5l2.3.9 2-3.4Z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  boards: 'M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z',
  filter: 'M4 5h16l-6 7.5V19l-4 1v-7.5L4 5Z',
  close: 'M6 6l12 12M18 6 6 18',
  more: 'M12 6.5h.01M12 12h.01M12 17.5h.01',
  grip: 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01',
  external: 'M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  trash: 'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4',
  check: 'M5 12.5 10 17 19 7',
  chevronDown: 'M6 9l6 6 6-6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
  download: 'M12 4v11M7 10.5l5 5 5-5M5 20h14',
  upload: 'M12 15V4M7 8.5l5-5 5 5M5 20h14',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  pin: 'M5 12h14M12 5v14',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  formula: 'M14.5 4.5c-2 0-2.6 1.3-3 3.3L9.6 17c-.4 2-1 3-3 3M7.5 10h7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2',
  back: 'M10 6l-6 6 6 6M4 12h16',
  play: 'M7 5l12 7-12 7V5Z',
  wifiOff: 'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.5-2.8M19 13a10 10 0 0 0-2.4-1.7M2 9.5a15 15 0 0 1 4.7-2.9M12 20h.01',
}

export function Icon({ name, label, className }: { name: keyof typeof PATHS | string; label?: string; className?: string }) {
  return (
    <svg className={'i' + (className ? ' ' + className : '')} viewBox="0 0 24 24" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}
      style={name === 'more' || name === 'grip' ? { strokeWidth: 3 } : undefined}>
      <path d={PATHS[name] ?? ''} />
    </svg>
  )
}
