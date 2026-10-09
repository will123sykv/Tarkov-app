import type { FriendKeys } from '../lib/useFriendKeys'

/** "Alex, Sam have it": the friends who have a key, from the codes they shared. */
export function FriendTags({ names }: { names: readonly string[] }): React.JSX.Element | null {
  if (!names.length) return null
  return (
    <span className="key-friends" title="From the key codes your friends shared (Keys tab)">
      {names.map((name) => (
        <span key={name} className="tag friend">
          {name}
        </span>
      ))}{' '}
      {names.length === 1 ? 'has it' : 'have it'}
    </span>
  )
}

/** Count friends' keys as yours for what you can do (shared by the To do and Maps tabs). */
export function SquadToggle({
  friendKeys,
  on,
  onChange
}: {
  friendKeys: FriendKeys
  on: boolean
  onChange: (on: boolean) => void
}): React.JSX.Element | null {
  const names = friendKeys.friends.map((f) => f.name)
  if (!names.length) return null
  return (
    <label
      className="check squad-toggle"
      title={`Count the keys ${names.join(', ')} shared as yours: for raiding together`}
    >
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      Count friends&rsquo; keys
    </label>
  )
}
