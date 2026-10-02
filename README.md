# Tarkov Loot Optimiser

A Windows desktop app that tells you which Escape from Tarkov items are worth the space in your
bag. Every item is ranked by **roubles per inventory slot**, using live flea market and trader
prices, your PMC level and the game mode you play. It also has:

- **Flea trends:** liquid flea items whose price follows a daily pattern, and the best time of day
  to buy and to sell them;
- **Quests:** a quest tracker that ticks off quests as you start, finish or fail them in game, by
  reading the game's log files, with the main story's chapters, objectives you tick off as you go
  (and count, like 6/15 cigarettes handed over) or that the app ticks off itself where it can, each
  quest's keys, items, rewards and the wiki's guide and pictures of where to go;
- **Hideout:** what your hideout's upgrades still need, with the items you've put aside ticked
  off, and the items not to sell (rare ones flagged) marked in the loot list;
- **Maps:** interactive maps with your quests (named, with their trader) and story chapter steps,
  extracts, transits and spawns;
- **Raids:** your raid history and flea market sales, also from the logs.

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
- **Quests, maps and raids** from the game's own log files (see below).
- **Your settings are remembered** between sessions: view, mode, levels, container, map, filters
  and sort order.

### Flea trends

tarkov.dev only publishes one historical price per day, so the app records prices itself. At each
price refresh (at most every 15 minutes), it saves the lowest flea price and the number of offers
up for the 300 most-listed items worth ₽10,000 or more in the current game mode. Recordings are
kept for 30 days.

Once there are **3 days** of recordings, each item gets:

- **Buy at / Sell at:** the hour of day when its lowest price is usually cheapest and dearest, in
  your time zone;
- **Profit / unit:** the typical sell price minus the flea listing fee minus the typical buy price;
- **Worked on:** how many of the recorded days that trade would have made money;
- charts of its lowest price by hour of day (with the middle half of prices shaded) and of
  tarkov.dev's daily lowest price over the last 60 days (click a row).

Until then, the list is ranked by **today's swing**: how far tarkov.dev's 24h high is above its 24h
low. Ranges that include bait or mistaken listings (under 2/3 or over 1.5× the current price) are
ignored. The buy and sell columns say "collecting".

The list is kept short by default. It shows only items that:

- **swing 30% or more**: today's low to high while collecting, then between the cheapest and
  dearest hour once patterns are ready;
- have **at least 50 offers up** and cost **₽20,000 or more**;
- once patterns are ready, make **₽5,000 or more per unit** after the fee and would have worked on
  **at least 70% of days**;
- you can trade on the flea at your level.

All of these can be loosened in the sidebar. Look back 7, 14 or 30 days. Weapon presets are left
out. If you used 1.3.0, filters you'd left at its looser defaults move to these ones; any you
changed stay as you set them.

"High volume" means **many offers up**: sales volume isn't published anywhere, so the number of
active listings stands in for how quickly an item sells. Patterns are only as good as the hours
the app was running for, so it lists any hours of the day with no recordings. To record around
the clock, turn on **Keep running in the system tray when the window is closed** (in the Flea
trends sidebar or Settings). Closing the window then leaves the app in the tray, still refreshing
prices; use **Quit** in the tray menu to exit. **Start with Windows** starts it straight into the
tray. Past patterns are no guarantee, and the flea listing fee is charged when you list, even if
the item doesn't sell.

### Hideout

The **Hideout** tab tracks your hideout per game mode. The game's logs don't record hideout
upgrades, so set each station's level in the sidebar (the Stash starts at level 1).

- **Items needed** totals every item your stations' next levels (or every level still to build)
  need, how many you've put aside (use **−**/**+**, type a number, or **All**) and how many are
  still missing, with found-in-raid items flagged (and how many, when some levels take any) and
  the station levels each is for. Rare items come first; the money the upgrades cost is in the
  summary line. **Found in raid only** narrows the list to items that must be found in raid,
  showing how many of each.
- **Upgrades** shows each station's next level: its items (ticked off as you put them aside), the
  other stations, trader loyalty levels and skills it needs, and how long it takes to build.
  **Mark level N built** sets the level and takes its items off what you've put aside. Each
  card says what buying the missing items would cost now (at your level and trader loyalty, the
  cheapest place for each) plus the upgrade's own money cost, and is marked **Ready** (everything
  in hand), **Can buy the rest**, **Waiting on a requirement** (another station or a trader's
  loyalty level) or neither (something you can't buy yet). Ready ones come first, then the ones you
  can buy the rest for, cheapest first.
- **Buy** shows the cheapest way to buy one now at your PMC level and trader loyalty: the flea
  (once it's open to you: level 15, or later for some items) or a trader's offer (at your loyalty
  level, and after the quest that unlocks it, if any), or **Can't buy yet** with what would open
  it up. Set your loyalty with the traders who sell what the hideout needs under **Trader
  loyalty** in the sidebar (per game mode; unset is LL1).
- **Don't sell:** in the Loot tab, items the hideout or your active quests still need carry a
  **Keep** tag saying how many each wants. Ones that are hard to replace get a red **Rare: don't
  sell** badge: no trader sells them, and on the flea they're banned, cost ₽75,000 or more, or
  have fewer than 5 offers up while being worth ₽20,000 or more. Ones you can't buy yet at your
  level and trader loyalty get an amber **Can't buy yet** badge. Hover either for why; ones a
  trader sells you get neither.
- **What to save right now:** tick **Can't buy or rare only** in the Hideout item list, or **Only
  items to save (can't buy or rare)** in the Loot tab's filters, to see just the items you still
  need that you can't buy at your level and trader loyalty, or that are rare.

#### Screenshots: what to keep and sell, and counting what you have

**Screenshots** (next to Items needed and Upgrades) reads screenshots of your items. Pick what they
show at the top: **New loot** (a scav case haul or a container) or **Everything I have** (your
stash and cases).

1. In game, take a screenshot (Print Screen) with the items on screen.
2. Click **Use latest screenshot** (the newest picture in `Documents\Escape from Tarkov\Screenshots`),
   **Open picture…**, paste one (Ctrl+V) or drop one on the tab. A cropped screenshot works too.
3. The app finds the item grid, outlines each item and reads its short name and stack count.
   Items whose name it can't be sure of are compared with their pictures from tarkov.dev, so look-alikes
   with the same short name are told apart. The reading happens on your PC with Tesseract OCR: the
   screenshot isn't uploaded anywhere.

**New loot:** each item is marked **Keep** (with what for: the hideout, at the **Count items for**
setting, or your active quests, and a **Rare** or **Can't buy yet** badge when it would be hard to
replace), **Sell on the flea** or **Sell to** a trader, whichever pays more at your level (after the
flea fee, if that setting is on). Several stacks of one item are kept until the need is met, and the
rest sold. The totals say what selling the rest earns. **Add N kept items to Items needed** adds what
you're keeping for the hideout to its **Have** counts (**Undo** takes them off again); items kept for
quests aren't counted there. A haul that takes two screenshots can be read together with **Add
another**.

**Everything I have:** add a screenshot of each page of your stash (scroll down between them) and of
every case or container you keep hideout items in, open. **Add latest screenshot**, **Add picture…**,
paste and drop all add to the same scan; **Start over** clears it. The panel lists how each count in
Items needed would change, and **Update my counts** sets each item the hideout still needs (for any
level left) to the number your screenshots show. Items on the list that aren't in any screenshot go
back to 0 (it asks first), so include every place you keep them; items the hideout doesn't need are
left out, and so is money. **Undo** puts the old counts back. When a screenshot repeats rows from the
one before (a stash page that didn't scroll far enough), those rows aren't counted twice (**Count
them anyway** if they really are different items). Items cut off by a screenshot's edge are left out:
they're read on the screenshot that shows them whole. **Count from screenshots** in the Items needed
list opens this. Whether an item was found in raid isn't read.

In either mode, click an item's name to change it (the scanner's best guesses come first, or
search), edit a count, remove a row or add an item it missed. Items it's unsure of are outlined in
amber and marked **Check this one**. If a screenshot shows more than one window (say the stash and a
container), new loot lists the smaller one and lets you tick the others (everything you have counts
them all); **Scan part of it** lets you drag a box around the window you want. Calibrated on 1080p
screenshots; other resolutions and UI scales are scaled to match.

### Quests, maps and raids

The app reads the log files Escape from Tarkov writes as you play. They stay on your PC: nothing
is uploaded. It finds the game's `Logs` folder by itself (launcher and Steam installs); if it
can't, choose it in the **Game logs** panel (in the Quests and Raids views, and Settings). It's in
the game's install folder, or its `build` folder.

- **Quests:** every quest, grouped by trader, marked **Available**, **Active**, **Locked** (with
  what unlocks it), **Completed** or **Failed** at your level. Quests you start, finish or fail in
  game are ticked off automatically, per game mode. The game only keeps logs for recent sessions,
  so to catch up on older progress, open a quest you've reached and use **Mark this and everything
  before it done**, which also completes everything that had to come before it. You can set any
  quest's status by hand; the newest of a manual change and a log entry wins. Filter by status,
  trader, map, faction, and Kappa or Lightkeeper. **Items needed** lists what your active quests
  still want handed over, flagging found-in-raid items.
- **Objectives you tick off:** in a quest's panel, tick each objective off as you do it, or count
  the ones that take several (**−**/**+**, type a number, or **All**): say 6 of the 15 cigarettes
  for Bad Habit handed over (per game mode, kept with your progress). The quest list shows how many
  objectives are done (3/5), done objectives leave the map, and what's been handed over comes off
  **Items needed** and the Keep tags (9 more cigarettes, not 15). A completed quest shows every
  objective ticked.
- **Objectives ticked off for you:** the game's logs only say when a quest starts, finishes or
  fails, not its objectives, but some the app can tell by itself, marked **auto** (point at it to
  see why): "reach level N" from your PMC level, "reach loyalty level N with a trader" from the
  levels set in the Hideout tab, objectives on another quest's progress, and story steps like
  "survive and extract from Customs or visit Customs 3 times", counted from your raids on that map
  in the logs since the chapter started (not as a scav). You can count further than the app did, but
  not below it.
- **Story chapters:** the main story (Tour, Falling Skies, The Ticket, and the side chapters Batya,
  The Unheard, Blue Fire, They Are Already Here, Accidental Witness, The Labyrinth and Boreas) is
  listed first. tarkov.dev doesn't carry the chapters, so their steps come from each chapter's page
  on the wiki: optional steps, sub-steps and the paths a chapter branches into (which ending, what
  you did with the armored case) are shown as the wiki lists them, with what starts the chapter.
  Chapters start and finish from the game's logs like quests; tick their steps off yourself (or let
  the app count the ones it can, see above). Items a
  chapter's hand-overs take (rechargeable batteries, toolsets…) count towards **Items needed** while
  it's active, except ones on a path you may not take. The steps are refreshed with the quest data,
  and the last ones fetched are kept when the wiki can't be reached. A quest's panel shows its trader, its
  objectives with the keys each needs, the keys and items it takes, what it gives when you accept
  it, its rewards (experience, reputation, items and money, trader and craft unlocks, skills) and
  the guide from the [Escape from Tarkov Wiki](https://escapefromtarkov.fandom.com) with its
  pictures of where to go (click one to see it full size). Guides are kept for a week, so ones
  you've opened work offline.
- **Maps:** your active (or available) quests as pins with the quest's name and trader, the
  trader's portrait and an icon for each thing to do there (go to, pick up, stash, mark, eliminate,
  extract, and a key when one's needed); click one to open the quest's panel on the right, the same
  as in Quests. Pins in the style of [db4tarkov](https://db4tarkov.com/map) show your side's extracts (flare, vehicle, co-op and secret
  ones marked, with what they need), transits, boss spawns, sniper scavs, place names and PMC
  spawns. Customs, Ground Zero, Woods, Shoreline, Reserve, Interchange, Lighthouse and Streets use
  the clean community 2D maps db4tarkov shows; Factory, Icebreaker, Labyrinth and Terminal use
  [Re3MR](https://reemr.se)'s. Each marker is drawn on the floor, deck or inset it's on (the Ground
  Zero underground, the Shoreline resort's floors, Reserve's bunkers, Interchange's mall), and a
  switch goes back to tarkov.dev's map; The Lab uses tarkov.dev's interactive map. **Show on map** on any objective jumps to it. Map images are downloaded the first time you
  open a map and kept, so they work offline afterwards.
- **Story steps on the maps:** nobody publishes where story steps are (tarkov.dev leaves the story
  out, and the wiki describes places in words), so the app works out which map each step is on from
  the step and its part of the wiki's guide, and lists the unfinished ones under **Story steps
  here**. A step that names a place the map knows (the Resort, Lexos, the Tunnel extract) gets a
  dashed **≈ roughly here** pin there. **Pin it** (or **Pin it exactly**) lets you click where a step
  really is: your pin is kept (in every game mode), and **Move** and **Remove** change it. In a
  chapter's panel, steps with no map can be pinned on any map you pick (point at the step to see
  the picker).
- **Raids:** each raid's map, whether you went in as a PMC or a scav, queue and loading times, and
  how long it lasted, plus every flea sale (item, buyer, money received) and expired offer.

The game only writes its logs between raids, so updates appear once you're back in the menu. How a
raid ended (survived, killed, run-through) isn't in the logs, and neither is the scav cooldown.

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

Settings, the encrypted API key, the price and quest caches, the flea price recordings (`trends\`,
about 1 MB a day), your quest progress, raid history, hideout and pins on story steps (`player.json`), where the app got to in the
game's logs (`logs\`), quest guides from the wiki (`cache\quest-guides\`) and downloaded map
images and item pictures (`map-cache\`) live in
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
npm run smoke:api    # check the live tarkov.dev data still matches what the app expects
npm run data:containers  # regenerate the bundled container loot tables (see below)
npm run data:container-images  # re-download container pictures from the Tarkov wiki
npm run data:maps    # regenerate the bundled map projections from tarkov.dev
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
  logs/         Finding and reading the game's log files
  quests/       Quest and map data, and the player's progress and raid history
  maps/         The map image cache (tarkov-map:// scheme)
  scan/         OCR for the scav case scanner (Tesseract), item pictures, the latest screenshot
  data/         containerLoot.json, generated by scripts/build-container-loot.ts
src/preload/    The typed bridge exposed to the UI as window.api
src/renderer/   React UI (Zustand store, virtualized item table, Leaflet maps, the screenshot scanner in
                lib/scavScan.ts); data/mapConfigs.json
                is generated by scripts/build-map-configs.ts, data/posterMaps.json holds how the 2D
                maps (and their floors and insets) line up with game coordinates
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

Price, item, quest and map data: [tarkov.dev](https://tarkov.dev) and
[tarkov-market](https://tarkov-market.com). Map projections: tarkov.dev's
[site](https://github.com/the-hideout/tarkov-dev) (MIT). Map images:
[tarkov.dev's SVG maps](https://github.com/the-hideout/tarkov-dev-svg-maps) by Shebuka and others
(CC BY-NC-SA 4.0), [Re3MR](https://reemr.se)'s 2D maps of Factory, Icebreaker, Labyrinth and
Terminal (CC BY-NC-SA 4.0, fetched from tarkov.dev's repository), and the 2D maps of Customs
(monkimonkimonk and Glory4Lyfe), Ground Zero (xTycho), Woods, Shoreline, Reserve, Lighthouse and
Streets (Jindouz, Shoreline from monkimonkimonk's) and Interchange (Re3MR) as shown on
[db4tarkov.com](https://db4tarkov.com/map) (CC BY-NC-SA 4.0, fetched from its CDN). Pin icons: [Material Design Icons](https://pictogrammers.com/library/mdi/)
(Apache-2.0). Map rendering: [Leaflet](https://leafletjs.com) (BSD-2-Clause). Screenshot text
recognition: [Tesseract.js](https://github.com/naptha/tesseract.js) and its English model
(Apache-2.0). The log formats
follow what [TarkovMonitor](https://github.com/the-hideout/TarkovMonitor) documents.
Container loot tables: the [SPT](https://github.com/sp-tarkov/server-csharp) project's server
database (NCSA licence). Container pictures, and quest guides and their pictures: the
[Official Escape from Tarkov Wiki](https://escapefromtarkov.fandom.com) (CC BY-SA 3.0).
Not affiliated with or endorsed by Battlestate Games.
