import { useEffect, useRef, useState } from 'react'
import { WIKI_PARTITION } from '../../../shared/questWiki'

/** The parts of Electron's `<webview>` element used here. */
interface WebviewElement extends HTMLElement {
  reload(): void
  loadURL(url: string): Promise<void>
  goBack(): void
  goForward(): void
  canGoBack(): boolean
  canGoForward(): boolean
  getURL(): string
}

/**
 * A quest's page on the Escape from Tarkov wiki, inside the quest panel (since 1.60.0). The main
 * process lets only the wiki load here, in its own session; links off it open in the browser. Says so
 * when it can't be loaded, offline or blocked, with a way to try again.
 */
export default function QuestWikiView({
  url,
  onBack
}: {
  url: string
  onBack: () => void
}): React.JSX.Element {
  const view = useRef<WebviewElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [nav, setNav] = useState({ back: false, forward: false, current: url })
  useEffect(() => {
    const el = view.current
    if (!el) return
    const update = (): void => {
      try {
        setNav({ back: el.canGoBack(), forward: el.canGoForward(), current: el.getURL() || url })
      } catch {
        // Not attached yet.
      }
    }
    const onStart = (): void => setState('loading')
    const onStop = (): void => {
      setState((s) => (s === 'failed' ? s : 'ready'))
      update()
    }
    // -3 is a navigation the page itself cancelled: not a failure.
    const onFail = (e: Event): void => {
      const { errorCode, isMainFrame } = e as Event & { errorCode: number; isMainFrame: boolean }
      if (isMainFrame && errorCode !== -3) setState('failed')
    }
    el.addEventListener('did-start-loading', onStart)
    el.addEventListener('did-stop-loading', onStop)
    el.addEventListener('did-fail-load', onFail)
    el.addEventListener('did-navigate', update)
    el.addEventListener('did-navigate-in-page', update)
    return () => {
      el.removeEventListener('did-start-loading', onStart)
      el.removeEventListener('did-stop-loading', onStop)
      el.removeEventListener('did-fail-load', onFail)
      el.removeEventListener('did-navigate', update)
      el.removeEventListener('did-navigate-in-page', update)
    }
  }, [url])
  const retry = (): void => {
    setState('loading')
    void view.current?.loadURL(nav.current).catch(() => setState('failed'))
  }
  return (
    <div className="quest-wiki">
      <div className="quest-wiki-bar">
        <button className="button small" title="Back to the quest's details" onClick={onBack}>
          ◀ Quest
        </button>
        <button
          className="button icon small"
          aria-label="Back"
          title="Back"
          disabled={!nav.back}
          onClick={() => view.current?.goBack()}
        >
          ‹
        </button>
        <button
          className="button icon small"
          aria-label="Forward"
          title="Forward"
          disabled={!nav.forward}
          onClick={() => view.current?.goForward()}
        >
          ›
        </button>
        <button className="link small" onClick={() => view.current?.reload()}>
          Reload
        </button>
        <span className="muted small">{state === 'loading' ? 'Loading…' : 'Escape from Tarkov Wiki'}</span>
        <a className="link small" href={nav.current} target="_blank" rel="noreferrer">
          Open in browser ↗
        </a>
      </div>
      {/* Pop-ups reach the main process, which opens wiki ones here and the rest in the browser. */}
      <webview
        ref={view}
        className="quest-wiki-page"
        src={url}
        partition={WIKI_PARTITION}
        // As a string: React leaves `allowpopups={true}` off the element.
        {...({ allowpopups: 'true' } as object)}
      />
      {state === 'failed' && (
        <div className="quest-wiki-failed" role="alert">
          <p>The wiki couldn&rsquo;t be loaded (offline?).</p>
          <p>
            <button className="button small" onClick={retry}>
              Try again
            </button>{' '}
            <a className="button small" href={nav.current} target="_blank" rel="noreferrer">
              Open in browser ↗
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
