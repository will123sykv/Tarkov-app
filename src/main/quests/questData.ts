import { join } from 'node:path'
import type {
  BossSpawn,
  GameMap,
  HideoutLevel,
  HideoutStation,
  KeySpawn,
  MapAccess,
  MapExtract,
  MapLock,
  Quest,
  QuestDataset,
  QuestDataState,
  QuestObjective,
  QuestRewards,
  QuestTrader,
  QuestZone,
  RequirementStatus,
  TraderRequirement,
  Vec3
} from '../../shared/questTypes'
import type { DataMode } from '../../shared/types'
import { readJsonFile, writeJsonFileAtomic } from '../jsonFile'
import { errorMessage, type FetchFn } from '../pricing/http'
import { fetchJsonData, translator, values, type Collection } from '../pricing/tarkovDevJson'
import { fetchStoryChapters } from './storyChapters'

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
  /** Optional: names the stations of crafts that quests unlock. */
  hideout?: Raw
  hideoutLang?: Dict
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

function traderRequirements(value: unknown): TraderRequirement[] {
  const result: TraderRequirement[] = []
  for (const raw of arr(value)) {
    const req = rec(raw)
    const traderId = str(req.trader) ?? str(rec(req.trader).id)
    const type =
      req.requirementType === 'level' || req.requirementType === 'reputation' ? req.requirementType : null
    const value = num(req.value) ?? num(req.level)
    if (traderId && type && value !== null)
      result.push({ traderId, type, compareMethod: str(req.compareMethod) ?? '>=', value })
  }
  return result
}

function traderLevel(objective: Raw): QuestObjective['traderLevel'] {
  if (objective.type !== 'traderLevel') return null
  const traderId = str(objective.trader) ?? str(rec(objective.trader).id)
  const level = num(objective.level)
  return traderId && level !== null ? { traderId, level } : null
}

function questStatus(objective: Raw): QuestObjective['questStatus'] {
  if (objective.type !== 'taskStatus') return null
  const questId = str(objective.task) ?? str(rec(objective.task).id)
  return questId ? { questId, status: requirementStatus(objective.status) } : null
}

const QUEST_NAME_KEY = /^([0-9a-f]{24}) name$/

const idOf = (value: unknown): string | null => str(value) ?? str(rec(value).id)
const ids = (value: unknown): string[] =>
  arr(value)
    .map(idOf)
    .filter((id): id is string => id !== null)

/** Keys an objective needs: one list per lock, any key in a list opens it. */
const requiredKeys = (value: unknown): string[][] =>
  arr(value)
    .map((group) => (Array.isArray(group) ? ids(group) : ids([group])))
    .filter((group) => group.length)

export const NO_REWARDS: QuestRewards = {
  items: [],
  traderStanding: [],
  offerUnlocks: [],
  craftUnlocks: [],
  skills: [],
  traderUnlocks: [],
  other: []
}

function rewards(value: unknown, t: Translate, stations: ReadonlyMap<string, string>): QuestRewards {
  const r = rec(value)
  const list = <T>(key: string, parse: (raw: Raw) => T | null): T[] =>
    arr(r[key])
      .map((v) => parse(rec(v)))
      .filter((v): v is T => v !== null)
  return {
    items: list('items', (i) => {
      const itemId = idOf(i.item)
      return itemId ? { itemId, count: num(i.count) ?? 1 } : null
    }),
    traderStanding: list('traderStanding', (s) => {
      const traderId = idOf(s.trader)
      const standing = num(s.standing)
      return traderId && standing !== null ? { traderId, standing } : null
    }),
    offerUnlocks: list('offerUnlock', (o) => {
      const traderId = idOf(o.trader)
      const itemId = idOf(o.item)
      return traderId && itemId ? { traderId, level: num(o.level) ?? 1, itemId } : null
    }),
    craftUnlocks: list('craftUnlock', (c) => {
      const stationId = idOf(c.station)
      const itemId = idOf(c.item) ?? idOf(arr(c.rewardItems)[0] && rec(arr(c.rewardItems)[0]).item)
      if (!itemId) return null
      return {
        station: (stationId && stations.get(stationId)) ?? 'Hideout',
        level: num(c.level) ?? 1,
        itemId,
        count: num(c.count) ?? 1
      }
    }),
    skills: list('skillLevelReward', (k) => {
      const skill = str(k.skill) ?? str(rec(k.skill).name) ?? str(k.name)
      const level = num(k.level)
      return skill && level !== null ? { name: translated(t, skill) ?? skillName(skill), level } : null
    }),
    traderUnlocks: ids(r.traderUnlock),
    other: [
      ...ids(r.achievement).map((id) => translated(t, `${id} name`) ?? 'An achievement'),
      ...arr(r.customization).map((c) => {
        const name = translated(t, str(rec(c).name))
        const type = str(rec(c).customizationType)
        return name ?? (type ? `Customisation: ${skillName(type).toLowerCase()}` : 'A customisation')
      })
    ]
  }
}

/** A translation, or null when there's none (the key would come back as is). */
function translated(t: Translate, key: string | null): string | null {
  const text = key ? t(key) : null
  return text && text !== key ? text : null
}

/** Skill ids as the game names them: `StressResistance` → `Stress Resistance`. */
const skillName = (id: string): string =>
  id === 'TroubleShooting' ? 'Troubleshooting' : id.replace(/([a-z])([A-Z])/g, '$1 $2')

/** Who can enter a map. tarkov.dev writes 0 and 100 (or 99) for no limit. */
function mapAccess(raw: Raw): MapAccess {
  const min = num(raw.minPlayerLevel)
  const max = num(raw.maxPlayerLevel)
  return {
    minPlayerLevel: min && min > 1 ? min : null,
    maxPlayerLevel: max && max < 99 ? max : null,
    keyIds: ids(raw.accessKeys)
  }
}

function neededKeys(value: unknown): Quest['neededKeys'] {
  return arr(value)
    .map((k) => ({ map: idOf(rec(k).map) ?? '', keyIds: ids(rec(k).keys) }))
    .filter((k) => k.keyIds.length)
}

/** Hideout station names by id, from tarkov.dev's `hideout` file (stations by id). */
export function stationNames(hideout: Raw, lang: Dict): Map<string, string> {
  const t = translator(lang)
  const names = new Map<string, string>()
  for (const raw of values(hideout as Collection<Raw>)) {
    const id = str(rec(raw).id)
    const name = translated(t, str(rec(raw).name)) ?? str(rec(raw).normalizedName)
    if (id && name) names.set(id, name.includes('-') && !name.includes(' ') ? prettify(name) : name)
  }
  return names
}

/** Hideout stations and what each level takes to build, from tarkov.dev's `hideout` file. */
export function hideoutStations(hideout: Raw, lang: Dict): HideoutStation[] {
  const t = translator(lang)
  const names = stationNames(hideout, lang)
  const result: HideoutStation[] = []
  for (const raw of values(hideout as Collection<Raw>)) {
    const s = rec(raw)
    const id = str(s.id)
    if (!id) continue
    const levels: HideoutLevel[] = arr(s.levels)
      .map((l) => rec(l))
      .map((l) => ({
        level: num(l.level) ?? 0,
        constructionTime: num(l.constructionTime) ?? 0,
        items: arr(l.itemRequirements)
          .map((r) => rec(r))
          .map((r) => ({
            itemId: idOf(r.item) ?? '',
            count: num(r.count) ?? num(r.quantity) ?? 1,
            foundInRaid: rec(r.attributes).foundInRaid === true
          }))
          .filter((r) => r.itemId),
        stations: arr(l.stationLevelRequirements)
          .map((r) => ({ stationId: idOf(rec(r).station) ?? '', level: num(rec(r).level) ?? 1 }))
          // A level lists the station's own previous level too: that's implied.
          .filter((r) => r.stationId && r.stationId !== id),
        traders: traderRequirements(l.traderRequirements)
          .filter((r) => r.type === 'level')
          .map((r) => ({ traderId: r.traderId, level: r.value })),
        skills: arr(l.skillRequirements)
          .map((r) => rec(r))
          .map((r) => {
            const skill = str(r.skill) ?? str(rec(r.skill).id) ?? str(r.name) ?? str(rec(r.skill).name)
            const name = skill ? (translated(t, skill) ?? skillName(skill)) : null
            return { name: name ?? '', level: num(r.level) ?? 1 }
          })
          .filter((r) => r.name)
      }))
      .filter((l) => l.level > 0)
      .sort((a, b) => a.level - b.level)
    result.push({
      id,
      name: names.get(id) ?? id,
      normalizedName: str(s.normalizedName) ?? id,
      imageLink: str(s.imageLink),
      levels
    })
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
}

function prettify(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

type Translate = (key: string | null | undefined) => string | null

/** About as many boss spawn areas as a map shows. */
const MAX_BOSS_CLUMPS = 15

const round2 = (n: number): number => Math.round(n * 100) / 100
const mean = (points: Vec3[]): Vec3 => ({
  x: round2(points.reduce((sum, p) => sum + p.x, 0) / points.length),
  y: round2(points.reduce((sum, p) => sum + p.y, 0) / points.length),
  z: round2(points.reduce((sum, p) => sum + p.z, 0) / points.length)
})

/**
 * Boss spawn points come by the dozen, a few metres apart: group each zone's into clumps, widening
 * the clumps until the map has at most MAX_BOSS_CLUMPS (which suits big maps and small alike).
 */
function clumps(points: { zone: string; position: Vec3 }[]): { zone: string; points: Vec3[] }[] {
  let result: { zone: string; points: Vec3[] }[] = []
  for (let radius = 60; radius <= 300; radius += 20) {
    result = []
    for (const { zone, position } of points) {
      const clump = result.find((c) => {
        const mid = mean(c.points)
        return c.zone === zone && Math.hypot(mid.x - position.x, mid.z - position.z) < radius
      })
      if (clump) clump.points.push(position)
      else result.push({ zone, points: [position] })
    }
    if (result.length <= MAX_BOSS_CLUMPS) break
  }
  return result
}

/**
 * Where bosses spawn (one point per clump of spawns marked for bosses), each with the bosses that can
 * use its zone, and one point per sniper zone.
 */
function bossesAndSnipers(
  raw: Raw,
  mobNames: ReadonlyMap<string, string>
): Pick<GameMap, 'bossSpawns' | 'snipers'> {
  const byZone = new Map<string, BossSpawn['bosses']>()
  for (const b of arr(raw.bosses)) {
    const boss = rec(b)
    const mob = str(boss.mob) ?? str(rec(boss.mob).id)
    if (!mob) continue
    const name = mobNames.get(mob) ?? prettify(mob.replace(/^boss/, ''))
    for (const l of arr(boss.spawnLocations)) {
      const zone = str(rec(l).spawnKey)
      if (!zone) continue
      const list = byZone.get(zone) ?? []
      list.push({ name, chance: num(boss.spawnChance) ?? 0, here: num(rec(l).chance) ?? 0 })
      byZone.set(zone, list)
    }
  }
  const bossPoints: { zone: string; position: Vec3 }[] = []
  const sniperZones = new Map<string, Vec3[]>()
  for (const s of arr(raw.spawns)) {
    const spawn = rec(s)
    const position = vec(spawn.position)
    const zone = str(spawn.zoneName) ?? ''
    if (!position) continue
    if (/snipe/i.test(zone)) sniperZones.set(zone, [...(sniperZones.get(zone) ?? []), position])
    else if (arr(spawn.categories).includes('boss')) bossPoints.push({ zone, position })
  }
  const bossSpawns: BossSpawn[] = clumps(bossPoints).map((c) => ({
    position: mean(c.points),
    zone: c.zone,
    bosses: byZone.get(c.zone) ?? []
  }))
  return { bossSpawns, snipers: [...sniperZones.values()].map(mean) }
}

function mobNames(value: unknown, t: Translate): Map<string, string> {
  const names = new Map<string, string>()
  for (const m of values(value as Collection<Raw>)) {
    const id = str(m.id)
    if (!id) continue
    const key = str(m.name)
    const translated = key ? t(key) : null
    names.set(id, translated && translated !== key ? translated : prettify(str(m.normalizedName) ?? id))
  }
  return names
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
  const stations = stationNames(input.hideout ?? {}, input.hideoutLang ?? {})

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
          .filter((l) => l.map && l.positions.length),
        traderLevel: traderLevel(obj),
        playerLevel: obj.type === 'playerLevel' ? num(obj.playerLevel) : null,
        questStatus: questStatus(obj),
        requiredKeys: requiredKeys(obj.requiredKeys)
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
      traderRequirements: traderRequirements(raw.traderRequirements),
      objectives,
      map: str(raw.map) ?? str(rec(raw.map).id),
      kappaRequired: raw.kappaRequired === true,
      lightkeeperRequired: raw.lightkeeperRequired === true,
      faction: str(raw.factionName) ?? 'Any',
      experience: num(raw.experience) ?? 0,
      neededKeys: neededKeys(raw.neededKeys),
      rewards: rewards(raw.finishRewards, t, stations),
      startRewards: rewards(raw.startRewards, t, stations),
      imageLink: str(raw.taskImageLink)
    })
  }

  const mobs = mobNames(input.maps.mobs, tm)
  // Keys: what opens a lock, lets you onto a map, or a quest asks for. Loose loot spots are only kept
  // where one of these can spawn.
  const rawMaps = values(input.maps.maps as Collection<Raw>)
  const keyIds = new Set([
    ...rawMaps.flatMap((raw) => [...arr(raw.locks).map((l) => idOf(rec(l).key)), ...ids(raw.accessKeys)]),
    ...quests.flatMap((q) => [
      ...q.objectives.flatMap((o) => o.requiredKeys.flat()),
      ...q.neededKeys.flatMap((k) => k.keyIds)
    ])
  ])
  keyIds.delete(null)
  const maps: GameMap[] = []
  for (const raw of rawMaps) {
    const id = str(raw.id)
    if (!id) continue
    const extracts: MapExtract[] = []
    for (const e of arr(raw.extracts)) {
      const ex = rec(e)
      const position = vec(ex.position)
      const transfer = rec(ex.transferItem)
      const itemId = str(transfer.item) ?? str(rec(transfer.item).id)
      if (position)
        extracts.push({
          name: tm(str(ex.name)) ?? 'Extract',
          faction: str(ex.faction) ?? 'shared',
          position,
          outline: vecs(ex.outline),
          transferItem: itemId ? { itemId, count: num(transfer.count) ?? 1 } : null
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
        .filter((tr): tr is GameMap['transits'][number] => tr.position !== null),
      ...bossesAndSnipers(raw, mobs),
      locks: arr(raw.locks)
        .map((l) => rec(l))
        .map((l) => ({ keyId: idOf(l.key), kind: str(l.lockType) ?? 'door', position: vec(l.position) }))
        .filter((l): l is MapLock => l.keyId !== null && l.position !== null),
      keySpawns: arr(raw.lootLoose)
        .map((spot) => rec(spot))
        .map((spot) => {
          const items = ids(spot.items)
          return {
            position: vec(spot.position),
            keyIds: items.filter((i) => keyIds.has(i)),
            items: items.length
          }
        })
        .filter((spot): spot is KeySpawn => spot.position !== null && spot.keyIds.length > 0),
      access: mapAccess(raw)
    })
  }

  const traderSource = rec(input.traders).traders ?? input.traders
  const trader = (raw: unknown, key: string): QuestTrader => ({
    id: str(rec(raw).id) ?? key,
    name: tt(str(rec(raw).name)) ?? key,
    levels: arr(rec(raw).levels)
      .map((l) => ({ level: num(rec(l).level), playerLevel: num(rec(l).requiredPlayerLevel) ?? 0 }))
      .filter((l): l is QuestTrader['levels'][number] => l.level !== null),
    imageLink: str(rec(raw).imageLink)
  })
  const traders = (
    Array.isArray(traderSource)
      ? traderSource.map((raw) => trader(raw, ''))
      : Object.entries(rec(traderSource)).map(([key, raw]) => trader(raw, key))
  ).filter((tr) => tr.id)

  // Achievements' names have the same form as quests'.
  const known = new Set([
    ...quests.map((q) => q.id),
    ...values(input.tasks.tasks as Collection<Raw>).flatMap((raw) => [
      ...ids(rec(raw.finishRewards).achievement),
      ...ids(rec(raw.startRewards).achievement)
    ])
  ])
  const otherQuestNames: Record<string, string> = {}
  for (const [key, name] of Object.entries(input.tasksLang)) {
    const id = QUEST_NAME_KEY.exec(key)?.[1]
    if (id && name && !known.has(id)) otherQuestNames[id] = name
  }

  return {
    dataMode,
    fetchedAt,
    quests,
    maps,
    traders,
    stations: hideoutStations(input.hideout ?? {}, input.hideoutLang ?? {}),
    otherQuestNames,
    // Filled in from the wiki by fetchQuestData.
    storyChapters: []
  }
}

export async function fetchQuestData(
  fetchFn: FetchFn,
  dataMode: DataMode,
  now: number
): Promise<QuestDataset> {
  // Hideout station names only label rewards: do without them rather than fail.
  const optional = <T>(file: string): Promise<T | undefined> =>
    fetchJsonData<T>(fetchFn, dataMode, file).catch(() => undefined)
  const [tasks, tasksLang, maps, mapsLang, traders, tradersLang, hideout, hideoutLang] = await Promise.all([
    fetchJsonData<Raw>(fetchFn, dataMode, 'tasks'),
    fetchJsonData<Dict>(fetchFn, dataMode, 'tasks_en'),
    fetchJsonData<Raw>(fetchFn, dataMode, 'maps'),
    fetchJsonData<Dict>(fetchFn, dataMode, 'maps_en'),
    fetchJsonData<Raw>(fetchFn, dataMode, 'traders'),
    fetchJsonData<Dict>(fetchFn, dataMode, 'traders_en'),
    optional<Raw>('hideout'),
    optional<Dict>('hideout_en')
  ])
  const dataset = normalizeQuestData(
    { tasks, tasksLang, maps, mapsLang, traders, tradersLang, hideout, hideoutLang },
    dataMode,
    now
  )
  if (dataset.quests.length === 0) throw new Error('tasks: no quests in response')
  // The story chapters come from the wiki: without it, they're left as they were (see the service).
  const storyChapters = await fetchStoryChapters(fetchFn, dataset.otherQuestNames, dataset.maps).catch(
    () => []
  )
  return { ...dataset, storyChapters }
}

/**
 * Older caches lack what later versions added (1.5.0: trader requirements and the other quests'
 * names; 1.6.0: bosses, snipers and extract costs; 1.7.0: keys, rewards and pictures; 1.8.0: the
 * hideout; 1.11.0: story chapters; 1.12.0: what objectives check, and the story steps' maps; 1.17.0:
 * locks, key spawns and map access): fill in
 * defaults so they still work offline, and date them so they're refetched straight away.
 */
function upgradeCache(cached: QuestDataset): QuestDataset {
  let result = cached
  if (!result.otherQuestNames)
    result = {
      ...result,
      fetchedAt: 0,
      quests: result.quests.map((q) => ({
        ...q,
        traderRequirements: q.traderRequirements ?? [],
        objectives: q.objectives.map((o) => ({ ...o, traderLevel: o.traderLevel ?? null }))
      })),
      traders: result.traders.map((t) => ({ ...t, levels: t.levels ?? [] })),
      otherQuestNames: {}
    }
  if (result.maps.some((m) => !m.bossSpawns))
    result = {
      ...result,
      fetchedAt: 0,
      maps: result.maps.map((m) => ({
        ...m,
        extracts: m.extracts.map((e) => ({ ...e, transferItem: e.transferItem ?? null })),
        bossSpawns: m.bossSpawns ?? [],
        snipers: m.snipers ?? []
      }))
    }
  if (result.quests.some((q) => !q.rewards))
    result = {
      ...result,
      fetchedAt: 0,
      quests: result.quests.map((q) => ({
        ...q,
        neededKeys: q.neededKeys ?? [],
        rewards: q.rewards ?? NO_REWARDS,
        startRewards: q.startRewards ?? NO_REWARDS,
        imageLink: q.imageLink ?? null,
        objectives: q.objectives.map((o) => ({ ...o, requiredKeys: o.requiredKeys ?? [] }))
      })),
      traders: result.traders.map((t) => ({ ...t, imageLink: t.imageLink ?? null }))
    }
  if (!result.stations) result = { ...result, fetchedAt: 0, stations: [] }
  // 1.17.0: locks, key spawns and who can enter each map.
  if (result.maps.some((m) => !m.locks))
    result = {
      ...result,
      fetchedAt: 0,
      maps: result.maps.map((m) => ({
        ...m,
        locks: m.locks ?? [],
        keySpawns: m.keySpawns ?? [],
        access: m.access ?? { minPlayerLevel: null, maxPlayerLevel: null, keyIds: [] }
      }))
    }
  if (!result.storyChapters) result = { ...result, fetchedAt: 0, storyChapters: [] }
  // 1.12.0: objectives' level and quest-status checks, and the maps story steps are on.
  if (result.quests.some((q) => q.objectives.some((o) => o.playerLevel === undefined)))
    result = {
      ...result,
      fetchedAt: 0,
      quests: result.quests.map((q) => ({
        ...q,
        objectives: q.objectives.map((o) => ({
          ...o,
          playerLevel: o.playerLevel ?? null,
          questStatus: o.questStatus ?? null
        }))
      }))
    }
  if (result.storyChapters.some((c) => c.objectives.some((o) => !o.maps)))
    result = {
      ...result,
      fetchedAt: 0,
      storyChapters: result.storyChapters.map((c) => ({
        ...c,
        objectives: c.objectives.map((o) => ({
          ...o,
          maps: o.maps ?? [],
          guide: o.guide ?? null,
          visits: o.visits ?? false,
          loyalty: o.loyalty ?? null
        }))
      }))
    }
  return result
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
      const raw = (await readJsonFile(cacheFile(dataMode))) as QuestDataset | undefined
      const cached = raw?.quests ? upgradeCache(raw) : undefined
      state = {
        dataset: cached ?? null,
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
      const fresh = await fetchQuestData(deps.fetchFn, dataMode, now())
      // When the wiki couldn't be reached, keep the story chapters from last time.
      const dataset = fresh.storyChapters.length
        ? fresh
        : { ...fresh, storyChapters: state.dataset?.storyChapters ?? [] }
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
