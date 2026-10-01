/**
 * Temporary probe for 1.9.0: tarkov.dev grid images of look-alike items, for calibrating the screenshot
 * scanner. Informational.
 */
import { errorMessage } from '../src/main/pricing/http'

const IDS =
  '5d1b31ce86f7742523398394,60229948cacb6b0506369e27,5a33ca0fc4a282000d72292f,69cfe083ce0df53f230f29b0,69cfe095b96c8e8d3e002aa3,652910565ae2ae97b80fdf35,6529119424cbe3c74a05e5bb,5aa2b8d7e5b5b00014028f4a,61aa5aed32a4743c3453d319,5ad5cfbd86f7742c825d6104,66acd6702b17692df20144c0,5ad5ccd186f774446d5706e9,57347b8b24597737dd42e192,5734795124597738002c6176,606f262c6d0bd7580617bafa'.split(
    ','
  )

async function image(url: string): Promise<string> {
  try {
    const res = await fetch(url)
    if (!res.ok) return `HTTP ${res.status}`
    return Buffer.from(await res.arrayBuffer()).toString('base64')
  } catch (e) {
    return `ERR ${errorMessage(e)}`
  }
}

async function main(): Promise<void> {
  for (const id of IDS)
    console.log(`[grid] ${id} ${await image(`https://assets.tarkov.dev/${id}-grid-image.webp`)}`)
}

main().catch((e) => {
  console.log(`[probe] failed: ${errorMessage(e)}`)
})
