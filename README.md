# Tarkov Loot Optimiser

A Windows desktop app that tells you which Escape from Tarkov items are worth the space in your
bag. Every item is ranked by **roubles per inventory slot**, using live flea market and trader
prices, your PMC level and the game mode you play. A second view, **Flea trends**, finds liquid
flea items whose price follows a daily pattern, and the best time of day to buy and to sell them.

## Download

**[Download the latest installer](https://github.com/will123sykv/Tarkov-app/releases/latest)**
(`TarkovLootOptimiser-Setup-x.y.z.exe`).

### Install

1. Run the downloaded `.exe`.
2. The installer isn't code-signed yet, so Windows SmartScreen may say it "protected your PC".
   Click **More info → Run anyway**.
3. Pick an install folder and finish. The app appears in the Start menu and on the desktop.

The app checks GitHub Releases for new versions at startup and every 6 hours. Updates download
in the background. Install them from **Settings → Restart and install**, or they install the
next time you close the app.

## Features

- **Value per slot ranking.** Worth ÷ slots taken (width × height), sorted highest first. You can
  also sort by worth, flea price, trader price, size or name.
- **Live prices.** Flea and trader prices from [tarkov.dev](https://tarkov.dev), refreshed every
  5 minutes by default (1–60 minutes in Settings). The app reads the same data files tarkov.dev's
  website uses (`json.tarkov.dev`) and falls back to tarkov.dev's GraphQL API if they're down.
  The status bar shows where prices came from and how old they are.
- **Works offline.** The last good prices are saved locally. If a refresh fails, the app keeps
  using them and shows a banner.
- **Flea access by level.** Enter your PMC level (1–62). Each item is marked **Sellable**,
  **Locked · Lv N** (the flea opens at 15, and some categories unlock later) or **Flea banned**.
  Items you can't sell on the flea are valued at the best trader price. You can hide them.
- **Game modes.** Switch between PvP, PvE and PvP Season. Each mode keeps its own PMC level,
  because each is a separate character in game.
- **Containers.** Pick what you're about to search (jacket, safe, PC block, toolbox, weapon box,
  caches, bodies and more) and see everything that can spawn in it, ranked by ₽ per slot:
  - a **Chance** column shows how likely one search is to turn up each item;
  - the container list is ranked by **average ₽ per search** at your level, so you can tell which
    containers are worth opening;
  - pick a **map** to use that map's loot tables, or leave it on "All maps";
  - each container has a picture: a thumbnail in the list and a larger one when you hover over it.
- **Flea trends.** Switch to **Flea trends** in the top bar to find flea items you could buy at one
  time of day and sell at another for a profit (see below).
- **Your settings are remembered** between sessions: view, mode, levels, container, map, filters
  and sort order.

### Flea trends

tarkov.dev only publishes one historical price per day, so the app records prices itself. At each
price refresh (at most every 15 minutes), it saves the lowest flea price and the number of offers
up for the 300 most-listed items in the current game mode. Recordings are kept for 30 days.

Once there are **3 days** of recordings, each item gets:

- **Buy at / Sell at:** the hour of day when its lowest price is usually cheapest and dearest, in
  your time zone;
- **Profit / unit:** the typical sell price minus the flea listing fee minus the typical buy price;
- **Worked on:** how many of the recorded days that trade would have made money;
- charts of its lowest price by hour of day (with the middle half of prices shaded) and of
  tarkov.dev's daily lowest price over the last 60 days (click a row).

Until then, the list is ranked by **today's swing**: how far tarkov.dev's 24h high is above its 24h
low. Ranges that include joke or mistaken listings (under half or over twice the current price)
are ignored. The buy and sell columns say "collecting".

Filters: minimum offers up, price, profit and share of days the trade worked, plus "only items I
can trade at my level". Look back 7, 14 or 30 days. Weapon presets are left out.

"High volume" means **many offers up**: sales volume isn't published anywhere, so the number of
active listings stands in for how quickly an item sells. Patterns are only as good as the hours
the app was running for, so it lists any hours of the day with no recordings. To record around
the clock, turn on **Keep running in the system tray when the window is closed** (in the Flea
trends sidebar or Settings). Closing the window then leaves the app in the tray, still refreshing
prices; use **Quit** in the tray menu to exit. **Start with Windows** starts it straight into the
tray. Past patterns are no guarantee, and the flea listing fee is charged when you list, even if
the item doesn't sell.

### How an item's worth is calculated

| Flea access at your level | Worth                                                                        |
| ------------------------- | ---------------------------------------------------------------------------- |
| Sellable                  | The higher of the flea price minus the listing fee, or the best trader price |
| Locked or flea banned     | Best trader price                                                            |

The flea price is the current lowest offer, or the 24h average if there is no current offer.
The listing fee uses the same formula as tarkov.dev (without the Intelligence Center discount).
You can turn off fee subtraction in Settings. Weapon presets and items with no known sell price
are left out.

### Things to know

- **PvP Season uses PvP prices.** tarkov.dev doesn't publish Season economy data, so Season mode
  shows PvP prices with a warning banner. Season has its own economy, so real values may differ.
- **Container loot tables are from mid-2025.** They come from the SPT (Single Player Tarkov)
  community project's server database, which recorded what turned up in each container in live
  raids. The newest items in it date from July 2025, before Tarkov 1.0, so items added since then
  never show up as container loot, and there's no data for Terminal. The app shows the date next
  to the container list.
- **Stackable items** (ammo, money) are valued per single unit, not per full stack. That makes
  containers full of money (safes, cash registers) look worse than they are.

### Optional: tarkov-market fallback

If tarkov.dev can't be reached, the app can fetch PvP and PvE prices from
[tarkov-market](https://tarkov-market.com/dev/api) instead. This needs an API key, which requires
a tarkov-market Pro account. Paste it into **Settings → tarkov-market fallback**. The key is
encrypted with Windows DPAPI and stored only on your PC. Without a key, the app falls back to its
offline cache.

### Where data is stored

Settings, the encrypted API key, the price cache and the flea price recordings (`trends\`, about 1
MB a day) live in `%APPDATA%\Tarkov Loot Optimiser`. Delete that folder to reset the app.

## Development

Requires Node.js 22+.

```sh
npm ci
npm run dev          # run the app with hot reload
npm test             # unit tests (Vitest)
npm run typecheck
npm run format       # Prettier
npm run build        # compile main, preload and renderer into out/
npm run dist         # build a Windows installer into dist/ (run on Windows)
npm run smoke:api    # check the live tarkov.dev data still matches what the app expects
npm run data:containers  # regenerate the bundled container loot tables (see below)
npm run data:container-images  # re-download container pictures from the Tarkov wiki
```

### Project layout

```
src/shared/     Types, game modes, settings validation, item and container valuation,
                flea trend analysis (fleaTrends.ts)
src/main/       Electron main process: settings, price fetching and caching, auto-updater,
                container loot tables, tray (background.ts)
  pricing/      json.tarkov.dev, tarkov.dev GraphQL and tarkov-market clients, fallback chain,
                refresh timer
  trends/       Flea price recorder and the trend analysis service
  data/         containerLoot.json, generated by scripts/build-container-loot.ts
src/preload/    The typed bridge exposed to the UI as window.api
src/renderer/   React UI (Zustand store, virtualized item table)
tests/          Unit tests with API fixtures
```

All network requests happen in the main process. The UI never sees the API key.

### Container loot tables

`src/main/data/containerLoot.json` is generated, not hand-written. `npm run data:containers`
downloads SPT's per-map `staticLoot.json` files, merges container variants that share a name
(for example the several kinds of jacket), and writes a compact copy. By default it reads the
archived [sp-tarkov/server-csharp](https://github.com/sp-tarkov/server-csharp) repository
(NCSA licence). `npm run data:containers -- --source tushonka` reads its maintained successor,
[SP-Tushonka/server-csharp](https://github.com/SP-Tushonka/server-csharp) (CC BY-NC-SA 4.0),
if newer tables appear there. The CI smoke test warns when too many of the bundled items no
longer exist on tarkov.dev.

### Container pictures

`src/renderer/src/assets/containers/` holds a picture of each container: the lead image of its
page on the Official Escape from Tarkov Wiki, with `credits.json` recording where each came from.
`npm run data:container-images` downloads them. The **Container images** workflow runs it in CI
and commits the result whenever the script or `scripts/container-image-titles.json` changes (or
when started by hand). That JSON file lists which wiki pages to try for a container when its page
isn't named like the container, and an empty list means "no picture". Images of maps are skipped.

### Releasing

CI (`.github/workflows/ci.yml`) runs on every push:

- format check, typecheck, tests and a build;
- a Windows installer build, attached to the run as an artifact;
- a live tarkov.dev smoke test. This one doesn't block anything if tarkov.dev is down.

To publish a release:

```sh
npm version 0.2.0        # bumps package.json and creates the v0.2.0 tag
git push --follow-tags
```

The tag triggers `.github/workflows/release.yml`. It checks that the tag matches
`package.json`, runs the tests, builds the installer and publishes it to GitHub Releases along
with the `latest.yml` file that installed copies read to find updates.

> Auto-update downloads from this repository's public releases. If the repository is private,
> installed copies can't see new releases.

## Credits

Price and item data: [tarkov.dev](https://tarkov.dev) and [tarkov-market](https://tarkov-market.com).
Container loot tables: the [SPT](https://github.com/sp-tarkov/server-csharp) project's server
database (NCSA licence). Container pictures: the
[Official Escape from Tarkov Wiki](https://escapefromtarkov.fandom.com) (CC BY-SA 3.0).
Not affiliated with or endorsed by Battlestate Games.
