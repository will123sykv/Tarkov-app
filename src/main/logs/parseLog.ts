/** One entry of an Escape from Tarkov log file. */
export interface LogEntry {
  /** Epoch ms. */
  t: number
  /** Everything after the timestamp, e.g. `1.0.0.0.40087|Info|application|Session mode: Pve`. */
  message: string
  /** The JSON block written under the entry (notifications carry one), parsed; null when absent. */
  json: unknown
}

// `2025-11-20 18:43:12.345 +01:00|…`; the time zone offset is missing in older versions.
const HEADER = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}\.\d{3})( [+-]\d{2}:\d{2})?\|(.*)$/

function parseTime(date: string, time: string, offset: string | undefined): number {
  return offset ? Date.parse(`${date}T${time}${offset.trim()}`) : new Date(`${date}T${time}`).getTime()
}

function toEntry(header: RegExpExecArray, body: string[]): LogEntry {
  const text = body.join('\n').trim()
  let json: unknown = null
  if (text.startsWith('{')) {
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
  }
  return { t: parseTime(header[1], header[2], header[3]), message: header[4], json }
}

/**
 * Split log text into entries. With `complete: false` (the file may still be being written), the
 * last entry is held back and `consumed` stops where it starts, so the next read picks it up whole.
 */
export function parseLogText(text: string, complete = true): { entries: LogEntry[]; consumed: number } {
  const entries: LogEntry[] = []
  let header: RegExpExecArray | null = null
  let body: string[] = []
  let headerStart = 0
  let pos = 0
  while (pos < text.length) {
    const end = text.indexOf('\n', pos)
    const lineEnd = end === -1 ? text.length : end
    const line = text.slice(pos, lineEnd).replace(/\r$/, '')
    const match = HEADER.exec(line)
    if (match) {
      if (header) entries.push(toEntry(header, body))
      header = match
      body = []
      headerStart = pos
    } else if (header) {
      body.push(line)
    }
    pos = end === -1 ? text.length : end + 1
  }
  if (!header) return { entries, consumed: complete ? text.length : 0 }
  if (complete) {
    entries.push(toEntry(header, body))
    return { entries, consumed: text.length }
  }
  return { entries, consumed: headerStart }
}
