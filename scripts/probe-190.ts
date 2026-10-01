/**
 * Temporary probe for 1.9.0: item short names and sizes, and the icons of the items in the scav case
 * samples, for calibrating the screenshot scanner. Informational.
 */
import { errorMessage } from '../src/main/pricing/http'
import { fetchTarkovDevJson } from '../src/main/pricing/tarkovDevJson'

const SAMPLE_NAMES = (
  'Powerban,SurvL,Meds,Syringe,Vitamins,Pliers,Nippers,MS2000,Jammer,Compass,Paper,TP,Apollo,Book,WFilter,' +
  'Eagle,Hawk,Pass,GasAn,Rec.,PMC,Finances,Test,Blueprints,Medical,GreenBat,Chainlet,Skull,Zibbo,HMatches,' +
  'TP-200,LEDX,MedTools,Duct tape,Bolts,Nuts,Nails,Xeno,Hose,Screws,M.parts,CPU fan,GPU,ES Lamp,Cord,Wires,' +
  'Motor,Relay,Bulb,PAID,SMT,BakeEzy,MTape,Wrench,Hand drill,Bulbex,Awl,Filter'
)
  .split(',')
  .map((n) => n.toLowerCase())

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
  const dataset = await fetchTarkovDevJson(fetch, 'pvp')
  const rows = dataset.items.map((i) => [i.id, i.shortName, i.width, i.height, i.name, i.category ?? ''])
  console.log(`[items] ${rows.length} items`)
  for (let i = 0; i < rows.length; i += 200) console.log(`[items] ${JSON.stringify(rows.slice(i, i + 200))}`)
  const picked = dataset.items.filter((i) => {
    const s = i.shortName.toLowerCase()
    return SAMPLE_NAMES.some((n) => s === n || (n.length >= 6 && s.startsWith(n)))
  })
  console.log(`[picked] ${picked.length} items`)
  for (const item of picked) console.log(`[full] ${JSON.stringify(item)}`)
  for (const item of picked) {
    const [icon, grid] = await Promise.all([
      image(`https://assets.tarkov.dev/${item.id}-icon.webp`),
      image(`https://assets.tarkov.dev/${item.id}-grid-image.webp`)
    ])
    console.log(`[icon] ${item.id} ${icon}`)
    console.log(`[grid] ${item.id} ${grid}`)
  }
}

main().catch((e) => {
  console.log(`[probe] failed: ${errorMessage(e)}`)
})
