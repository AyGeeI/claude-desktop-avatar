// Kleine Hilfsfunktionen ohne Abhängigkeiten. Die Mod läuft ohne DOM und
// ohne Node, deshalb gibt es hier eigene Varianten für Pfade und Base64.

export function joinPath(base: string, ...parts: string[]): string {
  const sep = base.includes('\\') ? '\\' : '/'
  let out = base.replace(/[\\/]+$/, '')
  for (const part of parts) {
    const clean = part.replace(/^[\\/]+|[\\/]+$/g, '').replace(/[\\/]+/g, sep)
    if (clean) out += sep + clean
  }
  return out
}

export function baseName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return cut >= 0 ? trimmed.slice(cut + 1) : trimmed
}

export function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  return flat.slice(0, Math.max(0, max - 1)).trimEnd() + '…'
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function safeJson<T>(text: string | undefined): T | undefined {
  if (!text) return undefined
  try {
    return JSON.parse(text) as T
  } catch {
    return undefined
  }
}

export function pickOne<T>(list: readonly T[]): T | undefined {
  if (list.length === 0) return undefined
  return list[Math.floor(Math.random() * list.length)]
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return truncate(url, 40)
  }
}

/** `webshop-api` → `Webshop API`: Projektnamen, die sich vorlesen lassen. */
export function speakableProject(name: string): string {
  return name
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map(word => (word.length <= 3 ? word.toUpperCase() : word[0]!.toUpperCase() + word.slice(1)))
    .join(' ')
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standard-Base64 mit Auffüllung, ohne `btoa` oder Node-Puffer. */
export function base64(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i]! << 16
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + '=='
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + '='
  }
  return out
}

/** Entfernt Markdown grob, damit ein Text gut vorlesbar wird. */
export function plainSpeech(markdown: string): string {
  const withoutCode = markdown.split(/```/)[0] ?? markdown
  return withoutCode
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Der vorlesbare Einstieg einer Antwort: erster Absatz, höchstens `max` Zeichen, an einer Satzgrenze. */
export function speakableIntro(answer: string, max = 300): string {
  const firstBlock = answer.split(/\n\s*\n/).find(block => plainSpeech(block).length > 0) ?? ''
  const plain = plainSpeech(firstBlock)
  if (plain.length <= max) return plain
  const cut = plain.slice(0, max)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  return end > 40 ? cut.slice(0, end + 1) : cut.trimEnd() + '…'
}
