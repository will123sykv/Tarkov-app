// Work shared by every component that needs it (since 1.71.0): useQuestRows is called by over a dozen
// hooks and components, and each used to work the quests out again for itself. Each step keeps its last
// few results, by its inputs (compared by identity, as useMemo does), so one does the work and the rest
// get the same objects.

const KEEP = 3
const caches = new Map<string, { deps: readonly unknown[]; value: unknown }[]>()

const same = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((d, i) => Object.is(d, b[i]))

/** `make()`'s result for these inputs, worked out once whoever asks. */
export function sharedMemo<T>(step: string, deps: readonly unknown[], make: () => T): T {
  const entries = caches.get(step) ?? []
  const i = entries.findIndex((e) => same(e.deps, deps))
  if (i >= 0) {
    const [hit] = entries.splice(i, 1)
    entries.unshift(hit)
    return hit.value as T
  }
  const value = make()
  caches.set(step, [{ deps, value }, ...entries].slice(0, KEEP))
  return value
}
