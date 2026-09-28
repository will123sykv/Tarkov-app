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

/** Write JSON via a temp file + rename so a crash mid-write never leaves a truncated file. */
export async function writeJsonFileAtomic(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const json = JSON.stringify(data)
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
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
