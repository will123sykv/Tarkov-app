# Tarkov Loot Optimiser

A Windows desktop app that tells you which Escape from Tarkov items are worth the space in your
bag. Every item is ranked by **roubles per inventory slot**, using live flea market and trader
prices, your PMC level and the game mode you play.

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
  5 minutes by default (1–60 minutes in Settings). The status bar shows where prices came from
  and how old they are.
- **Works offline.** The last good prices are saved locally. If a refresh fails, the app keeps
  using them and shows a banner.
- **Flea access by level.** Enter your PMC level (1–62). Each item is marked **Sellable**,
  **Locked · Lv N** (the flea opens at 15, and some categories unlock later) or **Flea banned**.
  Items you can't sell on the flea are valued at the best trader price. You can hide them.
- **Game modes.** Switch between PvP, PvE and PvP Season. Each mode keeps its own PMC level,
  because each is a separate character in game.
- **Loot pools.** Filter by category (barter items, keys, meds, ammo, weapons and more) and,
  optionally, by map.
- **Your settings are remembered** between sessions: mode, levels, pool, filters and sort order.

### How an item's worth is calculated

| Flea access at your level | Worth                                                                        |
| ------------------------- | ---------------------------------------------------------------------------- |
| Sellable                  | The higher of the flea price minus the listing fee, or the best trader price |
| Locked or flea banned     | Best trader price                                                            |

The flea price is the current lowest offer, or the 24h average if there is no current offer.
You can turn off fee subtraction in Settings. Weapon presets and items with no known sell price
are left out.

### Things to know

- **PvP Season uses PvP prices.** tarkov.dev doesn't publish Season economy data, so Season mode
  shows PvP prices with a warning banner. Season has its own economy, so real values may differ.
- **Map pools cover loose loot only.** They come from tarkov.dev's loose-loot spawn data. Items
  that only spawn inside containers (jackets, safes, PCs, …) aren't included in a map's pool.
- **Stackable items** (ammo, money) are valued per single unit, not per full stack.

### Optional: tarkov-market fallback

If tarkov.dev can't be reached, the app can fetch PvP and PvE prices from
[tarkov-market](https://tarkov-market.com/dev/api) instead. This needs an API key, which requires
a tarkov-market Pro account. Paste it into **Settings → tarkov-market fallback**. The key is
encrypted with Windows DPAPI and stored only on your PC. Without a key, the app falls back to its
offline cache.

### Where data is stored

Settings, the encrypted API key and the price cache live in
`%APPDATA%\Tarkov Loot Optimiser`. Delete that folder to reset the app.

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
npm run smoke:api    # check the live tarkov.dev API still matches our queries
```

### Project layout

```
src/shared/     Types, game modes, categories, settings validation and the valuation logic
src/main/       Electron main process: settings, price fetching and caching, auto-updater
  pricing/      tarkov.dev and tarkov-market clients, fallback chain, refresh timer, map pools
src/preload/    The typed bridge exposed to the UI as window.api
src/renderer/   React UI (Zustand store, virtualized item table)
tests/          Unit tests with API fixtures
```

All network requests happen in the main process. The UI never sees the API key.

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
Not affiliated with or endorsed by Battlestate Games.
