import type { PublicSettings } from '../../../shared/types'
import { useStore } from '../store'

/** Keep refreshing (and recording flea prices) in the tray, optionally from Windows start-up. */
export default function BackgroundToggles({ settings }: { settings: PublicSettings }): React.JSX.Element {
  const updateSettings = useStore((s) => s.updateSettings)
  return (
    <>
      <label className="check">
        <input
          type="checkbox"
          checked={settings.backgroundRecording}
          onChange={(e) => void updateSettings({ backgroundRecording: e.target.checked })}
        />
        Keep running in the system tray when the window is closed
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={settings.startWithWindows}
          disabled={!settings.backgroundRecording}
          onChange={(e) => void updateSettings({ startWithWindows: e.target.checked })}
        />
        Start with Windows (in the tray)
      </label>
    </>
  )
}
