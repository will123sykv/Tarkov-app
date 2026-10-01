/** A label to read: an item's short name or its stack count, as a binary PGM image. */
export interface OcrJob {
  kind: 'name' | 'count'
  image: Uint8Array
}

export interface OcrResult {
  text: string
  /** Tesseract's confidence, 0–100. */
  confidence: number
}

/** A screenshot file read by the main process. */
export interface ScreenshotFile {
  name: string
  /** Last modified, ms since the epoch. */
  modified: number
  data: Uint8Array
}

/** Most labels one scan sends (a full stash is under 700 items). */
export const MAX_OCR_JOBS = 2000
/** Largest label image accepted (a label is a few kilobytes). */
export const MAX_OCR_IMAGE_BYTES = 512 * 1024
/** Largest screenshot read from disk. */
export const MAX_SCREENSHOT_BYTES = 40 * 1024 * 1024
