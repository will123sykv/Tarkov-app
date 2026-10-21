import type { PublicSettings, QuestKindFilter } from '../../../shared/types'
import { useStore } from '../store'

const KINDS: readonly (readonly [QuestKindFilter, string, string])[] = [
  ['all', 'All', 'Every quest'],
  ['story', 'Story', 'The main story’s chapters (Tour, Falling Skies…)'],
  ['side', 'Side', 'Traders’ quests, event quests too']
]

/**
 * All · Story · Side on each quest page (since 1.61.0): one setting, so the Quests, To do, Maps and
 * Weapons tabs all show the same quests.
 */
export default function QuestKindSwitch({ settings }: { settings: PublicSettings }): React.JSX.Element {
  const updateSettings = useStore((s) => s.updateSettings)
  const kind = settings.quests.kind
  return (
    <div className="segmented small quest-kind" role="radiogroup" aria-label="Which quests">
      {KINDS.map(([id, text, title]) => (
        <button
          key={id}
          role="radio"
          aria-checked={kind === id}
          className={kind === id ? 'active' : ''}
          title={title}
          onClick={() => void updateSettings({ quests: { ...settings.quests, kind: id } })}
        >
          {text}
        </button>
      ))}
    </div>
  )
}
