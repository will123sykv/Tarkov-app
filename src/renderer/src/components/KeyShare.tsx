import { useState } from 'react'
import { GAME_MODES } from '../../../shared/gameModes'
import { decodeKeys, encodeKeys } from '../../../shared/keyShare'
import { MAX_FRIEND_NAME, MAX_FRIENDS } from '../../../shared/settings'
import type { GameMode, KeyFriend, KeysSettings } from '../../../shared/types'

const modeLabel = (mode: GameMode): string => GAME_MODES.find((m) => m.id === mode)?.label ?? mode
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Share keys with friends: copy a code for the keys you have, and paste friends' codes to see which keys
 * they have (shown beside yours in the lists; your own keys never change).
 */
export default function KeyShare({
  keys,
  gameMode,
  owned,
  onChange
}: {
  keys: KeysSettings
  gameMode: GameMode
  /** The keys you have, in this game mode. */
  owned: readonly string[]
  onChange: (patch: Partial<KeysSettings>) => void
}): React.JSX.Element {
  const [name, setName] = useState(keys.shareName)
  const [copied, setCopied] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const copy = async (): Promise<void> => {
    const text = await encodeKeys({ name: name.trim() || 'A friend', gameMode, keyIds: [...owned] })
    try {
      await window.api.copyText(text)
      setCopied(`Copied: ${plural(owned.length, 'key')} (${modeLabel(gameMode)}). Paste it to your friends.`)
    } catch {
      setCopied('Couldn’t copy it.')
    }
  }
  const add = async (): Promise<void> => {
    const read = await decodeKeys(code)
    if ('error' in read) {
      setResult({ ok: false, text: read.error })
      return
    }
    const friendName = read.name.trim().slice(0, MAX_FRIEND_NAME) || 'Friend'
    const same = (f: KeyFriend): boolean => f.name.toLowerCase() === friendName.toLowerCase()
    const known = keys.friends.some(same)
    const friend: KeyFriend = {
      name: friendName,
      gameMode: read.gameMode,
      keyIds: read.keyIds,
      importedAt: Date.now()
    }
    onChange({ friends: [...keys.friends.filter((f) => !same(f)), friend].slice(-MAX_FRIENDS) })
    setCode('')
    setResult({
      ok: true,
      text:
        `${known ? 'Updated' : 'Added'} ${friendName}: ${plural(read.keyIds.length, 'key')} (${modeLabel(read.gameMode)})` +
        (read.gameMode === gameMode ? '.' : `. Switch to ${modeLabel(read.gameMode)} to see them.`)
    })
  }
  const remove = (friend: KeyFriend): void => onChange({ friends: keys.friends.filter((f) => f !== friend) })

  return (
    <div className="key-share">
      <label className="key-share-name">
        <span>Your name</span>
        <input
          type="text"
          value={name}
          maxLength={MAX_FRIEND_NAME}
          placeholder="Shown to your friends"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() !== keys.shareName && onChange({ shareName: name.trim() })}
        />
      </label>
      <button
        className="button small"
        title={`Copy a code for the ${plural(owned.length, 'key')} you have in ${modeLabel(gameMode)}`}
        onClick={() => void copy()}
      >
        Copy my keys code
      </button>
      {copied && <p className="hint">{copied}</p>}
      <textarea
        className="key-share-code"
        rows={2}
        value={code}
        placeholder="Paste a friend’s code (TLOK1.…)"
        aria-label="A friend’s key code"
        onChange={(e) => {
          setCode(e.target.value)
          setResult(null)
        }}
      />
      <button className="button small" disabled={!code.trim()} onClick={() => void add()}>
        Add friend
      </button>
      {result && <p className={`hint ${result.ok ? '' : 'key-share-error'}`}>{result.text}</p>}
      {keys.friends.length > 0 && (
        <ul className="key-friends-list">
          {keys.friends.map((f) => {
            const here = f.gameMode === gameMode
            return (
              <li key={f.name} className={here ? '' : 'muted'}>
                <span>
                  <strong>{f.name}</strong> · {plural(f.keyIds.length, 'key')}
                  {here ? '' : ` (${modeLabel(f.gameMode)}: switch to see)`}
                  {f.importedAt > 0 && (
                    <span className="muted"> · {new Date(f.importedAt).toLocaleDateString()}</span>
                  )}
                </span>
                <button className="link" title={`Take ${f.name}’s keys off`} onClick={() => remove(f)}>
                  Remove
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="hint">
        Friends&rsquo; keys show as tags in the lists (&ldquo;Alex has it&rdquo;); your own keys never change.
        Add a friend&rsquo;s new code to update their keys.
      </p>
    </div>
  )
}
