// Mehrere Sitzungen ohne Server: Jede Instanz der Mod schreibt ihren Stand
// in eine eigene Datei im gemeinsamen Ordner. Genau eine Instanz – der
// Sprecher – startet den Desktop-Avatar und sagt die Meldungen aller an.

import type { Io } from './io'
import type { AvatarMood, PlanProgress } from '../types'
import { joinPath, safeJson } from './util'

export type SoundName = 'attention' | 'done' | 'error' | 'message' | 'start'

export type SessionEvent = {
  n: number
  text: string
  isUrgent: boolean
  sound?: SoundName
  at: number
}

export type SessionStatusFile = {
  v: 1
  id: string
  project: string
  mood: AvatarMood
  step?: string
  plan?: PlanProgress
  needsYou: boolean
  updatedAt: number
  isEnded?: boolean
  events: SessionEvent[]
}

type SpeakerFile = { sessionId: string; heartbeatAt: number }
type InboxFile = { items: Array<{ n: number; text: string; at: number }> }

const FRESH_MS = 30_000
const SPEAKER_STALE_MS = 10_000

export class SessionHub {
  private events: SessionEvent[] = []
  private eventSeq = 0
  private lastSeen = new Map<string, number>()
  private inboxSeen = 0
  private inboxPrimed = false
  private lastWrite = ''

  constructor(
    private readonly io: Io,
    private readonly root: string,
    readonly myId: string,
  ) {}

  private get dir(): string {
    return joinPath(this.root, 'sessions')
  }

  private fileOf(id: string): string {
    return joinPath(this.dir, `${id}.json`)
  }

  private inboxOf(id: string): string {
    return joinPath(this.dir, `${id}.inbox.json`)
  }

  addEvent(text: string, isUrgent: boolean, now: number, sound?: SoundName): void {
    this.eventSeq = Math.max(this.eventSeq + 1, now)
    this.events = [...this.events, { n: this.eventSeq, text, isUrgent, sound, at: now }].slice(-12)
  }

  async writeSelf(status: Omit<SessionStatusFile, 'v' | 'id' | 'events'>, force = false): Promise<void> {
    const file: SessionStatusFile = { v: 1, id: this.myId, events: this.events, ...status }
    const text = JSON.stringify(file)
    const changed = text.replace(/"updatedAt":\d+/, '') !== this.lastWrite.replace(/"updatedAt":\d+/, '')
    if (!changed && !force) return
    this.lastWrite = text
    await this.io.write(this.fileOf(this.myId), text)
  }

  async markEnded(project: string, now: number): Promise<void> {
    await this.writeSelf({ project, mood: 'idle', needsYou: false, updatedAt: now, isEnded: true }, true).catch(() => undefined)
  }

  /** Alle anderen Sitzungen mit frischem Herzschlag. */
  async readOthers(now: number): Promise<SessionStatusFile[]> {
    const entries = await this.io.list(this.dir).catch(() => [])
    const out: SessionStatusFile[] = []
    for (const entry of entries) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.json') || entry.name.endsWith('.inbox.json')) continue
      if (entry.name === `${this.myId}.json`) continue
      if (entry.mtimeMs && now - entry.mtimeMs > FRESH_MS) continue
      const file = safeJson<SessionStatusFile>(await this.io.read(joinPath(this.dir, entry.name)).catch(() => undefined))
      if (!file || file.v !== 1 || file.isEnded || now - file.updatedAt > FRESH_MS) continue
      out.push(file)
    }
    return out.sort((a, b) => a.project.localeCompare(b.project))
  }

  /** Meldungen anderer Sitzungen, die der Sprecher noch nicht angesagt hat. */
  takeNewEvents(files: readonly SessionStatusFile[], now: number): Array<{ project: string; event: SessionEvent }> {
    const out: Array<{ project: string; event: SessionEvent }> = []
    for (const file of files) {
      const seen = this.lastSeen.get(file.id)
      const latest = file.events.reduce((max, event) => Math.max(max, event.n), 0)
      if (seen === undefined) {
        // Beim ersten Kontakt nichts Altes nachholen.
        this.lastSeen.set(file.id, latest)
        continue
      }
      for (const event of file.events) {
        if (event.n > seen && now - event.at < 15_000) out.push({ project: file.project, event })
      }
      this.lastSeen.set(file.id, Math.max(seen, latest))
    }
    return out
  }

  /** Versucht, Sprecher zu werden oder zu bleiben. */
  async claimSpeaker(now: number): Promise<boolean> {
    const path = joinPath(this.root, 'speaker.json')
    const current = safeJson<SpeakerFile>(await this.io.read(path).catch(() => undefined))
    const isFree = !current || now - current.heartbeatAt > SPEAKER_STALE_MS || current.sessionId === this.myId
    if (!isFree) return false
    await this.io.write(path, JSON.stringify({ sessionId: this.myId, heartbeatAt: now } satisfies SpeakerFile))
    const check = safeJson<SpeakerFile>(await this.io.read(path).catch(() => undefined))
    return check?.sessionId === this.myId
  }

  async releaseSpeaker(): Promise<void> {
    const path = joinPath(this.root, 'speaker.json')
    const current = safeJson<SpeakerFile>(await this.io.read(path).catch(() => undefined))
    if (current?.sessionId === this.myId) await this.io.write(path, JSON.stringify({ sessionId: '', heartbeatAt: 0 })).catch(() => undefined)
  }

  /** Neue Aufträge, die andere Sitzungen für diese hinterlegt haben. */
  async readInbox(): Promise<string[]> {
    const inbox = safeJson<InboxFile>(await this.io.read(this.inboxOf(this.myId)).catch(() => undefined))
    const items = inbox?.items ?? []
    if (!this.inboxPrimed) {
      this.inboxPrimed = true
      this.inboxSeen = items.reduce((max, item) => Math.max(max, item.n), 0)
      return []
    }
    const fresh = items.filter(item => item.n > this.inboxSeen).sort((a, b) => a.n - b.n)
    if (fresh.length > 0) this.inboxSeen = fresh[fresh.length - 1]!.n
    return fresh.map(item => item.text)
  }

  async sendTo(sessionId: string, text: string, now: number): Promise<void> {
    const path = this.inboxOf(sessionId)
    const inbox = safeJson<InboxFile>(await this.io.read(path).catch(() => undefined)) ?? { items: [] }
    const n = Math.max(now, ...inbox.items.map(item => item.n + 1))
    await this.io.write(path, JSON.stringify({ items: [...inbox.items, { n, text, at: now }].slice(-10) }))
  }
}
