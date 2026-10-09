import { friendlyError } from '../lib/errors'
import { useStore } from '../store'

/** "Couldn't load quests: no internet connection. Retry" for the quest and map data. */
export default function LoadError({ what, error }: { what: string; error: string }): React.JSX.Element {
  const loadQuestData = useStore((s) => s.loadQuestData)
  return (
    <>
      Couldn&rsquo;t load {what}: {friendlyError(error)}.{' '}
      <button className="link" onClick={() => void loadQuestData(true)}>
        Retry
      </button>
    </>
  )
}
