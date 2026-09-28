import { describe, expect, it, vi } from 'vitest'
import { createPriceController } from '../src/main/pricing/priceController'
import type { PriceService } from '../src/main/pricing/priceService'
import type { DataMode, PriceDataset, PriceFetchResult, PriceState } from '../src/shared/types'

const dataset = (fetchedAt: number, dataMode: DataMode = 'pvp'): PriceDataset => ({
  dataMode,
  source: 'tarkov.dev',
  fetchedAt,
  fleaMinLevel: 15,
  items: []
})

function setup(cached: PriceDataset | null = null, onFresh?: (dataset: PriceDataset) => void) {
  let clock = 10_000
  let active: DataMode = 'pvp'
  const timers: { fn: () => void; ms: number }[] = []
  let nextResult: PriceFetchResult = { dataset: dataset(clock), fromCache: false, error: null }
  const service: PriceService = {
    loadCached: vi.fn(async () => cached),
    fetchFresh: vi.fn(async () => nextResult)
  }
  const broadcasts: PriceState[] = []
  const controller = createPriceController({
    service,
    getActiveDataMode: () => active,
    getIntervalMs: () => 5 * 60_000,
    broadcast: (s) => broadcasts.push(s),
    onFresh,
    now: () => clock,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms })
      return timers.length as unknown as ReturnType<typeof setTimeout>
    },
    clearTimer: () => {}
  })
  return {
    controller,
    service,
    broadcasts,
    timers,
    setActive: (m: DataMode) => (active = m),
    setResult: (r: PriceFetchResult) => (nextResult = r),
    tick: (ms: number) => (clock += ms)
  }
}

describe('price controller', () => {
  it('serves the cache immediately and refreshes in the background', async () => {
    const { controller, service, broadcasts } = setup(dataset(1))
    const first = await controller.getState('pvp')
    expect(first).toMatchObject({ dataset: { fetchedAt: 1 }, fromCache: true })
    await controller.refresh('pvp') // joins the in-flight refresh
    expect(service.fetchFresh).toHaveBeenCalledTimes(1)
    const last = broadcasts.at(-1)!
    expect(last).toMatchObject({ fromCache: false, refreshing: false, lastAttemptAt: 10_000 })
    expect(last.nextRefreshAt).toBe(10_000 + 5 * 60_000)
    expect(last.revision).toBeGreaterThan(first.revision)
  })

  it('auto-refreshes the active mode on the configured interval', async () => {
    const { controller, service, timers, tick } = setup()
    await controller.refresh('pvp')
    expect(timers.at(-1)?.ms).toBe(5 * 60_000)
    tick(5 * 60_000)
    timers.at(-1)!.fn()
    await vi.waitFor(() => expect(service.fetchFresh).toHaveBeenCalledTimes(2))
  })

  it('hands freshly fetched prices (not cached ones) to the recorder', async () => {
    const onFresh = vi.fn()
    const { controller, setResult } = setup(null, onFresh)
    expect(controller.peek('pvp')).toBeNull()
    await controller.refresh('pvp')
    expect(onFresh).toHaveBeenCalledTimes(1)
    expect(controller.peek('pvp')?.dataset?.fetchedAt).toBe(10_000)
    setResult({ dataset: dataset(1), fromCache: true, error: 'offline' })
    await controller.refresh('pvp')
    expect(onFresh).toHaveBeenCalledTimes(1)
  })

  it('keeps the previous data when a refresh fails', async () => {
    const { controller, setResult } = setup()
    await controller.refresh('pvp')
    setResult({ dataset: null, fromCache: false, error: 'tarkov.dev: offline' })
    const state = await controller.refresh('pvp')
    expect(state).toMatchObject({
      dataset: { fetchedAt: 10_000 },
      fromCache: true,
      error: 'tarkov.dev: offline'
    })
  })

  it('does not refetch within the interval, and only schedules the active mode', async () => {
    const { controller, service, setActive, timers, tick } = setup()
    await controller.refresh('pvp')
    tick(60_000)
    await controller.getState('pvp')
    expect(service.fetchFresh).toHaveBeenCalledTimes(1)

    setActive('pve')
    controller.reschedule()
    const timerCount = timers.length
    const pve = await controller.getState('pve')
    expect(pve.nextRefreshAt).toBeNull()
    await vi.waitFor(() => expect(service.fetchFresh).toHaveBeenCalledTimes(2))
    expect(timers.length).toBeGreaterThan(timerCount)
    expect((await controller.getState('pvp')).nextRefreshAt).toBeNull()
  })

  it('refreshes immediately when rescheduled past the due time', async () => {
    const { controller, service, tick } = setup()
    await controller.refresh('pvp')
    tick(10 * 60_000)
    controller.reschedule()
    await vi.waitFor(() => expect(service.fetchFresh).toHaveBeenCalledTimes(2))
  })
})
