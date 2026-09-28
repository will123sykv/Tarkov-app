const rub = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** 4 → "04:00". */
export function formatHour(hour: number): string {
  return `${String(((Math.floor(hour) % 24) + 24) % 24).padStart(2, '0')}:00`
}

/** A time-of-day slot, e.g. 4, 1 → "04:00–05:00". */
export function formatSlot(startHour: number, hours: number): string {
  return `${formatHour(startHour)}–${formatHour(startHour + hours)}`
}

/** Compact roubles for axis ticks: 1500 → "₽1.5k", 2_000_000 → "₽2M". */
export function formatRubShort(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `₽${+(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `₽${+(value / 1_000).toFixed(1)}k`
  return `₽${Math.round(value)}`
}

/** Roubles to three significant figures for tight table cells: 595_719 → "₽596k", 99_807 → "₽99.8k". */
export function formatRubCompact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 999_500) return `₽${+(value / 1_000_000).toPrecision(3)}M`
  if (abs >= 1_000) return `₽${+(value / 1_000).toPrecision(3)}k`
  return `₽${Math.round(value)}`
}

export function formatRub(value: number | null | undefined): string {
  return value == null ? '—' : `₽${rub.format(Math.round(value))}`
}

export function formatAgo(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.floor(hours / 24)} days ago`
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/** 0.024 → "2.4%", 0.5 → "50%", 0.0004 → "<0.1%". */
export function formatPercent(fraction: number): string {
  const percent = fraction * 100
  if (percent > 0 && percent < 0.05) return '<0.1%'
  const oneDecimal = Math.round(percent * 10) / 10
  return oneDecimal >= 10 ? `${Math.round(percent)}%` : `${oneDecimal.toFixed(1)}%`
}

/** "2025-07" → "July 2025". */
export function formatDataMonth(month: string): string {
  const [year, m] = month.split('-').map(Number)
  if (!year || !m) return month
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  })
}
