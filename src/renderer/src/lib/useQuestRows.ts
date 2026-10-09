import { useEffect, useMemo } from 'react'
import { dataModeFor } from '../../../shared/gameModes'
import { EMPTY_HIDEOUT } from '../../../shared/hideout'
import { detectObjectives, withDetected, type DetectedProgress } from '../../../shared/objectiveDetection'
import {
  forFaction,
  questStatus,
  type ObjectiveProgress,
  type QuestContext,
  type QuestStatus
} from '../../../shared/questProgress'
import type { GameMap, Quest, QuestDataState } from '../../../shared/questTypes'
import type { PublicSettings } from '../../../shared/types'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import { storyQuests } from '../../../shared/storyQuests'
import { applyWikiCorrections } from '../../../shared/wikiCorrections'
import { gameQuestIds, wikiQuestId, wikiQuestIdIn, wikiQuests } from '../../../shared/wikiQuests'
import { useStore } from '../store'
import { mapPlaces, raidMapLookup } from './storyMaps'

export interface QuestRow {
  quest: Quest
  status: QuestStatus
}

export interface QuestRows {
  questState: QuestDataState | undefined
  /** Every quest for the player's faction (and every story chapter), with its status. */
  rows: QuestRow[]
  ctx: QuestContext
  questsById: ReadonlyMap<string, Quest>
  mapsById: ReadonlyMap<string, GameMap>
  /** How far along each objective is: ticked off by the player, or detected (whichever is further). */
  objectives: ObjectiveProgress
  /** What the app worked out by itself, and how. */
  detected: DetectedProgress
}

/**
 * Loads quest data and progress for the current game mode, and works out each quest's status.
 * Before the settings load (null), it waits and returns nothing.
 */
export function useQuestRows(current: PublicSettings | null): QuestRows {
  const ready = current !== null
  const settings = current ?? DEFAULT_SETTINGS
  const dataMode = dataModeFor(settings.gameMode)
  const questState = useStore((s) => s.questData[dataMode])
  const priceItems = useStore((s) => s.prices[dataMode]?.dataset?.items)
  const progress = useStore((s) => s.questProgress[settings.gameMode])
  const ticked = useStore((s) => s.objectiveProgress[settings.gameMode])
  const traderLevels = useStore((s) => s.hideoutProgress[settings.gameMode]?.traders) ?? EMPTY_HIDEOUT.traders
  const raids = useStore((s) => s.logHistory[settings.gameMode]?.raids)
  const pins = useStore((s) => s.storyPins)
  const loadQuestData = useStore((s) => s.loadQuestData)
  const loadPlayerData = useStore((s) => s.loadPlayerData)
  const wikiState = useStore((s) => s.wikiQuests)
  const loadWikiQuests = useStore((s) => s.loadWikiQuests)
  const wikiTitles = settings.quests.wikiQuests

  useEffect(() => {
    if (ready) void loadQuestData()
  }, [loadQuestData, dataMode, ready])
  useEffect(() => {
    if (ready) void loadPlayerData()
  }, [loadPlayerData, settings.gameMode, ready])
  useEffect(() => {
    if (ready) void loadWikiQuests(wikiTitles, dataMode)
  }, [loadWikiQuests, wikiTitles, dataMode, ready])

  const dataset = questState?.dataset ?? null
  const level = settings.playerLevels[settings.gameMode]
  const faction = settings.quests.faction
  const traders = useMemo(() => new Map((dataset?.traders ?? []).map((t) => [t.id, t])), [dataset])
  const ctx = useMemo<QuestContext>(
    () => ({ playerLevel: level, faction, traders }),
    [level, faction, traders]
  )
  // Story chapters' hand-overs name their items: match them to the price data's items.
  const itemIds = useMemo(
    () => new Map((priceItems ?? []).map((i) => [i.name.toLowerCase(), i.id])),
    [priceItems]
  )
  const traderIds = useMemo(
    () => new Map((dataset?.traders ?? []).map((t) => [t.name.toLowerCase(), t.id])),
    [dataset]
  )
  const places = useMemo(() => mapPlaces(dataset?.maps ?? []), [dataset])
  // tarkov.dev's quests, corrected from their wiki pages unless that's switched off.
  const correct = settings.quests.wikiCorrections
  const gameMode = settings.gameMode
  const corrected = useMemo(() => {
    const listed = dataset?.quests ?? []
    if (!correct || !dataset?.wikiFacts) return listed
    const questIds = new Map(
      listed.flatMap((q) => {
        const name = q.name.toLowerCase()
        // tarkov.dev marks some with the zone ("… [PVP ZONE]"); the wiki doesn't.
        const bare = name.replace(/\s*\[(pvp|pve) zone\]$/, '')
        return [[name, q.id] as const, [bare, q.id] as const]
      })
    )
    return applyWikiCorrections(listed, dataset.wikiFacts, {
      gameMode,
      questIds,
      mapNames: new Map(dataset.maps.map((m) => [m.id, m.name])),
      itemIds,
      traderIds
    })
  }, [dataset, correct, gameMode, itemIds, traderIds])
  const withWikiOnly = settings.quests.wikiOnlyQuests
  const quests = useMemo(() => {
    const listed = corrected
    const story = storyQuests(dataset?.storyChapters ?? [], { itemIds, traderIds, places, pins })
    // Event quests added from the wiki, unless tarkov.dev lists them by now.
    const names = new Set(listed.map((q) => q.name.toLowerCase()))
    const pages = (wikiState?.quests ?? []).filter((w) => !names.has(w.name.toLowerCase()))
    // Quests only the wiki has, unless tarkov.dev or an added event quest has them; the seasonal
    // mode's only in it.
    for (const w of pages) names.add(w.name.toLowerCase())
    const only = withWikiOnly
      ? (dataset?.wikiOnlyQuests ?? []).filter(
          (w) => !names.has(w.name.toLowerCase()) && (!w.season || gameMode === 'season')
        )
      : []
    const gameIds = gameQuestIds(dataset?.otherQuestNames ?? {})
    // For "after": by name, and by page title for the wiki's.
    const questIds = new Map([
      ...[...listed, ...story].map((q) => [q.name.toLowerCase(), q.id] as const),
      ...pages.map((w) => [w.title.toLowerCase(), wikiQuestId(w.title)] as const),
      ...only.flatMap((w) => {
        const id = wikiQuestIdIn(w, { gameIds })
        return [[w.title.toLowerCase(), id] as const, [w.name.toLowerCase(), id] as const]
      })
    ])
    return [
      ...listed,
      ...story,
      ...wikiQuests(pages, { itemIds, traderIds, questIds }),
      ...wikiQuests(only, { itemIds, traderIds, questIds, gameIds }, { listed: true })
    ]
  }, [dataset, corrected, itemIds, traderIds, places, pins, wikiState, withWikiOnly, gameMode])
  const questsById = useMemo(() => new Map(quests.map((q) => [q.id, q])), [quests])
  const mapsById = useMemo(() => new Map((dataset?.maps ?? []).map((m) => [m.id, m])), [dataset])
  const rows = useMemo<QuestRow[]>(
    () =>
      quests
        .filter((q) => forFaction(q, ctx.faction))
        .map((q) => ({ quest: q, status: questStatus(q, progress ?? {}, ctx, questsById) })),
    [quests, progress, ctx, questsById]
  )
  const raidMaps = useMemo(() => raidMapLookup(dataset?.maps ?? []), [dataset])
  const detected = useMemo(
    () =>
      detectObjectives(quests, {
        playerLevel: level,
        traderLevels,
        progress: progress ?? {},
        raids: raids ?? [],
        raidMaps,
        traderName: (id) => traders.get(id)?.name,
        questName: (id) => questsById.get(id)?.name,
        mapName: (id) => mapsById.get(id)?.name
      }),
    [quests, level, traderLevels, progress, raids, raidMaps, traders, questsById, mapsById]
  )
  const objectives = useMemo(() => withDetected(ticked, detected), [ticked, detected])
  return { questState, rows, ctx, questsById, mapsById, objectives, detected }
}
