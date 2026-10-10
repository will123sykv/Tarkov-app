import { dataModeFor } from '../../../shared/gameModes'
import { EMPTY_HIDEOUT } from '../../../shared/hideout'
import { TREND_INTERVALS } from '../../../shared/settings'
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
        For {MODE_NAME[settings.gameMode]}. It decides what you can buy (Loot, Items to collect, Keys) and
        ticks off &ldquo;reach loyalty level&rdquo; quest steps.
      </p>
      {listed.length ? (
        <ul className="station-levels loyalty-levels">
          {listed.map((t) => (
            <li key={t.id}>
              {t.imageLink ? (
                <img className="station-icon" src={t.imageLink} alt="" loading="lazy" />
              ) : (
                <span className="station-icon" aria-hidden>
                  {t.name.slice(0, 2)}
                </span>
              )}
              <span className="station-name">{t.name}</span>
              <select
                value={levels[t.id] ?? 1}
                aria-label={`${t.name} loyalty level`}
                onChange={(e) => void setTraderLevel(t.id, Number(e.target.value))}
              >
                {t.choices.map((level) => (
                  <option key={level} value={level}>
                    LL{level}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Loading the traders…</p>
      )}
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
