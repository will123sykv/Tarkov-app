import { useEffect, useState } from 'react'
import type { QuestGuideState } from '../../../shared/questTypes'

/** Guides fetched this session, by wiki link (failures are retried the next time). */
const loaded = new Map<string, QuestGuideState>()

/** The guide on a quest's wiki page: null while it loads (or when the quest has no page). */
export function useQuestGuide(wikiLink: string | null): QuestGuideState | null {
  const [result, setResult] = useState<{ link: string; state: QuestGuideState } | null>(null)

  useEffect(() => {
    if (!wikiLink || loaded.has(wikiLink)) return
    let live = true
    window.api
      .getQuestGuide(wikiLink)
      .then((state) => {
        if (state.guide && !state.error) loaded.set(wikiLink, state)
        return state
      })
      .catch((err: unknown): QuestGuideState => ({ guide: null, error: String(err) }))
      .then((state) => {
        if (live) setResult({ link: wikiLink, state })
      })
    return () => {
      live = false
    }
  }, [wikiLink])

  if (!wikiLink) return null
  return loaded.get(wikiLink) ?? (result?.link === wikiLink ? result.state : null)
}
