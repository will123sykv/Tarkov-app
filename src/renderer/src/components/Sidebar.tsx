import { createContext, useContext } from 'react'
import type { AppView, SidebarSettings } from '../../../shared/types'
import { useStore } from '../store'

// Each tab's sidebar: any section can be taken out (by its heading) and brought back from the line at
// the bottom, and the whole sidebar can be folded away to give the content the width. Remembered per tab.

const NONE: SidebarSettings = { hidden: [], collapsed: false }

interface SidebarState {
  hidden: readonly string[]
  hide: (title: string) => void
}

const SidebarContext = createContext<SidebarState | null>(null)

export default function Sidebar({
  view,
  className,
  onScroll,
  children
}: {
  view: AppView
  className?: string
  onScroll?: React.UIEventHandler<HTMLElement>
  children: React.ReactNode
}): React.JSX.Element {
  const state = useStore((s) => s.settings?.sidebars[view]) ?? NONE
  const updateSettings = useStore((s) => s.updateSettings)
  const save = (patch: Partial<SidebarSettings>): void =>
    void updateSettings({ sidebars: { [view]: { ...state, ...patch } } })
  const show = (title: string | null): void =>
    save({ hidden: title === null ? [] : state.hidden.filter((t) => t !== title) })

  if (state.collapsed)
    return (
      <aside className={`sidebar collapsed ${className ?? ''}`}>
        <button
          className="button icon small sidebar-toggle"
          title="Show the sidebar"
          aria-label="Show the sidebar"
          onClick={() => save({ collapsed: false })}
        >
          »
        </button>
      </aside>
    )

  return (
    <aside className={`sidebar ${className ?? ''}`} onScroll={onScroll}>
      <button
        className="button icon small sidebar-toggle"
        title="Hide the sidebar"
        aria-label="Hide the sidebar"
        onClick={() => save({ collapsed: true })}
      >
        «
      </button>
      <SidebarContext.Provider
        value={{ hidden: state.hidden, hide: (title) => save({ hidden: [...state.hidden, title] }) }}
      >
        {children}
      </SidebarContext.Provider>
      {state.hidden.length > 0 && (
        <p className="hint sidebar-hidden">
          Hidden:{' '}
          {state.hidden.map((title, i) => (
            <span key={title}>
              {i > 0 && ', '}
              <button className="link" title="Show this section again" onClick={() => show(title)}>
                {title}
              </button>
            </span>
          ))}
          {state.hidden.length > 1 && (
            <>
              {' · '}
              <button className="link" onClick={() => show(null)}>
                Show all
              </button>
            </>
          )}
        </p>
      )}
    </aside>
  )
}

/** A sidebar section that can be taken out: nothing while it's hidden. `title` is its heading. */
export function SidebarSection({
  title,
  heading,
  actions,
  className,
  children
}: {
  title: string
  /** The heading as shown, when it says more than the title (a count, say). */
  heading?: React.ReactNode
  /** Controls beside the heading (a sort order, say). */
  actions?: React.ReactNode
  className?: string
  children?: React.ReactNode
}): React.JSX.Element | null {
  const sidebar = useContext(SidebarContext)
  if (sidebar?.hidden.includes(title)) return null
  return (
    <section className={className}>
      <div className="sidebar-head">
        <h2>{heading ?? title}</h2>
        {actions}
        {sidebar && (
          <button
            className="section-hide"
            title="Hide this section (bring it back from the bottom of the sidebar)"
            aria-label={`Hide ${title}`}
            onClick={() => sidebar.hide(title)}
          >
            ×
          </button>
        )}
      </div>
      {children}
    </section>
  )
}
