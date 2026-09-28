import credits from '../assets/containers/credits.json'

export interface ContainerImage {
  url: string
  /** Wiki page the picture came from, for attribution. */
  pageUrl: string
  license: string
}

// Bundled by Vite, so the pictures work offline. Filled by `npm run data:container-images`.
const files = import.meta.glob('../assets/containers/*.{jpg,jpeg,png,webp}', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

const images = new Map<string, ContainerImage>()
for (const credit of credits as { id: string; file: string; pageUrl: string; license: string }[]) {
  const url = files[`../assets/containers/${credit.file}`]
  if (url) images.set(credit.id, { url, pageUrl: credit.pageUrl, license: credit.license })
}

export function containerImage(containerId: string): ContainerImage | null {
  return images.get(containerId) ?? null
}
