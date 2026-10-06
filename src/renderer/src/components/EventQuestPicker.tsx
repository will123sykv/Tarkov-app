import { useEffect, useMemo, useRef, useState } from 'react'
import type { WikiQuestEntry } from '../../../shared/questTypes'
import { useStore } from '../store'

// Event quests (Fog of War…) aren't on tarkov.dev, so they're picked from the Escape from Tarkov
// wiki's list of event quests (this event's first; past events' on request), or pasted as a link or
// a name. The ones ticked are read from the wiki and shown under their trader.

/** The wiki's event quests to tick, the ones the added quests lead to, and a box for a link or a name. */
export default function EventQuestPicker({
  added,
  next,
  onClose
}: {
  /** Page titles already added. */
  added: readonly string[]
  /** Quests the added ones lead to, not added yet. */
  next: readonly string[]
  onClose: () => void
}): React.JSX.Element {
  const addWikiQuests = useStore((s) => s.addWikiQuests)
  const removeWikiQuest = useStore((s) => s.removeWikiQuest)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [list, setList] = useState<{ quests: WikiQuestEntry[]; error: string | null } | null>(null)
  const [search, setSearch] = useState('')
  const [showPast, setShowPast] = useState(false)
  const [link, setLink] = useState('')
  const [linkState, setLinkState] = useState<{ busy: boolean; message: string | null }>({
    busy: false,
    message: null
  })

  useEffect(() => {
    dialogRef.current?.showModal()
    let live = true
    void window.api
      .getWikiQuestList()
      .then((result) => live && setList(result))
      .catch((err: unknown) => live && setList({ quests: [], error: String(err) }))
    return () => {
      live = false
    }
  }, [])

  const have = useMemo(() => new Set(added), [added])
  const term = search.trim().toLowerCase()
  const quests = list?.quests ?? []
  const pastCount = quests.filter((q) => q.past).length
  const shown = quests.filter((q) => (showPast || !q.past) && (!term || q.title.toLowerCase().includes(term)))
  // Added from a link (not on the list), so they can be unticked here too.
  const extra = added.filter((t) => !quests.some((q) => q.title === t))

  const toggle = (title: string, on: boolean): void =>
    void (on ? addWikiQuests([title]) : removeWikiQuest(title))

  const addLink = async (): Promise<void> => {
    if (!link.trim()) return
    setLinkState({ busy: true, message: null })
    const result = await window.api.resolveWikiQuest(link).catch((err: unknown) => ({ error: String(err) }))
    if ('title' in result) {
      await addWikiQuests([result.title])
      setLink('')
      setLinkState({ busy: false, message: `Added ${result.title}.` })
    } else setLinkState({ busy: false, message: result.error })
  }

  const row = (title: string, past: boolean): React.JSX.Element => (
    <li key={title}>
      <label className="check">
        <input type="checkbox" checked={have.has(title)} onChange={(e) => toggle(title, e.target.checked)} />
        <span className="grow">{title}</span>
        {past && <span className="tag">past event</span>}
      </label>
    </li>
  )

  return (
    <dialog ref={dialogRef} className="dialog event-picker" onClose={onClose} aria-label="Event quests">
      <header>
        <h2>Event quests</h2>
        <button className="button icon" onClick={() => dialogRef.current?.close()} aria-label="Close">
          ✕
        </button>
      </header>
      <section>
        <p className="hint">
          tarkov.dev doesn&rsquo;t list event quests, so these come from the Escape from Tarkov wiki. Tick the
          ones you have: they&rsquo;re read from their pages and shown under their trader, with their
          objectives and rewards. The game&rsquo;s logs don&rsquo;t name them, so set their status yourself.
        </p>
        {next.length > 0 && (
          <div className="event-next">
            <span className="muted">Leads on from yours:</span>
            {next.map((title) => (
              <button key={title} className="button small" onClick={() => void addWikiQuests([title])}>
                + {title}
              </button>
            ))}
          </div>
        )}
        <div className="inline">
          <input
            type="search"
            placeholder="Search event quests"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search event quests"
          />
        </div>
        {!list ? (
          <p className="hint">Loading the wiki&rsquo;s event quests…</p>
        ) : (
          <>
            {list.error && (
              <p className="hint error">
                Couldn&rsquo;t load the wiki&rsquo;s list{quests.length ? ' (showing the last one)' : ''}:{' '}
                {list.error}
              </p>
            )}
            <ul className="event-list">
              {extra.map((title) => row(title, false))}
              {shown.map((q) => row(q.title, q.past))}
              {!shown.length && !extra.length && (
                <li className="muted">
                  {term ? 'No event quest matches.' : 'The wiki lists no event quests right now.'}
                </li>
              )}
            </ul>
            {pastCount > 0 && (
              <label className="check">
                <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
                Show past events&rsquo; quests ({pastCount})
              </label>
            )}
          </>
        )}
      </section>
      <section>
        <h3>Not on the list?</h3>
        <form
          className="inline"
          onSubmit={(e) => {
            e.preventDefault()
            void addLink()
          }}
        >
          <input
            type="text"
            placeholder="Paste a wiki link or a quest's name"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            aria-label="Wiki link or quest name"
          />
          <button className="button small" type="submit" disabled={linkState.busy || !link.trim()}>
            {linkState.busy ? 'Adding…' : 'Add'}
          </button>
        </form>
        {linkState.message && <p className="hint">{linkState.message}</p>}
      </section>
    </dialog>
  )
}
