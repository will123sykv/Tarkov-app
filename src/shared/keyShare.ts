import type { GameMode } from './types'

// A code to share the keys you have with friends: "TLOK1." and the name, game mode and key ids packed
// small (12 bytes per key, then deflated) in base64url, so a long key list fits in one chat message.

export interface SharedKeys {
  name: string
  gameMode: GameMode
  keyIds: string[]
}

const PREFIX = 'TLOK'
const VERSION = 1
const MODES: GameMode[] = ['pvp', 'pve', 'season']
const KEY_ID = /^[0-9a-f]{24}$/
const MAX_NAME_BYTES = 255

async function transform(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream
): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Blob([bytes]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

/** The code for a key list: the name (cut to fit), the game mode, and each valid key id once. */
export async function encodeKeys({ name, gameMode, keyIds }: SharedKeys): Promise<string> {
  let nameBytes = new TextEncoder().encode(name.trim())
  // Cut whole characters until the name fits its length byte.
  for (let n = name.trim().length; nameBytes.length > MAX_NAME_BYTES; n--)
    nameBytes = new TextEncoder().encode(name.trim().slice(0, n))
  const ids = [...new Set(keyIds.filter((id) => KEY_ID.test(id)))].sort()
  const bytes = new Uint8Array(3 + nameBytes.length + ids.length * 12)
  bytes[0] = VERSION
  bytes[1] = MODES.indexOf(gameMode)
  bytes[2] = nameBytes.length
  bytes.set(nameBytes, 3)
  ids.forEach((id, i) => {
    for (let b = 0; b < 12; b++)
      bytes[3 + nameBytes.length + i * 12 + b] = parseInt(id.slice(b * 2, b * 2 + 2), 16)
  })
  return `${PREFIX}${VERSION}.${toBase64Url(await transform(bytes, new CompressionStream('deflate-raw')))}`
}

/** Read a code (found anywhere in the text pasted), or say why it can't be read. */
export async function decodeKeys(text: string): Promise<SharedKeys | { error: string }> {
  const match = /TLOK(\d+)\.([A-Za-z0-9_-]+)/.exec(text)
  if (!match) return { error: 'That isn’t a key code: it starts with TLOK1.' }
  if (Number(match[1]) !== VERSION) return { error: 'That code was made by a newer version of the app.' }
  try {
    const bytes = await transform(fromBase64Url(match[2]), new DecompressionStream('deflate-raw'))
    const gameMode = MODES[bytes[1]]
    const nameLength = bytes[2]
    const idBytes = bytes.length - 3 - nameLength
    if (bytes[0] !== VERSION || !gameMode || idBytes < 0 || idBytes % 12) throw new Error('bad layout')
    const name = new TextDecoder().decode(bytes.subarray(3, 3 + nameLength))
    const keyIds: string[] = []
    for (let i = 3 + nameLength; i < bytes.length; i += 12)
      keyIds.push([...bytes.subarray(i, i + 12)].map((b) => b.toString(16).padStart(2, '0')).join(''))
    return { name, gameMode, keyIds }
  } catch {
    return { error: 'That key code is damaged: copy it again, all of it.' }
  }
}
