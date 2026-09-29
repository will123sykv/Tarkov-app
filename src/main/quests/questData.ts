import { join } from 'node:path'
import type {
  GameMap,
  MapExtract,
  Quest,
  QuestDataset,
  QuestDataState,
  QuestObjective,
  QuestZone,
  RequirementStatus,
  Vec3
} from '../../shared/questTypes'
import type { DataMode } from '../../shared/types'
import { readJsonFile, writeJsonFileAtomic } from '../jsonFile'
import { errorMessage, type FetchFn } from '../pricing/http'
import { fetchJsonData, translator, values, type Collection } from '../pricing/tarkovDevJson'

type Raw = Record<string, unknown>
type Dict = Record<string, string>

/** Quests and maps rarely change: refresh twice a day. */
const MAX_AGE_MS = 12 * 3_600_000

export interface QuestDataInput {
  tasks: Raw
  tasksLang: Dict
  maps: Raw
  mapsLang: Dict
  traders: Collection<Raw> | Raw
  tradersLang: Dict
}

const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const rec = (value: unknown): Raw =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {}
const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

function vec(value: unknown): Vec3 | null {
  const v = rec(value)
  const x = num(v.x)
  const y = num(v.y)
  const z = num(v.z)
  return x === null || y === null || z === null ? null : { x, y, z }
}

const vecs = (value: unknown): Vec3[] =>
  arr(value)
    .map(vec)
    .filter((v): v is Vec3 => v !== null)

function zones(value: unknown): QuestZone[] {
  const result: QuestZone[] = []
  for (const raw of arr(value)) {
    const z = rec(raw)
    const map = str(z.map) ?? str(rec(z.map).id)
    const position = vec(z.position)
    if (map && position) result.push({ map, position, outline: vecs(z.outline) })
  }
  return result
}

function requirementStatus(value: unknown): RequirementStatus[] {
  const statuses = arr(value).map((s) => String(s).toLowerCase())
  const result = new Set<RequirementStatus>()
  for (const s of statuses) {
    if (s.startsWith('complete') || s === 'success') result.add('complete')
    else if (s === 'active' || s === 'started') result.add('active')
    else if (s.startsWith('fail')) result.add('failed')
  }
  return result.size ? [...result] : ['complete']
}

export function normalizeQuestData(
  input: QuestDataInput,
  dataMode: DataMode,
  fetchedAt: number
): QuestDataset {
  const t = translator(input.tasksLang)
  const tm = translator(input.mapsLang)
  const tt = translator(input.tradersLang)
  const questItems = rec(input.tasks.questItems)

  const quests: Quest[] = []
  for (const raw of values(input.tasks.tasks as Collection<Raw>)) {
    const id = str(raw.id)
    if (!id) continue
    const objectives: QuestObjective[] = arr(raw.objectives).map((o) => {
      const obj = rec(o)
      const questItemId = str(obj.questItem) ?? str(rec(obj.questItem).id)
      const questItem = questItemId
        ? {
            id: questItemId,
            name: t(str(rec(questItems[questItemId]).name) ?? `${questItemId} Name`) ?? questItemId
          }
        : null
      const items = [...arr(obj.items), obj.item, obj.markerItem]
        .map((i) => str(i) ?? str(rec(i).id))
        .filter((i): i is string => i !== null)
      return {
        id: str(obj.id) ?? '',
        type: str(obj.type) ?? 'unknown',
        description: t(str(obj.description)) ?? '',
        optional: obj.optional === true,
        count: num(obj.count),
        maps: arr(obj.maps)
          .map((m) => str(m) ?? str(rec(m).id))
          .filter((m): m is string => m !== null),
        items: [...new Set(items)],
        foundInRaid: obj.foundInRaid === true,
        questItem,
        zones: zones(obj.zones),
        locations: arr(obj.possibleLocations)
          .map((l) => ({
            map: str(rec(l).map) ?? str(rec(rec(l).map).id) ?? '',
            positions: vecs(rec(l).positions)
          }))
          .filter((l) => l.map && l.positions.length)
      }
    })
    quests.push({
      id,
      name: t(str(raw.name)) ?? id,
      normalizedName: str(raw.normalizedName) ?? id,
      traderId: str(raw.trader) ?? str(rec(raw.trader).id) ?? '',
      wikiLink: str(raw.wikiLink),
      minPlayerLevel: num(raw.minPlayerLevel) ?? 0,
      requires: arr(raw.taskRequirements)
        .map((r) => {
          const req = rec(r)
          const questId = str(req.task) ?? str(rec(req.task).id)
          return questId ? { questId, status: requirementStatus(req.status) } : null
        })
        .filter((r): r is Quest['requires'][number] => r !== null),
      objectives,
      map: str(raw.map) ?? str(rec(raw.map).id),
      kappaRequired: raw.kappaRequired === true,
      lightkeeperRequired: raw.lightkeeperRequired === true,
      faction: str(raw.factionName) ?? 'Any',
      experience: num(raw.experience) ?? 0
    })
  }

  const maps: GameMap[] = []
  for (const raw of values(input.maps.maps as Collection<Raw>)) {
    const id = str(raw.id)
    if (!id) continue
    const extracts: MapExtract[] = []
    for (const e of arr(raw.extracts)) {
      const ex = rec(e)
      const position = vec(ex.position)
      if (position)
        extracts.push({
          name: tm(str(ex.name)) ?? 'Extract',
          faction: str(ex.faction) ?? 'shared',
          position,
          outline: vecs(ex.outline)
        })
    }
    maps.push({
      id,
      name: tm(str(raw.name)) ?? str(raw.normalizedName) ?? id,
      normalizedName: str(raw.normalizedName) ?? id,
      nameId: str(raw.nameId) ?? '',
      extracts,
      spawns: arr(raw.spawns)
        .map((s) => rec(s))
        .filter((s) => arr(s.categories).includes('player'))
        .map((s) => ({ position: vec(s.position), sides: arr(s.sides).map(String) }))
        .filter((s): s is GameMap['spawns'][number] => s.position !== null),
      transits: arr(raw.transits)
        .map((tr) => rec(tr))
        .map((tr) => ({
          name: tm(str(tr.description)) ?? tm(str(tr.name)) ?? 'Transit',
          position: vec(tr.position)
        }))
        .filter((tr): tr is GameMap['transits'][number] => tr.position !== null)
    })
  }

  const traderSource = rec(input.traders).traders ?? input.traders
  const traders = Object.entries(Array.isArray(traderSource) ? {} : rec(traderSource))
    .map(([key, raw]) => ({ id: str(rec(raw).id) ?? key, name: tt(str(rec(raw).name)) ?? key }))
    .concat(
      Array.isArray(traderSource)
        ? traderSource.map((raw) => ({ id: str(rec(raw).id) ?? '', name: tt(str(rec(raw).name)) ?? '' }))
        : []
    )
    .filter((tr) => tr.id)

  return { dataMode, fetchedAt, quests, maps, traders }
}

export async function fetchQuestData(
  fetchFn: FetchFn,
  dataMode: DataMode,
  now: number
): Promise<QuestDataset> {
  const [tasks, tasksLang, maps, mapsLang, traders, tradersLang] = await Promise.all([
    fetchJsonData<Raw>(fetchFn, dataMode, 'tasks'),
    fetchJsonData<Dict>(fetchFn, dataMode, 'tasks_en'),
    fetchJsonData<Raw>(fetchFn, dataMode, 'maps'),
    fetchJsonData<Dict>(fetchFn, dataMode, 'maps_en'),
    fetchJsonData<Raw>(fetchFn, dataMode, 'traders'),
    fetchJsonData<Dict>(fetchFn, dataMode, 'traders_en')
  ])
  const dataset = normalizeQuestData(
    { tasks, tasksLang, maps, mapsLang, traders, tradersLang },
    dataMode,
    now
  )
  if (dataset.quests.length === 0) throw new Error('tasks: no quests in response')
  return dataset
}

/** Quest and map data per game mode: cached on disk, refreshed twice a day, the cache when offline. */
export function createQuestDataService(deps: { fetchFn: FetchFn; cacheDir: string; now?: () => number }) {
  const now = deps.now ?? Date.now
  const states = new Map<DataMode, QuestDataState>()
  const inFlight = new Map<DataMode, Promise<QuestDataState>>()
  const cacheFile = (dataMode: DataMode): string => join(deps.cacheDir, `quests-${dataMode}.json`)

  async function load(dataMode: DataMode, force: boolean): Promise<QuestDataState> {
    let state = states.get(dataMode)
    if (!state) {
      const cached = (await readJsonFile(cacheFile(dataMode))) as QuestDataset | undefined
      state = {
        dataset: cached?.quests ? cached : null,
        fromCache: Boolean(cached?.quests),
        error: null,
        loading: false
      }
      states.set(dataMode, state)
    }
    const fresh = state.dataset && !state.fromCache && now() - state.dataset.fetchedAt < MAX_AGE_MS
    const recentCache = state.dataset && now() - state.dataset.fetchedAt < MAX_AGE_MS
    if (!force && (fresh || recentCache)) return state
    try {
      const dataset = await fetchQuestData(deps.fetchFn, dataMode, now())
      await writeJsonFileAtomic(cacheFile(dataMode), dataset)
      state = { dataset, fromCache: false, error: null, loading: false }
    } catch (err) {
      state = { ...state, fromCache: state.dataset !== null, error: errorMessage(err), loading: false }
    }
    states.set(dataMode, state)
    return state
  }

  return {
    /** The data for a game mode, fetching it when missing or stale (one request at a time). */
    get(dataMode: DataMode, force = false): Promise<QuestDataState> {
      const pending = inFlight.get(dataMode)
      if (pending) return pending
      const request = load(dataMode, force).finally(() => inFlight.delete(dataMode))
      inFlight.set(dataMode, request)
      return request
    },
    peek: (dataMode: DataMode): QuestDataState | null => states.get(dataMode) ?? null
  }
}

export type QuestDataService = ReturnType<typeof createQuestDataService>
