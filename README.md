# Tarkov Loot Optimiser

A Windows desktop app that tells you which Escape from Tarkov items are worth the space in your
bag. Every item is ranked by **roubles per inventory slot**, using live flea market and trader
prices, your PMC level and the game mode you play. It also has:

- **Flea trends:** liquid flea items whose price follows a daily pattern, the best time of day to
  buy and to sell them, and which to buy or sell right now;
- **Quests:** a quest tracker that ticks off quests as you start, finish or fail them in game, by
  reading the game's log files, with the main story's chapters, objectives you tick off as you go
  (and count, like 6/15 cigarettes handed over) or that the app ticks off itself where it can, each
  quest's keys, items, rewards and the wiki's guide and pictures of where to go;
- **To do:** which map to raid next to move your active quests on, each map at a glance and then
  its quests, what to take, and what to hand in, hand over or build before you go;
- **Items to collect:** what your hideout's upgrades and your quests' hand-ins still need (both, or
  just one of them), with the items you've put aside ticked off, which of those you could sell (and
  buy or craft back later), and the items not to sell (rare ones flagged) marked in the loot list;
- **Keys:** the keys to buy and the keys you own (ticked by hand), each split into the ones your
  quests need and the rest, with how to get each (buy it, a quest that gives it, or where it spawns) and where its locks are on the map;
- **Maps:** 2D maps with your quests (named, with their trader) and story chapter steps,
  extracts, transits, spawns, the locks and spawn spots of the keys you need, and what your starred
  items, upgrades and quests still need from raids;
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

- **Sidebars you can trim.** Point at a sidebar section and click its **×** to take it out; the
  line at the bottom of the sidebar lists what's hidden, to bring a section back (or **Show all**).
  **«** folds a tab's whole sidebar away so the page gets the full width, and **»** brings it back.
  Each tab remembers its own.
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
- **Time in raid.** Next to the game modes, the two times a raid can start at right now (Tarkov's
  clock runs 7 times as fast as real time, and the two are 12 hours apart), each with a moon when
  it's dark in raid, a sun when it's light, and a half-lit disc at dawn and dusk. Factory has its own
  day and night versions.
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

Many flea prices follow the clock: across the most-traded items, prices are usually lowest around
12:00–15:00 UTC (the European afternoon) and highest around 21:00–00:00 UTC (the American evening).
The **Flea trends** tab finds when each item is usually cheapest and dearest, so you can buy at one
time and sell at the other.

**Where the prices come from:**

- **tarkov.dev** keeps every price it checked over the last 30 days, about every 2 hours. The app
  downloads that history for the 300 most-listed items worth ₽10,000 or more, the first time you
  open the tab (it takes a few seconds), and refreshes each item every 2 hours while the tab is in
  use. So buy and sell times are there straight away, for every hour of the day.
- **The app's own recordings** add finer detail for the hours it runs: at each price refresh (at
  most every 15 minutes), it saves the lowest price and offers up of the same items, for 30 days,
  skipping a refresh when tarkov.dev hasn't checked any of their prices again. The sidebar shows
  which hours it has recorded.

**Split the day into** 2-, 3-, 4- or 6-hour parts (3 by default). Shorter parts are more precise;
longer ones are steadier, and tarkov.dev only checks a price about every 2 hours. Each day is
compared with itself (each part's lowest price against that day's middle), so a price that rises
or falls over the week isn't mistaken for a time of day. An item gets buy and sell times once it
has prices at two or more times of day on 4 or more days. Each item shows:

- **Now:** **Buy now** or **Sell now** when it's that time (in your time zone), otherwise how long
  until the next one; tick **Only items to buy or sell now** to list just those;
- **Time of day:** a strip with one cell per part of the day, blue where the item is usually cheaper than
  the middle of its day and red where it's dearer (grey in between), with **B** and **S** on the
  buy and sell parts and the part it is now outlined; point at a cell for its usual price;
- **Buy at / Sell at:** the part of the day it's usually cheapest and dearest in, and at roughly
  what price;
- **Profit / unit:** the typical sell price minus the flea listing fee minus the typical buy price;
- **Worked on:** how many days that trade would have made money;
- charts of its lowest price by time of day (with the middle half of prices shaded) and over the
  last 60 days (click a row).

**Today (low–high)** is the cheapest and dearest hour of the last 24 hours (each hour's middle
price, so one stray listing doesn't count), once 6 hours have prices and the price has moved at
least once; before that it's tarkov.dev's own 24-hour range. Until any item has buy and sell times,
the list is ranked by this **swing**: how far the high is above the low. Ranges that include bait
or mistaken listings (under 2/3 or over 1.5× the current price) are ignored.

The default filters show items that swing 15% or more on a usual day, have at least 25 offers up,
cost ₽10,000 or more, make ₽2,000 or more per unit after the fee, worked on at least 60% of days,
and that you can trade at your level. All of these can be loosened in the sidebar, and when the
list is short it says which filter left out the most and offers to loosen it. Look back 7, 14 or
30 days. Weapon presets are left out.

"High volume" means **many offers up**: sales volume isn't published anywhere, so the number of
active listings stands in for how quickly an item sells. To keep recording while the window is
closed, turn on **Keep running in the system tray when the window is closed** (in the Flea trends
sidebar or Settings); **Start with Windows** starts it straight into the tray. Past patterns are no
guarantee, and the flea listing fee is charged when you list, even if the item doesn't sell.

### To do

The **To do** tab says which map to raid next. It takes your active quests (from the game's logs,
or set by hand in the Quests tab) and the objectives you haven't ticked off yet, and ranks the maps
by how many of those quests a raid there moves on. A quest with nothing left to do in raid anywhere
else counts twice and is marked **Finish here**: finishing quests is what opens up the next ones.

- **Overview** (the default) shows a tile for each map, best first, the top one marked **Next
  raid**: how many quests and objectives are left there, how many enemies to kill and objectives to
  locate, a bar of how many of its objectives you've done, the quests it finishes, quests held up by
  a key you don't have (or **Can't get in** without the Lab's keycard), the keys it needs (and how
  many you're missing), items to bring, quests you could pick up there, and the first few quests'
  names. Click a tile (or tab to it and press Enter) to open that map: its quests, keys and what to
  bring, with **◀ All maps** to go back and the maps before and after it in the ranking either side.
  **List** shows every map with its quests on one page instead.
- An opened map (or each one in the list) shows the quests to do there, the **Keys** they need and
  what to **Bring** (markers, items to stash, quest items to plant). **Show on map** opens the map in
  the Maps tab with your quests on it; coming back to To do keeps the map open.
- **Summary** (the default) shows each quest in a few lines: up to three objectives, each kill with
  its count (Eliminate 5 Scavs, 2/5) and the rest by kind (Mark 3 spots, 1/3), a red line for a key
  you don't have (with **I have it**), the other maps it has objectives on, and its reward (money,
  what its items are worth now, experience and reputation). **Full** lists every objective to tick off
  (or count up) right there, and the ranking updates as you do.
- **Details ▶** (or a quest's name) opens the quest's full details beside the maps, as in the Quests
  tab: status, what unlocks it and what it unlocks, every objective with its progress and **Show on
  map**, the keys and items it takes, its rewards and the wiki's guide. **✕** goes back.
- **Filters**, kept until you change them: **Show all** or **Only quests I can do** (leaves out
  every quest held up by a lock none of your keys open, on any map, while still listing the keys
  to get, and maps you can't get onto, like the Lab without its access keycard; the Maps tab shares
  it), and **Both**, **Kill** (objectives to eliminate enemies) or **Locate** (going
  to, marking, finding, stashing, extracting). A quest with both kinds shows just the ones asked for,
  and the maps are ranked by what's shown.
- **Also here, if you pick them up** names quests you haven't started yet that have objectives on
  the same map, so you can take them from their trader first. They don't count towards the
  ranking. Maps where only such quests have objectives are listed under **Other maps**.
- **Before you raid:** active quests with every objective ticked off (hand them in), hand-overs you
  already have the items for (from what you've put aside in Items to collect, or a quest item you've
  found), and hideout upgrades with every item in hand.
- **On any map:** objectives that can be done anywhere (say, kills on any map), and how many items
  your quests still want found in raid, with a link to them in Items to collect.
- **Keys:** with **Show all**, objectives behind a lock none of your keys open are marked **Needs …
  (you don't have it)**, and a quest with nothing else to do there is marked **Needs a key**; **Only
  quests I can do** leaves them out (the summary line says how many quests that hides). **Keys to
  buy** lists the keys that would open them up, with how to get each, plus any you added from the
  Keys tab.

The game's logs only say when a quest starts and finishes, not its objectives, so the ranking is as
good as your ticks (and your keys ticked in the Keys tab).

### Items to collect

The **Items to collect** tab (called Hideout before 1.16.0) tracks your hideout and what your
quests need handed over, per game mode. The game's logs don't record hideout upgrades, so set each
station's level in the sidebar (the Stash starts at level 1).

- **Items needed** totals every item your stations' next levels (or every level still to build)
  and your quests' hand-ins need, how many you've put aside (use **−**/**+**, type a number, or
  **All**) and how many are still missing, with found-in-raid items flagged (and how many, when
  some take any) and the station levels and quests each is for (click a quest to open it). Rare
  items come first; the money the upgrades cost is in the summary line. **Found in raid only**
  narrows the list to items that must be found in raid, showing how many of each.
- **Hideout + quests**, **Hideout only** or **Quests only** above the list: just what the hideout
  or just what your quests need, each counted on its own against what you've put aside. When the
  other needs some of an item too, the row says how many (**+2 for quests**), in amber when what
  you have isn't enough for both; point at it for the totals.
- **Quest items:** under **Count items for**, **Quests**, choose **Active** (the default) or **Every
  quest left**, which adds quests you haven't started or unlocked yet (the Collector's items, for
  example). Quests that take any of several items are listed in the Quests tab's **Items to hand
  over** instead. Items you hand over come off what you've put aside: when you count them up on the
  quest's objective in the Quests tab, or when the game's logs say you finished the quest (only
  what you hadn't counted already, and only if you set the count before finishing it).
- **Sell:** items you've put aside that you could sell get a green **Sell** badge saying how many:
  any more than every level and quest left needs, and anything you can get back now: buy it on the
  flea or from a trader at your loyalty (however pricey or scarce), trade for it in a trader's barter
  at your loyalty (once its quest is done), or craft it at a station you've built. Copies that must be found in raid are kept, as bought ones aren't. Hover the badge for what
  selling gets (the flea after the fee, or a trader), what buying back costs and where (or which
  trader to trade with, or where to craft it), and what selling now and buying back later costs in all. Items put aside that nothing needs any more are listed too. Tick **Can sell only** to see
  just these.
- **Upgrades** shows each station's next level: its items (ticked off as you put them aside), the
  other stations, trader loyalty levels and skills it needs, and how long it takes to build.
  **Mark level N built** sets the level and takes its items off what you've put aside. Each
  card says what buying the missing items would cost now (at your level and trader loyalty, the
  cheapest place for each) plus the upgrade's own money cost, and is marked **Ready** (everything
  in hand), **Can buy the rest**, **Waiting on a requirement** (another station or a trader's
  loyalty level) or neither (something you can't buy yet). Ready ones come first, then the ones you
  can buy the rest for, cheapest first. Parts that must be found in raid aren't priced: they say
  how many to find in raid, or the craft that makes them, and keep the card from **Can buy the
  rest**.
- **Buy or craft** shows the cheapest way to get one now. Items you buy never count as found in
  raid, so for ones that must be found in raid there's no price: it says **Craft** when one of your
  hideout's stations makes it (crafted items count as found in raid), with what buying what the
  craft uses up costs per item (tools aren't used up), the station and how long it takes;
  otherwise **Find in raid**, with **or craft at Workbench 3** (say) when a craft needs a higher
  station level or a quest first. Hover it for every craft that makes it. When only some copies
  must be found in raid, the rest are priced (**for 3 of 5**). The rest of the time it's the
  cheapest way to buy one at your PMC level and trader loyalty: the flea (once it's open to you:
  level 15, or later for some items) or a trader's offer (at your loyalty level, and after the
  quest that unlocks it, if any), or **Can't buy yet** with what would open it up. Set your
  loyalty with the traders who sell what the hideout needs under **Trader loyalty** in the sidebar
  (per game mode; unset is LL1). The Quests tab's **Items to hand over** has the same column.
- **Don't sell:** in the Loot tab, items the hideout or your active quests still need carry a
  **Keep** tag saying how many each wants. Ones that are hard to replace get a red **Rare: don't
  sell** badge: no trader sells them, and on the flea they're banned, cost ₽75,000 or more, or
  have fewer than 5 offers up while being worth ₽20,000 or more. Ones you can't buy yet at your
  level and trader loyalty get an amber **Can't buy yet** badge. Hover either for why; ones a
  trader sells you get neither.
- **What to save right now:** tick **Can't buy or rare only** in the Items to collect list, or **Only
  items to save (can't buy or rare)** in the Loot tab's filters, to see just the items you still
  need that you can't buy at your level and trader loyalty, that must be found in raid, or that
  are rare.

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
rest sold. **Sell what I can buy or craft later** (on by default) keeps only what you can't get
back now (you can't buy it at your level and trader loyalty, trade for it in a barter, nor craft it
at a station you've built) and the copies that must be found in raid, marked **(found in raid)**. The rest of what's
needed is sold, marked **needed later** with what buying it back costs and where, the trader to
trade with (**trade with Mechanic LL2**), or where to craft it: needing 3 found in raid and 2 more of an item you can buy, it keeps 3 and sells 2. Untick it to
keep everything the hideout and your quests need. The totals say what selling the rest earns. **Add N kept items to Items needed** adds what
you're keeping for the hideout and your quests to the **Have** counts (**Undo** takes them off
again). A haul that takes two screenshots can be read together with **Add another**.

**Everything I have:** add a screenshot of each page of your stash (scroll down between them) and of
every case or container you keep hideout items in, open. **Add latest screenshot**, **Add picture…**,
paste and drop all add to the same scan; **Start over** clears it. The panel lists how each count in
Items needed would change, and **Update my counts** sets each item the hideout or a quest still needs
(for any level or quest left) to the number your screenshots show. Items on the list that aren't in
any screenshot go back to 0 (it asks first), so include every place you keep them; items nothing
needs are left out, and so is money. **Undo** puts the old counts back. When a screenshot repeats rows from the
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

### Keys

The **Keys** tab lists the keys to buy and the keys you own, per game mode. The
game's logs don't say which keys you have, so tick them yourself.

- **Keys to buy** and **Keys owned** each have two parts. **For quests** comes from the quests:
  every objective not yet done that has a lock to open, and tarkov.dev's list of each quest's keys.
  Choose whose in **Keys for**: **Active**, **Active + available** (quests you could start too) or
  **Every quest left**. **Other** is every other key: under Keys to buy it's folded (click it to
  list them, to tick ones no quest needs); under Keys owned it's the keys you have that none of
  those quests need. The summary says how many keys those quests need, how many you own and how
  many are left to buy. Each key says which quests need it and their status; quests you can't start
  yet say why (**Needs level 25**, a trader's loyalty level or another quest). A lock that takes any
  of several keys is one row. Ticking a key moves it from Keys to buy to Keys owned.
- **How to get it:** the cheapest way to buy it now at your level and trader loyalty, or **Can't buy
  yet** with what's in the way (the flea's level for that key, a loyalty level, a quest); a quest
  that gives it as a reward or when you accept it; and the maps where it can spawn as loose loot
  (how many spots, and whether one only ever has keys). Keys also spawn in containers, which the
  data doesn't list, and it doesn't say how likely a key is at a spot.
- **Show on map** opens the Maps tab on the key's map with its locks and spawn spots highlighted (and
  links to the other maps it's on). **Add to To do** lists it under **Keys to buy** in the To do
  tab.
- **Map** (in the sidebar) shows only the keys used on one map: a lock there, a quest that needs it
  there, or getting you onto it (the Lab's keycard); where a key spawns doesn't count. It's
  remembered, and **Show on map** then opens that map.
- **Read from screenshots** (next to **Keys** at the top) ticks your keys for you. In game, open
  your key tool, keycard holder and any case you keep keys in, and take a screenshot of each (and of
  stash pages with loose keys); add them all with **Use latest screenshot**, **Open picture…**, paste
  or drop. The app reads every item the way the Items to collect scanner does (on your PC) and lists
  just the keys, marked **New** or **Ticked**; fix any it got wrong or add one it missed. **Update my
  keys** makes the keys found your keys: ones you'd ticked that aren't in any screenshot are unticked
  (it asks first), and **Undo** puts your old list back. The screenshots are shared with Items to
  collect's scanner, so stash pages read there can tick your keys too.
- **Keys owned** stop the To do tab from leaving out what they open. The key list comes from
  tarkov.dev, so keys a patch adds or removes follow with the next data refresh.

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
  trader, map, faction, and Kappa or Lightkeeper. **Items to hand over** lists what your **Active**
  (or **Active + available**) quests still want handed over or planted, flagging found-in-raid
  items, with how many you've put aside in Items to collect (**Have**, ticked when it's enough).
- **Objectives you tick off:** in a quest's panel, tick each objective off as you do it, or count
  the ones that take several (**−**/**+**, type a number, or **All**): say 6 of the 15 cigarettes
  for Bad Habit handed over (per game mode, kept with your progress). The quest list shows how many
  objectives are done (3/5), done objectives leave the map, and what's been handed over comes off
  **Items needed** and the Keep tags (9 more cigarettes, not 15). A completed quest shows every
  objective ticked.
- **Objectives ticked off for you:** the game's logs only say when a quest starts, finishes or
  fails, not its objectives, but some the app can tell by itself, marked **auto** (point at it to
  see why): "reach level N" from your PMC level, "reach loyalty level N with a trader" from the
  levels set in the Items to collect tab, objectives on another quest's progress, and story steps like
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
  objectives with the keys each needs (and whether you have one: **you don't have it** comes with
  an **I have it** link to tick it), the keys and items it takes, what it gives when you accept
  it, its rewards (experience, reputation, items and money, trader and craft unlocks, skills) and
  the guide from the [Escape from Tarkov Wiki](https://escapefromtarkov.fandom.com) with its
  pictures of where to go (click one to see it full size). Guides are kept for a week, so ones
  you've opened work offline.
- **Event quests:** limited-time event quests (Fog of War, Number Temporarily Unavailable…) aren't
  on tarkov.dev, so the app can't list them by itself. Under **Event quests** in the Quests tab's
  sidebar, **Add event quests…** lists the wiki's event quests (this event's first; tick **Show
  past events' quests** for older ones): tick the ones you have, or paste a wiki link or a quest's
  name. Each is read from its page on the wiki and shown under its trader with an **Event** tag:
  the loyalty level and quest it needs, its objectives (each with its map, and the items to stash or
  hand over, which count towards **Items needed**), the trader's briefing and its rewards. They
  show on the To do tab like any quest. The game's logs don't name event quests, so set their
  status in the quest's panel yourself; **Remove from my quests** takes one off. The quests an added
  one leads to are offered next (in the sidebar and the picker). Pages are refreshed twice a day and
  kept for when the wiki can't be reached. If tarkov.dev starts listing a quest, its own version is
  shown instead.
- **Maps:** your active (or available) quests as pins with the quest's name and trader, the
  trader's portrait and an icon for each thing to do there (go to, pick up, stash, mark, eliminate,
  extract, and a key when one's needed); click one to open the quest's panel on the right, the same
  as in Quests. Pins in the style of [db4tarkov](https://db4tarkov.com/map) show your side's extracts (flare, vehicle, co-op and secret
  ones marked, with what they need), transits, boss spawns, sniper scavs, place names and PMC
  spawns. Customs, Ground Zero, Woods, Shoreline, Reserve, Interchange, Lighthouse and Streets use
  the clean community 2D maps db4tarkov shows; Factory, Icebreaker, Labyrinth and Terminal use
  [Re3MR](https://reemr.se)'s, and the Lab the
  [Escape from Tarkov Wiki](https://escapefromtarkov.fandom.com/wiki/Map:The_Lab)'s, with its
  basement, first and second floors side by side. Each marker is drawn on the floor, deck or inset
  it's on (the Ground Zero underground, the Shoreline resort's floors, Reserve's bunkers,
  Interchange's mall, the Lab's floors). **Show on map** on any objective jumps to it. Map images are downloaded the first time you
  open a map and kept, so they work offline afterwards. The Ground Zero tutorial, which tarkov.dev
  lists as a map of its own, is left out everywhere in the app.
- **Only quests I can do on the maps:** the same filter as the To do tab (switching it on either tab
  switches both). With **Show all**, a pin whose objective needs a key you don't have shows its key
  in amber on dark, like a lock you have no key for, and its tooltip says **(you don't have it)**;
  **Only quests I can do** takes the whole quest off the map (all its objectives, on every map,
  until you have the key or have done the locked part), and the sidebar says how many it hid. On a map you can't get onto (the Lab without its access keycard) every objective is left
  out. A quest opened with **Show on map** is shown anyway.
- **Kill objectives on the maps:** most kill objectives have no place to pin, so a **☠** banner
  across the top of the map lists your active quests' kills left on that map, the ones naming the
  fewest maps first, then the ones for any map (marked **any map**). Each gives the quest, what to
  kill and with what (a gun, headshots, from a distance) and how many are done, such as **2 / 5**.
  Click a quest to open its panel; click the banner's heading to fold it (it's remembered).
  **Only quests I can do** leaves out quests a key you don't have holds up.
- **Keys on the maps:** tick **Locks for keys your quests need** to see each locked door or
  container they open (green when you have the key) and the loose loot spots where the ones you
  don't have can spawn. A key opened from the Keys tab's **Show on map** is highlighted, with how many
  locks and spots it has on this map.
- **Story steps on the maps:** nobody publishes where story steps are (tarkov.dev leaves the story
  out, and the wiki describes places in words), so the app works out which map each step is on from
  the step and its part of the wiki's guide, and lists the unfinished ones under **Story steps
  here**, below **Quests on this map**. A step that names a place the map knows (the Resort, Lexos, the Tunnel extract) gets a
  dashed **≈ roughly here** pin there. **Pin it** (or **Pin it exactly**) lets you click where a step
  really is: your pin is kept (in every game mode), and **Move** and **Remove** change it. In a
  chapter's panel, steps with no map can be pinned on any map you pick (point at the step to see
  the picker).
- **Favourites on the map:** star (☆) items in Items to collect's **Items needed**, a station's
  next level in **Upgrades**, or quests (in the Quests list or a quest's panel), and the
  **★ Favourites** panel at the top right of the map lists what they still need from raids: items
  you can't buy, trade for or craft now (**can't get yet**, all of what's missing), the copies that
  must be found in raid (**found in raid**), and for a starred quest the items it still needs
  handed over or planted plus the quest items to pick up (**quest item**). Each says how many and
  what it's for; one item wanted by several favourites is listed once. Built levels and finished
  quests drop out by themselves. Click the panel's heading to fold it away (it's remembered).
  Favourites are kept per game mode.
- **Where to find them:** under each item the panel says where it can turn up on the map you're
  looking at: how many loose loot spots it can spawn at (tarkov.dev's map data) and the containers
  likeliest to hold it, with the chance one search turns one up (**Here: 6 loose spots · Technical
  supply crate 2%, Duffle bag 0.5%**; hover for more). **Show** draws a transparent circle in the
  item's own colour over the area where it turns up most on that map (its loose spots, and the
  containers that can hold it weighted by their chance), not every spot. Show as many items as you
  like: each gets its own circle, and hovering one shows the icons of the items that turn up there,
  with how many loose spots and containers it covers. The items you show are remembered, follow you
  from map to map (each map gets its own circle), and drop off when they're no longer needed.
  **Better on Customs** (say) opens a map that gives clearly more chances to find it.
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
about 1 MB a day), your quest progress, raid history, hideout, keys and pins on story steps (`player.json`), where the app got to in the
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
                flea trend analysis (fleaTrends.ts), the item tracker (hideout.ts), the
                To do tab's map ranking (todo.ts) and the key tracker (keys.ts)
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
if newer tables appear there (in October 2026 they were still the same). Each kind of container
also lists the game's template ids it's made of, which is how tarkov.dev's maps name the
containers at each spot, so the Maps tab can place them. The CI smoke test warns when too many of the bundled items no
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
[db4tarkov.com](https://db4tarkov.com/map) (CC BY-NC-SA 4.0, fetched from its CDN), and the Lab's
interactive map image by Jindouz from the
[Escape from Tarkov Wiki](https://escapefromtarkov.fandom.com/wiki/Map:The_Lab) (CC BY-SA 3.0,
fetched from its CDN). Pin icons: [Material Design Icons](https://pictogrammers.com/library/mdi/)
(Apache-2.0). Map rendering: [Leaflet](https://leafletjs.com) (BSD-2-Clause). Screenshot text
recognition: [Tesseract.js](https://github.com/naptha/tesseract.js) and its English model
(Apache-2.0). The log formats
follow what [TarkovMonitor](https://github.com/the-hideout/TarkovMonitor) documents.
Container loot tables: the [SPT](https://github.com/sp-tarkov/server-csharp) project's server
database (NCSA licence). Container pictures, and quest guides and their pictures: the
[Official Escape from Tarkov Wiki](https://escapefromtarkov.fandom.com) (CC BY-SA 3.0).
Not affiliated with or endorsed by Battlestate Games.
