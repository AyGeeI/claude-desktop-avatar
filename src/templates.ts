// Avatar-Vorlagen: laden, prüfen, Parameter einsetzen und zeichnen – als
// Pixelfeld (für Terminal-Raster und das Desktop-Fenster) und als SVG (für
// die Seitenleiste der Desktop-App). Format: docs/avatar-templates.md.

import type { AvatarMood } from '../types'
import type { Lang } from './i18n'
import type { Io } from './io'
import { base64, clamp, isRecord, joinPath, safeJson } from './util'

export type PaletteEntry = string | { param: string; shade?: number }

export type PixelStateSpec = { frames: string[]; fps?: number }

export type PixelSpec = {
  width: number
  height: number
  palette: Record<string, PaletteEntry>
  frames: Record<string, string[]>
  states: Record<string, PixelStateSpec>
  overlays?: Record<string, Record<string, string[]>>
  mouth?: Partial<Record<MouthShape, string>>
  effects?: {
    scanlines?: boolean
    flicker?: boolean
    glitch?: string[]
    dim?: string[]
    glow?: PaletteEntry
  }
}

export type MouthShape = 'closed' | 'half' | 'open' | 'round'

export type ParamSpec = {
  type: 'color' | 'choice' | 'toggle' | 'range'
  label?: Record<string, string>
  default: string | boolean | number
  palette?: string[]
  options?: Array<{ id: string; label?: Record<string, string> }>
  min?: number
  max?: number
  step?: number
}

export type TemplateManifest = {
  formatVersion: number
  id: string
  version: string
  name: Record<string, string>
  description?: Record<string, string>
  author: string
  license: string
  parameters?: Record<string, ParamSpec>
  states: Record<string, { once?: boolean; duration?: number; fallback?: string }>
  pixel: { file: string }
  svg?: { file: string; width?: number; height?: number }
  sounds?: Record<string, string>
  voice?: Record<string, string>
  persona?: { displayName?: Record<string, string>; greeting?: Record<string, string>; style?: string }
}

export type LoadedTemplate = {
  dir: string
  manifest: TemplateManifest
  pixel: PixelSpec
  svgSource?: string
}

export type TemplateEntry = { id: string; name: Record<string, string>; dir: string; isBuiltIn: boolean }

export const MOODS: readonly AvatarMood[] = ['idle', 'thinking', 'working', 'speaking', 'attention', 'success', 'error', 'sleeping']

// ---------------------------------------------------------------- Laden

export async function listTemplates(io: Io, builtInDir: string, userDir: string): Promise<TemplateEntry[]> {
  const out: TemplateEntry[] = []
  for (const [root, isBuiltIn] of [
    [userDir, false],
    [builtInDir, true],
  ] as const) {
    const entries = await io.list(root).catch(() => [])
    for (const entry of entries) {
      if (entry.kind !== 'dir') continue
      const dir = joinPath(root, entry.name)
      const manifest = safeJson<TemplateManifest>(await io.read(joinPath(dir, 'avatar.json')).catch(() => undefined))
      if (!manifest || typeof manifest.id !== 'string') continue
      if (out.some(one => one.id === manifest.id)) continue
      out.push({ id: manifest.id, name: isRecord(manifest.name) ? manifest.name : { de: manifest.id }, dir, isBuiltIn })
    }
  }
  return out
}

export async function loadTemplate(io: Io, dir: string): Promise<LoadedTemplate> {
  const manifest = safeJson<TemplateManifest>(await io.read(joinPath(dir, 'avatar.json')))
  if (!manifest) throw new Error(`avatar.json in ${dir} ist kein gültiges JSON`)
  const problems = validateManifest(manifest)
  if (problems.length > 0) throw new Error(`Vorlage ${manifest.id ?? dir}: ${problems.join('; ')}`)
  const pixel = safeJson<PixelSpec>(await io.read(joinPath(dir, manifest.pixel.file)))
  if (!pixel) throw new Error(`${manifest.pixel.file} in ${dir} ist kein gültiges JSON`)
  const pixelProblems = validatePixel(pixel)
  if (pixelProblems.length > 0) throw new Error(`Vorlage ${manifest.id}: ${pixelProblems.join('; ')}`)
  let svgSource: string | undefined
  if (manifest.svg?.file) {
    const source = await io.read(joinPath(dir, manifest.svg.file)).catch(() => undefined)
    if (source && validateSvg(source).length === 0) svgSource = source
  }
  return { dir, manifest, pixel, svgSource }
}

// ---------------------------------------------------------------- Prüfen

export function validateManifest(manifest: TemplateManifest): string[] {
  const problems: string[] = []
  if (manifest.formatVersion !== 1) problems.push('formatVersion muss 1 sein')
  if (typeof manifest.id !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/.test(manifest.id)) problems.push('id fehlt oder ist ungültig')
  if (!isRecord(manifest.name)) problems.push('name fehlt')
  if (!isRecord(manifest.states) || !manifest.states['idle']) problems.push('states braucht mindestens idle')
  if (!manifest.pixel || typeof manifest.pixel.file !== 'string') problems.push('pixel.file fehlt')
  for (const [state, spec] of Object.entries(manifest.states ?? {})) {
    const seen = new Set<string>([state])
    let next = spec.fallback
    while (next) {
      if (seen.has(next)) {
        problems.push(`Fallback-Kreis bei ${state}`)
        break
      }
      seen.add(next)
      next = manifest.states[next]?.fallback
    }
  }
  return problems
}

export function validatePixel(pixel: PixelSpec): string[] {
  const problems: string[] = []
  if (!Number.isInteger(pixel.width) || !Number.isInteger(pixel.height) || pixel.width < 4 || pixel.height < 4 || pixel.width > 128 || pixel.height > 128) {
    problems.push('width/height müssen zwischen 4 und 128 liegen')
    return problems
  }
  const keys = new Set(Object.keys(pixel.palette ?? {}))
  for (const [name, rows] of Object.entries(pixel.frames ?? {})) {
    if (!Array.isArray(rows) || rows.length !== pixel.height) {
      problems.push(`Frame ${name}: ${pixel.height} Zeilen erwartet`)
      continue
    }
    rows.forEach((row, y) => {
      if ([...row].length !== pixel.width) problems.push(`Frame ${name}, Zeile ${y + 1}: ${pixel.width} Zeichen erwartet`)
      for (const ch of row) if (!keys.has(ch)) problems.push(`Frame ${name}: unbekanntes Palettenzeichen „${ch}“`)
    })
  }
  for (const [state, spec] of Object.entries(pixel.states ?? {})) {
    for (const frame of spec.frames ?? []) if (!pixel.frames[frame]) problems.push(`Zustand ${state}: Frame ${frame} fehlt`)
  }
  if (!pixel.states?.['idle']) problems.push('pixel.states braucht idle')
  return [...new Set(problems)].slice(0, 12)
}

export function validateSvg(source: string): string[] {
  const problems: string[] = []
  if (source.length > 120_000) problems.push('SVG ist größer als 120.000 Zeichen')
  if (/<script\b/i.test(source)) problems.push('<script> ist nicht erlaubt')
  if (/<foreignObject\b/i.test(source)) problems.push('<foreignObject> ist nicht erlaubt')
  if (/\son[a-z]+\s*=/i.test(source)) problems.push('Event-Attribute sind nicht erlaubt')
  if (/javascript:/i.test(source)) problems.push('javascript:-Verweise sind nicht erlaubt')
  if (/(href|src)\s*=\s*["']\s*(https?:|\/\/)/i.test(source) || /url\(\s*["']?\s*(https?:|\/\/)/i.test(source)) problems.push('externe Verweise sind nicht erlaubt')
  if (!/<svg\b/i.test(source)) problems.push('kein <svg>-Element')
  return problems
}

// ---------------------------------------------------------------- Parameter & Farben

export function resolveParams(manifest: TemplateManifest, params: Record<string, string | boolean | number>): Record<string, string | boolean | number> {
  const out: Record<string, string | boolean | number> = {}
  for (const [key, spec] of Object.entries(manifest.parameters ?? {})) {
    const value = params[key]
    if (spec.type === 'color') out[key] = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : String(spec.default)
    else if (spec.type === 'toggle') out[key] = typeof value === 'boolean' ? value : Boolean(spec.default)
    else if (spec.type === 'choice') out[key] = typeof value === 'string' && spec.options?.some(o => o.id === value) ? value : String(spec.default)
    else out[key] = typeof value === 'number' ? clamp(value, spec.min ?? 0, spec.max ?? 1) : Number(spec.default)
  }
  return out
}

/** `#RRGGBB` oder `#RRGGBBAA` → 0xAARRGGBB; `transparent` → 0. */
export function parseColor(value: string): number {
  if (value === 'transparent') return 0
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value)
  if (!hex) return 0
  const rgb = parseInt(hex[1]!, 16)
  const alpha = hex[2] ? parseInt(hex[2], 16) : 255
  return ((alpha << 24) | rgb) >>> 0
}

export function shadeColor(argb: number, shade: number): number {
  const a = (argb >>> 24) & 255
  let r = (argb >>> 16) & 255
  let g = (argb >>> 8) & 255
  let b = argb & 255
  const s = clamp(shade, -1, 1)
  const target = s >= 0 ? 255 : 0
  const f = Math.abs(s)
  r = Math.round(r + (target - r) * f)
  g = Math.round(g + (target - g) * f)
  b = Math.round(b + (target - b) * f)
  return ((a << 24) | (r << 16) | (g << 8) | b) >>> 0
}

export function paletteColors(pixel: PixelSpec, params: Record<string, string | boolean | number>): Map<string, number> {
  const out = new Map<string, number>()
  for (const [ch, entry] of Object.entries(pixel.palette)) out.set(ch, entryColor(entry, params))
  return out
}

export function entryColor(entry: PaletteEntry, params: Record<string, string | boolean | number>): number {
  if (typeof entry === 'string') return parseColor(entry)
  const value = params[entry.param]
  const base = parseColor(typeof value === 'string' ? value : '#ffffff')
  return entry.shade ? shadeColor(base, entry.shade) : base
}

export function colorHex(argb: number): string {
  return '#' + (argb & 0xffffff).toString(16).padStart(6, '0')
}

// ---------------------------------------------------------------- Zustände & Frames

export function stateFor(template: LoadedTemplate, mood: AvatarMood): string {
  let state: string | undefined = mood
  const seen = new Set<string>()
  while (state && !seen.has(state)) {
    if (template.pixel.states[state]) return state
    seen.add(state)
    state = template.manifest.states[state]?.fallback
  }
  return 'idle'
}

export function framesOf(template: LoadedTemplate, state: string): string[] {
  const spec = template.pixel.states[state] ?? template.pixel.states['idle']
  return spec?.frames?.length ? spec.frames : Object.keys(template.pixel.frames).slice(0, 1)
}

export function fpsOf(template: LoadedTemplate, state: string): number {
  const spec = template.pixel.states[state] ?? template.pixel.states['idle']
  return clamp(spec?.fps ?? 4, 1, 12)
}

export function overlayFrames(template: LoadedTemplate, params: Record<string, string | boolean | number>): string[] {
  const out: string[] = []
  for (const [param, byValue] of Object.entries(template.pixel.overlays ?? {})) {
    const value = params[param]
    const key = typeof value === 'boolean' ? String(value) : String(value ?? '')
    for (const frame of byValue[key] ?? []) if (template.pixel.frames[frame]) out.push(frame)
  }
  return out
}

/** Setzt einen Frame samt Overlays zu ARGB-Pixeln zusammen (Zeile für Zeile). */
export function composeFrame(template: LoadedTemplate, colors: Map<string, number>, frames: readonly string[]): Uint32Array {
  const { width, height } = template.pixel
  const out = new Uint32Array(width * height)
  for (const name of frames) {
    const rows = template.pixel.frames[name]
    if (!rows) continue
    for (let y = 0; y < height; y++) {
      const chars = [...(rows[y] ?? '')]
      for (let x = 0; x < width; x++) {
        const color = colors.get(chars[x] ?? '.') ?? 0
        if ((color >>> 24) === 0) continue
        out[y * width + x] = color
      }
    }
  }
  return out
}

/** Leichter Glitch: verschiebt einige Zeilenbänder seitlich. `seed` macht ihn wiederholbar. */
export function glitch(pixels: Uint32Array, width: number, height: number, seed: number): Uint32Array {
  const out = new Uint32Array(pixels)
  let s = seed >>> 0 || 1
  const rand = () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
  const bands = 2 + Math.floor(rand() * 3)
  for (let b = 0; b < bands; b++) {
    const y0 = Math.floor(rand() * height)
    const h = 1 + Math.floor(rand() * 3)
    const shift = (rand() < 0.5 ? -1 : 1) * (1 + Math.floor(rand() * 2))
    for (let y = y0; y < Math.min(height, y0 + h); y++) {
      for (let x = 0; x < width; x++) {
        const from = x - shift
        out[y * width + x] = from >= 0 && from < width ? pixels[y * width + from]! : 0
      }
    }
  }
  return out
}

// ---------------------------------------------------------------- Terminal-Raster

/**
 * Halbblock-Raster: jede Zelle zeigt zwei Pixel übereinander (▀ oben in der
 * Vordergrundfarbe, unten in der Hintergrundfarbe). Ergebnis: die `cells`
 * eines `Raster` (Base64 aus u32-Tripeln Zeichen, Vordergrund, Hintergrund).
 */
export function rasterCells(pixels: Uint32Array, width: number, height: number): { cells: string; columns: number; rows: number } {
  const rows = Math.ceil(height / 2)
  const words = new Uint32Array(width * rows * 3)
  const DEFAULT = 0x01000000
  const visible = (argb: number) => (argb >>> 24) >= 96
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < width; x++) {
      const top = pixels[2 * r * width + x] ?? 0
      const bottom = 2 * r + 1 < height ? pixels[(2 * r + 1) * width + x] ?? 0 : 0
      const i = (r * width + x) * 3
      if (visible(top) && visible(bottom)) {
        words[i] = 0x2580
        words[i + 1] = top & 0xffffff
        words[i + 2] = bottom & 0xffffff
      } else if (visible(top)) {
        words[i] = 0x2580
        words[i + 1] = top & 0xffffff
        words[i + 2] = DEFAULT
      } else if (visible(bottom)) {
        words[i] = 0x2584
        words[i + 1] = bottom & 0xffffff
        words[i + 2] = DEFAULT
      } else {
        words[i] = 0x20
        words[i + 1] = DEFAULT
        words[i + 2] = DEFAULT
      }
    }
  }
  return { cells: base64(new Uint8Array(words.buffer)), columns: width, rows }
}

// ---------------------------------------------------------------- SVG

function framePaths(pixels: Uint32Array, width: number, height: number): string {
  const runs = new Map<number, string[]>()
  for (let y = 0; y < height; y++) {
    let x = 0
    while (x < width) {
      const color = pixels[y * width + x] ?? 0
      if ((color >>> 24) === 0) {
        x++
        continue
      }
      let end = x + 1
      while (end < width && pixels[y * width + end] === color) end++
      const list = runs.get(color) ?? []
      list.push(`M${x} ${y}h${end - x}v1h-${end - x}z`)
      runs.set(color, list)
      x = end
    }
  }
  let out = ''
  for (const [color, list] of runs) {
    const alpha = (color >>> 24) / 255
    const opacity = alpha < 0.99 ? ` fill-opacity="${alpha.toFixed(2)}"` : ''
    out += `<path fill="${colorHex(color)}"${opacity} d="${list.join('')}"/>`
  }
  return out
}

/**
 * SVG für die Seitenleiste: alle Frames des Zustands übereinander, per
 * CSS-Animation nacheinander sichtbar; dazu Leuchten, Flackern und Glitch.
 */
export function pixelSvg(
  template: LoadedTemplate,
  params: Record<string, string | boolean | number>,
  mood: AvatarMood,
  options: { size: number; motion: boolean },
): string {
  const { width, height } = template.pixel
  const colors = paletteColors(template.pixel, params)
  const state = stateFor(template, mood)
  const names = framesOf(template, state)
  const overlays = overlayFrames(template, params)
  const fps = fpsOf(template, state)
  const count = names.length
  const period = count / fps
  const glow = template.pixel.effects?.glow ? colorHex(entryColor(template.pixel.effects.glow, params)) : undefined
  const isGlitch = (template.pixel.effects?.glitch ?? []).includes(state)
  const isDim = (template.pixel.effects?.dim ?? []).includes(state)
  const flicker = template.pixel.effects?.flicker !== false

  let groups = ''
  names.forEach((name, i) => {
    const pixels = composeFrame(template, colors, [name, ...overlays])
    const cls = count > 1 && options.motion ? ` class="f" style="animation-delay:${((i * period) / count).toFixed(3)}s"` : count > 1 ? (i === 0 ? '' : ' style="display:none"') : ''
    groups += `<g${cls}>${framePaths(pixels, width, height)}</g>`
  })

  const share = (100 / count).toFixed(3)
  const css = [
    count > 1 && options.motion ? `.f{opacity:0;animation:cda-cycle ${period.toFixed(3)}s steps(1,end) infinite}@keyframes cda-cycle{0%{opacity:1}${share}%{opacity:0}100%{opacity:0}}` : '',
    glow ? `.fig{filter:drop-shadow(0 0 1.4px ${glow}) drop-shadow(0 0 3px ${glow}66)}` : '',
    flicker && options.motion ? '.fig{animation:cda-flicker 5s infinite}@keyframes cda-flicker{0%,92%,100%{opacity:1}93%{opacity:.72}94%{opacity:1}96%{opacity:.86}}' : '',
    isGlitch && options.motion ? '.glitch{animation:cda-glitch .5s steps(2,end) infinite}@keyframes cda-glitch{0%{transform:translate(0,0)}25%{transform:translate(-1px,0)}50%{transform:translate(1px,0)}75%{transform:translate(0,1px)}}' : '',
    isDim ? '.fig{opacity:.62}' : '',
    '@media (prefers-reduced-motion:reduce){.f,.fig,.glitch{animation:none!important}.f:first-child{opacity:1}}',
  ].join('')

  const px = options.size / Math.max(width, height)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${width + 4} ${height + 4}" width="${Math.round((width + 4) * px)}" height="${Math.round((height + 4) * px)}" shape-rendering="crispEdges">` +
    `<style>${css}</style>` +
    `<g class="fig"><g class="${isGlitch ? 'glitch' : ''}">${groups}</g></g></svg>`
  )
}

/** Setzt Klassen und CSS-Variablen in das Wurzelelement einer Vorlagen-SVG (Format v1, Abschnitt 7). */
export function injectSvg(source: string, manifest: TemplateManifest, params: Record<string, string | boolean | number>, state: string, motion: boolean): string {
  const classes = ['avatar', `state-${state}`]
  const vars: string[] = []
  for (const [key, spec] of Object.entries(manifest.parameters ?? {})) {
    const value = params[key]
    if (spec.type === 'choice') classes.push(`p-${key}-${String(value)}`)
    else if (spec.type === 'toggle' && value === true) classes.push(`p-${key}`)
    else if (spec.type === 'color' || spec.type === 'range') vars.push(`--p-${key}:${String(value)}`)
  }
  if (!motion) classes.push('reduced-motion')
  return source.replace(/<svg\b([^>]*)>/i, (_all, attrs: string) => {
    const cleaned = attrs.replace(/\s(class|style)\s*=\s*"[^"]*"/gi, '')
    return `<svg${cleaned} class="${classes.join(' ')}" style="${vars.join(';')}">`
  })
}

export function templateName(entry: { name: Record<string, string> }, lang: Lang): string {
  return entry.name[lang] ?? entry.name['en'] ?? entry.name['de'] ?? Object.values(entry.name)[0] ?? '?'
}
