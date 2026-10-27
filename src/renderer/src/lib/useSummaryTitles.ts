import { useEffect } from 'react'

const DESCRIPTION = '.summary-title > .muted'

/**
 * A page's description is kept to one line (since 1.67.0): when it's cut off, pointing at it shows the
 * whole of it. One listener for every tab, set as the pointer comes over it, so it's always current.
 */
export function useSummaryTitles(): void {
  useEffect(() => {
    const onOver = (e: MouseEvent): void => {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>(DESCRIPTION) : null
      if (!el) return
      if (el.scrollWidth > el.clientWidth) el.title = el.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      else el.removeAttribute('title')
    }
    document.addEventListener('mouseover', onOver)
    return () => document.removeEventListener('mouseover', onOver)
  }, [])
}
