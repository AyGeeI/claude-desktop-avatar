// Einstellungen: die Optionen aus der Installation (`userConfig`), darüber
// die Änderungen, die man per Befehl oder in der Seitenleiste vornimmt
// (`$.store`, gilt für alle Sitzungen).

import type { PluginOptions } from 'claude-code'
import type { Io } from './io'
import { isPersonaStyle, type PersonaStyle } from './persona'
import { clamp, isRecord } from './util'

export type Verbosity = 'quiet' | 'normal' | 'chatty'
export type LanguageSetting = 'auto' | 'de' | 'en'

export type Settings = {
  name: string
  language: LanguageSetting
  verbosity: Verbosity
  speech: boolean
  voiceMode: boolean
  desktop: boolean
  voiceDe: string
  voiceEn: string
  quietHours: string
  hotkey: string
  notifications: boolean
  templateId: string
  params: Record<string, string | boolean | number>
  scale: number
  style: PersonaStyle | ''
  ghost: boolean
}

export const DEFAULT_TEMPLATE = 'cda.vela'
const STORE_KEY = 'overrides'

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

export function fromOptions(options: PluginOptions): Settings {
  return {
    name: asString(options['name'], 'Vela').trim() || 'Vela',
    language: oneOf(options['language'], ['auto', 'de', 'en'] as const, 'auto'),
    verbosity: oneOf(options['verbosity'], ['quiet', 'normal', 'chatty'] as const, 'normal'),
    speech: asBool(options['speech'], true),
    voiceMode: asBool(options['voiceMode'], false),
    desktop: asBool(options['desktop'], true),
    voiceDe: asString(options['voiceDe'], ''),
    voiceEn: asString(options['voiceEn'], ''),
    quietHours: asString(options['quietHours'], ''),
    hotkey: asString(options['hotkey'], 'Ctrl+Alt+Space') || 'Ctrl+Alt+Space',
    notifications: asBool(options['notifications'], true),
    templateId: DEFAULT_TEMPLATE,
    params: {},
    scale: 4,
    style: '',
    ghost: false,
  }
}

/** Legt die gespeicherten Änderungen über die Optionen; unbekannte Werte fallen weg. */
export function applyOverrides(base: Settings, raw: unknown): Settings {
  if (!isRecord(raw)) return base
  const params = isRecord(raw['params']) ? (raw['params'] as Record<string, string | boolean | number>) : base.params
  return {
    ...base,
    name: typeof raw['name'] === 'string' && raw['name'].trim() ? raw['name'].trim() : base.name,
    language: oneOf(raw['language'], ['auto', 'de', 'en'] as const, base.language),
    verbosity: oneOf(raw['verbosity'], ['quiet', 'normal', 'chatty'] as const, base.verbosity),
    speech: asBool(raw['speech'], base.speech),
    voiceMode: asBool(raw['voiceMode'], base.voiceMode),
    desktop: asBool(raw['desktop'], base.desktop),
    voiceDe: asString(raw['voiceDe'], base.voiceDe),
    voiceEn: asString(raw['voiceEn'], base.voiceEn),
    templateId: asString(raw['templateId'], base.templateId) || base.templateId,
    params,
    scale: typeof raw['scale'] === 'number' ? clamp(Math.round(raw['scale']), 2, 8) : base.scale,
    style: isPersonaStyle(raw['style']) ? raw['style'] : base.style,
    ghost: asBool(raw['ghost'], base.ghost),
  }
}

export async function loadSettings(io: Io, options: PluginOptions): Promise<Settings> {
  const raw = await io.storeGet(STORE_KEY).catch(() => undefined)
  return applyOverrides(fromOptions(options), raw)
}

export async function saveOverride(io: Io, patch: Partial<Settings>): Promise<void> {
  const raw = await io.storeGet(STORE_KEY).catch(() => undefined)
  const current = isRecord(raw) ? raw : {}
  await io.storeSet(STORE_KEY, { ...current, ...patch })
}

/** `22-7` → Ruhe von 22 bis 7 Uhr. Leer oder ungültig: nie. */
export function inQuietHours(spec: string, date: Date): boolean {
  const match = /^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/.exec(spec)
  if (!match) return false
  const from = Number(match[1])
  const to = Number(match[2])
  if (from > 23 || to > 24 || from === to) return false
  const hour = date.getHours()
  return from < to ? hour >= from && hour < to : hour >= from || hour < to
}

export function nextVerbosity(current: Verbosity, direction: 1 | -1): Verbosity {
  const order: Verbosity[] = ['quiet', 'normal', 'chatty']
  const index = clamp(order.indexOf(current) + direction, 0, order.length - 1)
  return order[index] ?? current
}
