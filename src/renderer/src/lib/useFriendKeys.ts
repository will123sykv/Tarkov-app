import { useCallback, useMemo } from 'react'
import { EMPTY_KEYS } from '../../../shared/keys'
import type { PublicSettings } from '../../../shared/types'
import { useStore } from '../store'

export interface FriendKeys {
  /** Friends with keys in this game mode (from the codes they shared). */
  friends: { name: string; keys: ReadonlySet<string> }[]
  /** The friends who have any of these keys. */
  friendsWith: (keyIds: readonly string[]) => string[]
  /** Your keys, plus friends' when "Count friends' keys" is on. */
  owned: ReadonlySet<string>
  /** Friends' keys are counted as yours. */
  squad: boolean
}

/** Your keys and your friends' in the game mode shown, as the To do, Maps and Keys tabs use them. */
export function useFriendKeys(settings: PublicSettings): FriendKeys {
  const inventory = useStore((s) => s.keys[settings.gameMode]) ?? EMPTY_KEYS
  const friends = useMemo(
    () =>
      settings.keys.friends
        .filter((f) => f.gameMode === settings.gameMode)
        .map((f) => ({ name: f.name, keys: new Set(f.keyIds) })),
    [settings.keys.friends, settings.gameMode]
  )
  const squad = settings.todo.squadKeys && friends.length > 0
  const owned = useMemo(
    () => new Set([...inventory.owned, ...(squad ? friends.flatMap((f) => [...f.keys]) : [])]),
    [inventory.owned, squad, friends]
  )
  const friendsWith = useCallback(
    (keyIds: readonly string[]) =>
      friends.filter((f) => keyIds.some((id) => f.keys.has(id))).map((f) => f.name),
    [friends]
  )
  return { friends, friendsWith, owned, squad }
}
