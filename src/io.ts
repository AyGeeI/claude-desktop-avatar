// Die Verbindung der Logik zur Engine. Die Mod-Schnittstelle verlangt, dass
// `$` nie weitergereicht wird; deshalb baut der Hook `session.start` dieses
// Objekt aus Funktionen, die `$` jeweils direkt aufrufen (hooks/register.tsx).

import type { EngineInterface } from 'claude-code'
import type { AvatarView } from '../types'

type E = EngineInterface

export type Timer = ReturnType<E['clock']['every']>
export type FsEntries = Awaited<ReturnType<E['fs']['list']>>
export type SpawnRequest = Parameters<E['process']['spawn']>[0]
export type SpawnStream = ReturnType<E['process']['spawn']>
export type Usage = Awaited<ReturnType<E['session']['usage']>>
export type Repo = Awaited<ReturnType<E['session']['repo']>>
export type ModelAnswer = { isAnswered: true; text: string } | { isAnswered: false }

export type Io = {
  pluginRoot: string
  now: () => Promise<number>
  sleep: (ms: number) => Promise<void>
  after: (ms: number, fn: () => void) => Timer
  every: (ms: number, fn: () => void) => Timer
  /** Vorab gelesene Umgebungsvariablen (`$.env.get` verlangt feste Namen). */
  env: { os?: string; userProfile?: string; home?: string }
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
  list: (path: string) => Promise<FsEntries>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  sessionId: () => Promise<string>
  sessionRepo: () => Promise<Repo>
  sessionUsage: () => Promise<Usage>
  setting: (key: string) => Promise<unknown>
  spawn: (request: SpawnRequest) => SpawnStream
  speak: (text: string, voice?: string) => Promise<unknown>
  play: (asset: string) => Promise<unknown>
  status: (text: string | undefined) => void
  notify: (text: string, title: string) => Promise<unknown>
  log: (text: string) => void
  openPane: (title: string) => Promise<unknown>
  blit: (requestId: string, key: string, cells: string) => Promise<{ deny?: string }>
  submit: (text: string) => Promise<unknown>
  abort: (turnId: string) => Promise<unknown>
  fork: (prompt: string) => Promise<ModelAnswer>
  complete: (prompt: string) => Promise<ModelAnswer>
  setView: (view: AvatarView) => Promise<unknown>
}
