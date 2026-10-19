import { useEffect, useMemo, useRef, useState } from 'react'
import { dataModeFor } from '../../../shared/gameModes'
import type { AppView, PublicSettings } from '../../../shared/types'
import { useQuestRows } from '../lib/useQuestRows'
import { useStore } from '../store'

// One search box for quests, keys and items, opened with Ctrl+K from anywhere; picking a result opens
// the tab it lives on. Ctrl+1 to Ctrl+9 switch tabs. Since 1.47.0.

/** The tabs in the order they're shown, for Ctrl+1 to Ctrl+9. */
export const TAB_ORDER: AppView[] = [
  'loot',
  'trends',
  'todo',
  'quests',
  'hideout',
  'crafting',
  'keys',
  'maps',
  'raids'
]

const PER_GROUP = 6

interface Result {
  kind: 'quest' | 'key' | 'item'
  id: string
  name: string
  detail: string
}

const GROUPS: { kind: Result['kind']; title: string }[] = [
  { kind: 'quest', title: 'Quests' },
  { kind: 'key', title: 'Keys' },
  { kind: 'item', title: 'Items' }
]

/** Names that start with the text first, then ones that contain it; at most `limit`. */
function best<T>(list: readonly T[], term: string, names: (t: T) => string[], limit: number): T[] {
  const starts: T[] = []
  const contains: T[] = []
  for (const t of list) {
    const lower = names(t).map((n) => n.toLowerCase())
    if (lower.some((n) => n.startsWith(term))) starts.push(t)
    else if (lower.some((n) => n.includes(term))) contains.push(t)
    if (starts.length >= limit) break
  }
  return [...starts, ...contains].slice(0, limit)
}

/** Typing in a box (where shortcuts other than Ctrl+K are left alone). */
const typing = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

export default function QuickSearch({ settings }: { settings: PublicSettings }): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const updateSettings = useStore((s) => s.updateSettings)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      if (e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        return
      }
      const n = Number(e.key)
      if (Number.isInteger(n) && n >= 1 && n <= TAB_ORDER.length && !typing(e.target)) {
        e.preventDefault()
        setOpen(false)
        void updateSettings({ view: TAB_ORDER[n - 1] })
      }
    }
    const onOpen = (): void => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('quick-search', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('quick-search', onOpen)
    }
  }, [updateSettings])

  return open ? <SearchDialog settings={settings} onClose={() => setOpen(false)} /> : null
}

/** Open Quick search (from the top bar's button). */
export const openQuickSearch = (): void => void window.dispatchEvent(new Event('quick-search'))

function SearchDialog({
  settings,
  onClose
}: {
  settings: PublicSettings
  onClose: () => void
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const { rows } = useQuestRows(settings)
  const items = useStore((s) => s.prices[dataModeFor(settings.gameMode)]?.dataset?.items)
  const loadQuestData = useStore((s) => s.loadQuestData)
  const updateSettings = useStore((s) => s.updateSettings)
  const selectQuest = useStore((s) => s.selectQuest)
  const setSearch = useStore((s) => s.setSearch)
  const setKeysSearch = useStore((s) => s.setKeysSearch)

  useEffect(() => {
    input.current?.focus()
    void loadQuestData()
  }, [loadQuestData])

  const term = text.trim().toLowerCase()
  const results = useMemo<Result[]>(() => {
    if (!term) return []
    const keys = (items ?? []).filter((i) => i.types.includes('keys'))
    const others = (items ?? []).filter((i) => !i.types.includes('keys'))
    return [
      ...best(rows, term, (r) => [r.quest.name], PER_GROUP).map((r) => ({
        kind: 'quest' as const,
        id: r.quest.id,
        name: r.quest.name,
        detail: r.status[0].toUpperCase() + r.status.slice(1)
      })),
      ...best(keys, term, (i) => [i.name, i.shortName], PER_GROUP).map((i) => ({
        kind: 'key' as const,
        id: i.id,
        name: i.name,
        detail: i.shortName
      })),
      ...best(others, term, (i) => [i.name, i.shortName], PER_GROUP).map((i) => ({
        kind: 'item' as const,
        id: i.id,
        name: i.name,
        detail: i.shortName
      }))
    ]
  }, [term, rows, items])
  const current = Math.min(active, Math.max(0, results.length - 1))

  const pick = (r: Result): void => {
    onClose()
    if (r.kind === 'quest') {
      selectQuest(r.id)
      void updateSettings({ view: 'quests' })
    } else if (r.kind === 'key') {
      setKeysSearch(r.name)
      void updateSettings({ view: 'keys', keys: { ...settings.keys, map: null, otherOpen: true } })
    } else {
      setSearch(r.name)
      // Every item, so a container picked before doesn't hide it.
      void updateSettings({ view: 'loot', pool: { ...settings.pool, containerId: null } })
    }
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((current + 1) % Math.max(1, results.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((current - 1 + results.length) % Math.max(1, results.length))
    } else if (e.key === 'Enter' && results[current]) pick(results[current])
  }

  return (
    <div className="quick-search-backdrop" onMouseDown={onClose}>
      <div
        className="quick-search"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <input
          ref={input}
          type="search"
          placeholder="Search quests, keys and items"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setActive(0)
          }}
          aria-controls="quick-search-results"
        />
        <div id="quick-search-results" className="quick-search-results" role="listbox">
          {!term ? (
            <p className="hint">
              Type a quest, key or item. ↑ ↓ to pick, Enter to open, Esc to close. Ctrl+1 to Ctrl+9 switch
              tabs.
            </p>
          ) : results.length === 0 ? (
            <p className="hint">Nothing matches &ldquo;{text.trim()}&rdquo;.</p>
          ) : (
            GROUPS.map(({ kind, title }) => {
              const group = results.filter((r) => r.kind === kind)
              if (!group.length) return null
              return (
                <div key={kind}>
                  <h3>{title}</h3>
                  {group.map((r) => {
                    const index = results.indexOf(r)
                    return (
                      <button
                        key={`${kind}:${r.id}`}
                        role="option"
                        aria-selected={index === current}
                        className={index === current ? 'active' : ''}
                        // Moving the pointer picks a result; results appearing under a still one don't.
                        onMouseMove={() => index !== current && setActive(index)}
                        onClick={() => pick(r)}
                      >
                        <span>{r.name}</span>
                        <span className="muted">{r.detail}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
