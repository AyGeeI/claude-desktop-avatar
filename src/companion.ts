// Startet und überwacht den Desktop-Begleiter (companion/avatar.ps1) und
// spricht mit ihm: Zustand über eine Datei, Meldungen über stdout.

import type { Io, SpawnStream } from './io'
import type { CompanionStatus, VoiceInfo } from '../types'
import { errorText, isRecord, joinPath, safeJson } from './util'

export type CompanionMessage =
  | { type: 'ready'; version?: number; voices?: VoiceInfo[]; uiCulture?: string }
  | { type: 'prompt'; text: string; session?: string }
  | { type: 'command'; name: string; value?: string }
  | { type: 'spoken'; n: number }
  | { type: 'moved'; x: number; y: number; scale?: number }
  | { type: 'speaking'; isSpeaking: boolean }
  | { type: 'error'; message: string }
  | { type: 'log'; message: string }

export type CompanionOptions = {
  pluginRoot: string
  dataDir: string
  onMessage: (message: CompanionMessage) => void
  onStatus: (status: CompanionStatus, note?: string) => void
}

type Stream = SpawnStream

const MAX_RESTARTS = 3
const RESTART_WINDOW_MS = 5 * 60_000

export class Companion {
  status: CompanionStatus = 'off'
  note: string | undefined
  private stream: Stream | undefined
  private isWanted = false
  private restarts: number[] = []
  private pending: string | undefined
  private flushing = false
  private lastWritten = ''

  constructor(
    private readonly io: Io,
    private readonly options: CompanionOptions,
  ) {}

  get statePath(): string {
    return joinPath(this.options.dataDir, 'companion', 'state.json')
  }

  get isRunning(): boolean {
    return this.status === 'running'
  }

  start(initialState: string): void {
    if (this.isWanted) return
    this.isWanted = true
    this.restarts = []
    void this.launch(initialState)
  }

  stop(finalState?: string): void {
    this.isWanted = false
    if (finalState) void this.write(finalState)
    const stream = this.stream
    this.stream = undefined
    if (stream) void stream.return(undefined as never).catch(() => undefined)
    this.setStatus('off')
  }

  /** Schreibt den Zustand höchstens etwa alle 100 ms; der jüngste gewinnt. */
  push(state: string): void {
    this.pending = state
    if (this.flushing) return
    this.flushing = true
    void (async () => {
      try {
        while (this.pending !== undefined) {
          const next = this.pending
          this.pending = undefined
          await this.write(next)
          await this.io.sleep(100)
        }
      } finally {
        this.flushing = false
      }
    })()
  }

  private async write(state: string): Promise<void> {
    if (state === this.lastWritten) return
    this.lastWritten = state
    await this.io.write(this.statePath, state).catch(() => undefined)
  }

  private setStatus(status: CompanionStatus, note?: string): void {
    this.status = status
    this.note = note
    this.options.onStatus(status, note)
  }

  private async launch(initialState: string): Promise<void> {
    await this.write(initialState)
    const script = joinPath(this.options.pluginRoot, 'companion', 'avatar.ps1')
    const argv = [
      'powershell.exe',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Sta',
      '-File',
      script,
      '-StateDir',
      this.options.dataDir,
      '-PluginRoot',
      this.options.pluginRoot,
    ]
    this.setStatus('starting')
    let stderr = ''
    let exitCode: number | null = null
    let buffer = ''
    try {
      const stream = this.io.spawn({ argv, cwd: this.options.dataDir })
      this.stream = stream
      for (;;) {
        const step = await stream.next()
        if (step.done) {
          exitCode = step.value?.code ?? null
          break
        }
        const chunk = step.value
        if (chunk.stream === 'stderr') {
          stderr = (stderr + chunk.text).slice(-1500)
          continue
        }
        buffer += chunk.text
        let cut = buffer.indexOf('\n')
        while (cut >= 0) {
          const line = buffer.slice(0, cut).trim()
          buffer = buffer.slice(cut + 1)
          if (line) this.handleLine(line)
          cut = buffer.indexOf('\n')
        }
      }
    } catch (error) {
      stderr = (stderr + '\n' + errorText(error)).trim().slice(-1500)
    }
    this.stream = undefined
    if (!this.isWanted) return
    const reason = stderr.trim().split('\n').slice(-3).join(' ') || (exitCode !== null ? `Exit-Code ${exitCode}` : 'unbekannt')
    const now = await this.io.now()
    this.restarts = [...this.restarts.filter(at => now - at < RESTART_WINDOW_MS), now]
    if (this.restarts.length > MAX_RESTARTS) {
      this.isWanted = false
      this.setStatus('failed', reason)
      return
    }
    this.setStatus('starting', reason)
    await this.io.sleep(1500 * this.restarts.length)
    if (this.isWanted) void this.launch(this.lastWritten || initialState)
  }

  private handleLine(line: string): void {
    const message = safeJson<unknown>(line)
    if (!isRecord(message) || typeof message['type'] !== 'string') return
    if (message['type'] === 'ready') this.setStatus('running')
    this.options.onMessage(message as CompanionMessage)
  }
}
