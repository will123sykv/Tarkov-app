import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** Read and parse a JSON file. Returns undefined when it is missing or unreadable. */
export async function readJsonFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return undefined
  }
}

// Writes to the same file wait for the one before, so the last one asked for is the one kept (and two in
// the same millisecond don't share a temp file).
const writing = new Map<string, Promise<void>>()
let count = 0

/** Write JSON via a temp file + rename so a crash mid-write never leaves a truncated file. */
export function writeJsonFileAtomic(path: string, data: unknown): Promise<void> {
  const json = JSON.stringify(data)
  const before = writing.get(path) ?? Promise.resolve()
  const done = before.catch(() => undefined).then(() => write(path, json))
  writing.set(path, done)
  void done
    .finally(() => {
      if (writing.get(path) === done) writing.delete(path)
    })
    .catch(() => undefined)
  return done
}

async function write(path: string, json: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.${++count}.tmp`
  await writeFile(tmp, json, 'utf8')
  try {
    await rename(tmp, path)
  } catch (err) {
    // Windows can refuse the rename while another process (e.g. antivirus) holds the target.
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY') throw err
    await writeFile(path, json, 'utf8')
    await rm(tmp, { force: true })
  }
}
