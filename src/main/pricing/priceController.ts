import type { DataMode, PriceDataset, PriceState } from '../../shared/types'
import type { PriceService } from './priceService'

type TimerHandle = ReturnType<typeof setTimeout>

export interface PriceControllerDeps {
  service: PriceService
  /** The data mode the user is currently looking at; only it is auto-refreshed. */
  getActiveDataMode: () => DataMode
  getIntervalMs: () => number
  broadcast: (state: PriceState) => void
  /** Called with every freshly fetched (not cached) dataset, e.g. to record prices. */
  onFresh?: (dataset: PriceDataset) => void
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => TimerHandle
  clearTimer?: (handle: TimerHandle) => void
}

/**
 * Owns the in-memory price state per data mode, dedupes concurrent refreshes and runs the
 * auto-refresh timer for the active mode. Every state change is broadcast to the renderer.
 */
export function createPriceController(deps: PriceControllerDeps) {
  const now = deps.now ?? Date.now
  const setTimer = deps.setTimer ?? setTimeout
  const clearTimer = deps.clearTimer ?? clearTimeout

  const states = new Map<DataMode, PriceState>()
  const loading = new Map<DataMode, Promise<PriceState>>()
  const inflight = new Map<DataMode, Promise<PriceState>>()
  let revision = 0
  let timer: TimerHandle | null = null
  let timerMode: DataMode | null = null
  let nextRefreshAt: number | null = null

  function snapshot(dataMode: DataMode): PriceState {
    const state = states.get(dataMode)!
    return { ...state, nextRefreshAt: timerMode === dataMode ? nextRefreshAt : null }
  }

  function update(dataMode: DataMode, patch: Partial<PriceState> = {}): void {
    states.set(dataMode, { ...states.get(dataMode)!, ...patch, revision: ++revision })
    deps.broadcast(snapshot(dataMode))
  }

  function ensureLoaded(dataMode: DataMode): Promise<PriceState> {
    const existing = states.get(dataMode)
    if (existing) return Promise.resolve(existing)
    let pending = loading.get(dataMode)
    if (!pending) {
      pending = deps.service.loadCached(dataMode).then((cached) => {
        if (!states.has(dataMode)) {
          states.set(dataMode, {
            dataMode,
            revision: ++revision,
            dataset: cached,
            fromCache: cached !== null,
            error: null,
            refreshing: false,
            lastAttemptAt: null,
            nextRefreshAt: null
          })
        }
        loading.delete(dataMode)
        return states.get(dataMode)!
      })
      loading.set(dataMode, pending)
    }
    return pending
  }

  function stopTimer(): void {
    if (timer) clearTimer(timer)
    timer = null
    timerMode = null
    nextRefreshAt = null
  }

  /** Schedule the next auto-refresh of the active mode relative to its last attempt. */
  function reschedule(): void {
    stopTimer()
    const dataMode = deps.getActiveDataMode()
    const state = states.get(dataMode)
    if (!state || state.lastAttemptAt === null) return
    const due = state.lastAttemptAt + deps.getIntervalMs()
    if (due <= now()) {
      void refresh(dataMode)
      return
    }
    timerMode = dataMode
    nextRefreshAt = due
    timer = setTimer(() => {
      timer = null
      void refresh(dataMode)
    }, due - now())
    update(dataMode)
  }

  function refresh(dataMode: DataMode): Promise<PriceState> {
    const pending = inflight.get(dataMode)
    if (pending) return pending

    const run = (async () => {
      await ensureLoaded(dataMode)
      update(dataMode, { refreshing: true })
      const result = await deps.service.fetchFresh(dataMode)
      if (result.dataset && !result.fromCache) deps.onFresh?.(result.dataset)
      const previous = states.get(dataMode)!
      // If every source failed, keep whatever we already had in memory: it is at least as new
      // as the cache file, and survives a failed cache write.
      const keepPrevious =
        result.fromCache &&
        previous.dataset !== null &&
        previous.dataset.fetchedAt >= (result.dataset?.fetchedAt ?? 0)
      const dataset = keepPrevious ? previous.dataset : (result.dataset ?? previous.dataset)
      update(dataMode, {
        dataset,
        fromCache: result.dataset ? result.fromCache : dataset !== null,
        error: result.error,
        refreshing: false,
        lastAttemptAt: now()
      })
      if (dataMode === deps.getActiveDataMode()) reschedule()
      return snapshot(dataMode)
    })().finally(() => inflight.delete(dataMode))

    inflight.set(dataMode, run)
    return run
  }

  async function getState(dataMode: DataMode): Promise<PriceState> {
    const state = await ensureLoaded(dataMode)
    const due = state.lastAttemptAt === null || now() - state.lastAttemptAt >= deps.getIntervalMs()
    if (due && !inflight.has(dataMode)) void refresh(dataMode)
    return snapshot(dataMode)
  }

  return {
    getState,
    /** The current state if loaded, without starting a refresh. */
    peek: (dataMode: DataMode): PriceState | null => states.get(dataMode) ?? null,
    refresh,
    /** Call after the game mode or refresh interval changes. */
    reschedule,
    dispose: stopTimer
  }
}

export type PriceController = ReturnType<typeof createPriceController>
