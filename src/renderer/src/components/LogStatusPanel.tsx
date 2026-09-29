import { formatAgo } from '../lib/format'
import { useNow } from '../lib/useNow'
import { useStore } from '../store'

/** Where the game's logs are read from, how far along reading is, and the controls for it. */
export default function LogStatusPanel(): React.JSX.Element {
  const status = useStore((s) => s.logStatus)
  const chooseLogsFolder = useStore((s) => s.chooseLogsFolder)
  const rescanLogs = useStore((s) => s.rescanLogs)
  const now = useNow(30_000)

  let text: string
  if (!status || status.state === 'idle') text = 'Looking for the game’s logs…'
  else if (status.state === 'not-found')
    text =
      'Couldn’t find the game’s Logs folder. Choose it: it’s in the game’s install folder (or its build folder).'
  else if (status.state === 'error') text = `Couldn’t read the logs: ${status.error}`
  else if (status.state === 'scanning')
    text = `Reading old sessions: ${status.foldersRead} of ${status.folders}…`
  else
    text =
      `Reading ${status.folders} session${status.folders === 1 ? '' : 's'}: ${status.events.quests} quest updates, ` +
      `${status.events.raids} raids, ${status.events.flea} flea sales` +
      (status.lastEventAt ? `. Latest ${formatAgo(status.lastEventAt, now)}.` : '.')

  return (
    <section>
      <h2>Game logs</h2>
      <p className={`hint ${status?.state === 'error' || status?.state === 'not-found' ? 'error' : ''}`}>
        {text}
      </p>
      {status?.logsDir && (
        <p className="hint path" title={status.logsDir}>
          {status.logsDir}
        </p>
      )}
      <p className="hint">
        The game only writes its logs between raids, so updates appear after you get back to the menu.
      </p>
      <div className="button-row">
        <button className="button small" onClick={() => void chooseLogsFolder()}>
          Choose folder
        </button>
        <button
          className="button small"
          onClick={() => void rescanLogs()}
          disabled={!status?.logsDir || status.state === 'scanning'}
          title="Forget what was read and read every session again (quests you ticked by hand stay)"
        >
          Read all again
        </button>
      </div>
    </section>
  )
}
