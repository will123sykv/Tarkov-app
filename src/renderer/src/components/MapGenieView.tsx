import { useEffect, useRef, useState } from 'react'
import { MAP_GENIE_LAB, MAP_GENIE_PARTITION } from '../../../shared/mapGenie'

/** The parts of Electron's `<webview>` element used here. */
interface WebviewElement extends HTMLElement {
  reload(): void
  loadURL(url: string): Promise<void>
}

/**
 * Map Genie's interactive Lab map, as its own page (the main process only lets this page, in its own
 * session, be shown). Says so when it can't be loaded, offline or blocked, with a way to try again.
 */
export default function MapGenieView({ onBack }: { onBack: () => void }): React.JSX.Element {
  const view = useRef<WebviewElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  useEffect(() => {
    const el = view.current
    if (!el) return
    const onStart = (): void => setState('loading')
    const onStop = (): void => setState((s) => (s === 'failed' ? s : 'ready'))
    // -3 is a navigation the page itself cancelled: not a failure.
    const onFail = (e: Event): void => {
      const { errorCode, isMainFrame } = e as Event & { errorCode: number; isMainFrame: boolean }
      if (isMainFrame && errorCode !== -3) setState('failed')
    }
    el.addEventListener('did-start-loading', onStart)
    el.addEventListener('did-stop-loading', onStop)
    el.addEventListener('did-fail-load', onFail)
    return () => {
      el.removeEventListener('did-start-loading', onStart)
      el.removeEventListener('did-stop-loading', onStop)
      el.removeEventListener('did-fail-load', onFail)
    }
  }, [])
  const retry = (): void => {
    setState('loading')
    void view.current?.loadURL(MAP_GENIE_LAB).catch(() => setState('failed'))
  }
  return (
    <div className="map-genie">
      <div className="map-genie-bar">
        <span>
          Map Genie&rsquo;s Lab map
          {state === 'loading' && <span className="muted"> · loading…</span>}
        </span>
        <button className="link small" onClick={() => view.current?.reload()}>
          Reload
        </button>
        <a className="link small" href={MAP_GENIE_LAB} target="_blank" rel="noreferrer">
          Open in browser
        </a>
        <button className="link small" onClick={onBack}>
          Back to this app&rsquo;s map
        </button>
      </div>
      <webview ref={view} className="map-genie-page" src={MAP_GENIE_LAB} partition={MAP_GENIE_PARTITION} />
      {state === 'failed' && (
        <div className="map-genie-failed" role="alert">
          <p>Map Genie&rsquo;s map couldn&rsquo;t be loaded (offline?).</p>
          <p>
            <button className="button small" onClick={retry}>
              Try again
            </button>{' '}
            <a className="button small" href={MAP_GENIE_LAB} target="_blank" rel="noreferrer">
              Open in browser
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
