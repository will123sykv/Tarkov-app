// Starts the built app (npm run build) with an empty profile and goes through every tab, each tab's own
// tabs and Settings, failing on an error a page shows or logs (since 1.71.0). Network errors don't
// count: tarkov.dev may be out of reach. On Linux, run it under a display: xvfb-run -a node scripts/smoke-app.mjs

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright-core'

const root = resolve(fileURLToPath(import.meta.url), '../..')
const profile = await mkdtemp(join(tmpdir(), 'tlo-smoke-'))
const problems = []
const NETWORK = /net::|ERR_|Failed to fetch|Failed to load resource|NetworkError|status of [45]\d\d/i

const app = await electron.launch({
  executablePath: electronPath,
  args: ['--no-sandbox', root],
  // The profile goes in XDG_CONFIG_HOME on Linux; APPDATA on Windows.
  env: { ...process.env, XDG_CONFIG_HOME: profile, APPDATA: profile },
  timeout: 60_000
})
let step = 'starting'
try {
  const win = await app.firstWindow()
  win.on('pageerror', (e) => problems.push(`${step}: ${e.message}`))
  win.on('console', (m) => {
    if (m.type() === 'error' && !NETWORK.test(m.text())) problems.push(`${step}: ${m.text().slice(0, 300)}`)
  })
  await win.setViewportSize({ width: 1600, height: 950 })
  await win.waitForSelector('.view-tabs', { timeout: 60_000 })

  const check = async () => {
    await win.waitForTimeout(800)
    const shown = await win.locator('.error-boundary').allInnerTexts()
    for (const text of shown)
      problems.push(`${step}: error panel: ${text.replace(/\s+/g, ' ').slice(0, 300)}`)
  }

  const tabs = await win.locator('.view-tabs [role="tab"]').allInnerTexts()
  if (tabs.length < 5) throw new Error(`Only ${tabs.length} tabs`)
  for (const [i, name] of tabs.entries()) {
    step = name.trim()
    // Ctrl+1 … Ctrl+0, as a player would.
    await win.keyboard.press(`Control+${(i + 1) % 10}`)
    await check()
    if ((await win.locator('.view-tabs [role="tab"][aria-selected="true"]').innerText()) !== name)
      problems.push(`${step}: Ctrl+${(i + 1) % 10} didn't open it`)
    const subTabs = win.locator('main [role="tablist"] [role="tab"]')
    const names = await subTabs.allInnerTexts()
    for (const [j, sub] of names.entries()) {
      step = `${name.trim()} › ${sub.trim()}`
      await subTabs.nth(j).click()
      await check()
    }
  }

  step = 'Settings'
  await win.click('button[title="Settings"]')
  await win.waitForSelector('dialog[open]', { timeout: 10_000 })
  await check()
  await win.keyboard.press('Escape')
  await check()
  console.log(`Went through ${tabs.length} tabs: ${tabs.join(', ')}, and Settings.`)
} catch (err) {
  problems.push(`${step}: ${err instanceof Error ? err.message : String(err)}`)
} finally {
  await app.close().catch(() => {})
  await rm(profile, { recursive: true, force: true }).catch(() => {})
}

if (problems.length) {
  console.error(`App smoke test failed:\n${problems.map((p) => `- ${p}`).join('\n')}`)
  process.exit(1)
}
console.log('App smoke test passed.')
