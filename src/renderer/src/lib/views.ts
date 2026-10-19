import type { AppView } from '../../../shared/types'

/** The tabs in the order the top bar shows them (Ctrl+1 to Ctrl+9, then Ctrl+0), with their subtitles. */
export const VIEWS: { id: AppView; label: string; subtitle: string }[] = [
  { id: 'loot', label: 'Loot', subtitle: 'Value per inventory slot' },
  { id: 'trends', label: 'Flea trends', subtitle: 'Best times to buy and sell' },
  { id: 'todo', label: 'To do', subtitle: 'Which map to raid next for your quests' },
  { id: 'weapons', label: 'Weapons', subtitle: 'The gun to bring to each map for kill quests' },
  { id: 'quests', label: 'Quests', subtitle: 'Quest progress from your game logs' },
  {
    id: 'hideout',
    label: 'Items to collect',
    subtitle: 'What your hideout and quests still need, its crafts and screenshots'
  },
  { id: 'crafting', label: 'Hideout', subtitle: 'What to craft at each station now' },
  { id: 'keys', label: 'Keys', subtitle: 'Your keys and the ones quests need' },
  { id: 'maps', label: 'Maps', subtitle: 'Quest objectives, extracts and spawns' },
  { id: 'raids', label: 'Raids', subtitle: 'Raids and flea sales from your logs' }
]

/** The tabs in order, for Ctrl+1 to Ctrl+9, then Ctrl+0. */
export const TAB_ORDER: AppView[] = VIEWS.map((v) => v.id)
