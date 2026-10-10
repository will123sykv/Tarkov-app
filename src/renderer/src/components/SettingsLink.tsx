import { useStore } from '../store'

/** Settings' sections a page can link to. */
export type SettingsSection = 'quests' | 'wiki' | 'loyalty' | 'trends' | 'logs'

/** A link that opens Settings at one of its sections (where a page's global setting is changed). */
export default function SettingsLink({
  section,
  children = 'Settings'
}: {
  section: SettingsSection
  children?: React.ReactNode
}): React.JSX.Element {
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  return (
    <button className="link small" onClick={() => setSettingsOpen(true, section)}>
      {children}
    </button>
  )
}
