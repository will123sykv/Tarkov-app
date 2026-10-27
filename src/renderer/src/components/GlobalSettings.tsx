import { useState } from 'react'
import { dataModeFor } from '../../../shared/gameModes'
import { EMPTY_HIDEOUT } from '../../../shared/hideout'
import { MIN_PROFIT_MINUTES, TREND_INTERVALS } from '../../../shared/settings'
import type { PublicSettings, QuestSettings, TodoSettings, TrendSettings } from '../../../shared/types'
import { useFriendKeys } from '../lib/useFriendKeys'
import { useStore } from '../store'
import { SquadToggle } from './FriendKeys'

// Settings that apply across the app's tabs, in the Settings dialog (since 1.40.0): what the quest
// tabs show, the wiki's quest data, trader loyalty and how flea trends are read.

const MODE_NAME = { pvp: 'PvP', pve: 'PvE', season: 'PvP Season' } as const

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: readonly (readonly [T, string, string?])[]
  onChange: (value: T) => void
}): React.JSX.Element {
  return (
    <div className="segmented small" role="radiogroup" aria-label={label}>
      {options.map(([id, text, title]) => (
        <button
          key={String(id)}
          role="radio"
          aria-checked={value === id}
          className={value === id ? 'active' : ''}
          title={title}
          onClick={() => onChange(id)}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

/** What the To do, Maps and Quests tabs show, and how. */
export function QuestSettingsSection({ settings }: { settings: PublicSettings }): React.JSX.Element {
  const updateSettings = useStore((s) => s.updateSettings)
  const friendKeys = useFriendKeys(settings)
  const t = settings.todo
  const setTodo = (patch: Partial<TodoSettings>): void => void updateSettings({ todo: { ...t, ...patch } })
  return (
    <section id="settings-quests">
      <h3>Quests and maps</h3>
      <span className="toggle-label">Show</span>
      <Choice
        label="Show"
        value={t.show}
        options={[
          ['all', 'Show all', 'Every quest, with keys you don’t have marked'],
          ['doable', 'Only quests I can do', 'Leave out quests that need a key you don’t have']
        ]}
        onChange={(show) => setTodo({ show })}
      />
      <p className="hint">
        <strong>Only quests I can do</strong> leaves quests held up by a key you don&rsquo;t have (on any map)
        out of the To do, Maps and Quests tabs, and the maps you can&rsquo;t get onto out of To do and Maps.
        The Keys tab still lists every key.
      </p>
      <SquadToggle
        friendKeys={friendKeys}
        on={t.squadKeys}
        onChange={(squadKeys) => setTodo({ squadKeys })}
      />
      {friendKeys.friends.length > 0 && (
        <p className="hint">Counts the keys your friends shared (Keys tab) as yours, for raiding together.</p>
      )}
      <span className="toggle-label">Quests on the To do tab</span>
      <Choice
        label="Quests on the To do tab"
        value={t.view}
        options={[
          ['summary', 'Summary', 'Each quest in a few lines'],
          ['full', 'Full', 'Every objective of each quest']
        ]}
        onChange={(view) => setTodo({ view })}
      />
    </section>
  )
}

/** What the wiki adds to tarkov.dev's quests. */
export function WikiSettingsSection({ settings }: { settings: PublicSettings }): React.JSX.Element {
  const updateSettings = useStore((s) => s.updateSettings)
  const q = settings.quests
  const set = (patch: Partial<QuestSettings>): void => void updateSettings({ quests: { ...q, ...patch } })
  return (
    <section id="settings-wiki">
      <h3>From the wiki</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={q.wikiCorrections}
          onChange={(e) => set({ wikiCorrections: e.target.checked })}
        />
        Correct quests from the wiki
      </label>
      <p className="hint">
        Where a quest&rsquo;s wiki page differs from tarkov.dev&rsquo;s data (its level, Kappa, the quests
        before it, objective counts, steps left out), the wiki&rsquo;s is used, and the quest&rsquo;s panel
        says what changed.
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={q.wikiOnlyQuests}
          onChange={(e) => set({ wikiOnlyQuests: e.target.checked })}
        />
        Add quests only the wiki has
      </label>
      <p className="hint">
        Quests tarkov.dev doesn&rsquo;t list yet (Make Amends, To the Light…), marked Wiki. The Arena&rsquo;s
        are left out.
      </p>
    </section>
  )
}

/** A trader's portrait, or their initials when it can't be loaded (offline, say). */
function TraderPortrait({ name, src }: { name: string; src: string | null }): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  return src && !failed ? (
    <img className="loyalty-portrait" src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
  ) : (
    <span className="loyalty-portrait" aria-hidden>
      {name.slice(0, 2)}
    </span>
  )
}

/** Loyalty with each trader, for the game mode played: what can be bought, and loyalty quest steps. */
export function LoyaltySettingsSection({ settings }: { settings: PublicSettings }): React.JSX.Element {
  const traders = useStore((s) => s.questData[dataModeFor(settings.gameMode)]?.dataset?.traders) ?? []
  const levels = useStore((s) => s.hideoutProgress[settings.gameMode]?.traders) ?? EMPTY_HIDEOUT.traders
  const setTraderLevel = useStore((s) => s.setTraderLevel)
  // Traders with loyalty levels to reach (not the ones with a single level, like the BTR driver).
  // Quest data saved without the levels (an old save): LL1 to 4.
  const listed = traders
    .filter((t) => t.levels.length !== 1)
    .map((t) => ({ ...t, choices: t.levels.length ? t.levels.map((l) => l.level) : [1, 2, 3, 4] }))
  return (
    <section id="settings-loyalty">
      <h3>Trader loyalty</h3>
      <p className="hint">
        For {MODE_NAME[settings.gameMode]}. It decides what you can buy (Loot, Items to collect, Hideout,
        Keys) and ticks off &ldquo;reach loyalty level&rdquo; quest steps.
      </p>
      {listed.length ? (
        <ul className="loyalty-cards">
          {listed.map((t) => {
            const level = levels[t.id] ?? 1
            return (
              <li key={t.id} className="loyalty-card">
                <TraderPortrait name={t.name} src={t.imageLink} />
                <div>
                  <strong>{t.name}</strong>
                  <Choice
                    label={`${t.name} loyalty level`}
                    value={level}
                    options={t.choices.map((l) => [l, `LL${l}`, `Loyalty level ${l}`] as const)}
                    onChange={(l) => void setTraderLevel(t.id, l)}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="hint">Loading the traders…</p>
      )}
    </section>
  )
}

/** "Any", "30 min", "2 h". */
const minutesLabel = (minutes: number): string =>
  minutes === 0 ? 'Any' : minutes < 60 ? `${minutes} min` : `${minutes / 60} h`

/** The Hideout tab's crafts for profit: how long they have to take at least. */
export function CraftingSettingsSection({ settings }: { settings: PublicSettings }): React.JSX.Element {
  const updateSettings = useStore((s) => s.updateSettings)
  const c = settings.crafting
  return (
    <section id="settings-crafting">
      <h3>Hideout crafting</h3>
      <span className="toggle-label">Profit crafts at least</span>
      <Choice
        label="Profit crafts at least"
        value={c.minProfitMinutes}
        options={MIN_PROFIT_MINUTES.map((m) => [m, minutesLabel(m)] as const)}
        onChange={(minProfitMinutes) => void updateSettings({ crafting: { ...c, minProfitMinutes } })}
      />
      <p className="hint">
        The Hideout tab picks crafts for profit only from ones that take at least this long, so a station
        isn&rsquo;t left waiting on you every few minutes. They&rsquo;re crafted next only when nothing your
        upgrades and quests need can be made there.
      </p>
      <label className="check" title="Started on a craft times it; when it's done, Windows says so">
        <input
          type="checkbox"
          checked={c.notifyDone}
          onChange={(e) => void updateSettings({ crafting: { ...c, notifyDone: e.target.checked } })}
        />
        Notify me when crafts are done
      </label>
      <p className="hint">
        <em>Started</em> times the craft (at its usual time; skills and bonuses can make it quicker), and a
        Windows notification says when it&rsquo;s done, from the tray too with background recording on.
      </p>
    </section>
  )
}

/** How flea trends are read: the day's parts and how far back. */
export function TrendSettingsSection({ settings }: { settings: PublicSettings }): React.JSX.Element {
  const updateSettings = useStore((s) => s.updateSettings)
  const t = settings.trends
  const set = (patch: Partial<TrendSettings>): void => void updateSettings({ trends: { ...t, ...patch } })
  return (
    <section id="settings-trends">
      <h3>Flea trends</h3>
      <span className="toggle-label">Split the day into</span>
      <Choice
        label="Split the day into"
        value={t.intervalHours}
        options={TREND_INTERVALS.map((hours) => [hours, `${hours} h`] as const)}
        onChange={(intervalHours) => set({ intervalHours })}
      />
      <p className="hint">
        {24 / t.intervalHours} parts of {t.intervalHours} hours. Shorter parts are more precise; longer ones
        are steadier. tarkov.dev checks prices about every 2 hours.
      </p>
      <span className="toggle-label">Look back</span>
      <Choice
        label="Look back"
        value={t.days}
        options={([7, 14, 30] as const).map((days) => [days, `${days} days`] as const)}
        onChange={(days) => set({ days })}
      />
    </section>
  )
}
