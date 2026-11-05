// Der Controller hält den Laufzeitzustand der Mod und verbindet alles:
// Ereignisse der Sitzung → Zustand → Anzeige, Ansagen, Desktop-Begleiter.
// Die Engine erreicht er nur über `Io` (siehe io.ts), nie über `$`.

import type { PluginOptions } from 'claude-code'
import type { AvatarMood, AvatarView, CompanionStatus, PanelState, SessionBrief, VoiceInfo } from '../types'
import { addressed, intentOf, parseSlash, type Intent, type SlashAction } from './commands'
import { Companion, type CompanionMessage } from './companion'
import { strings, usageKindLabel, type Lang } from './i18n'
import type { Io, Timer } from './io'
import { doneLongLine, isPersonaStyle, line, waitingLine, whoamiLine, type PersonaStyle } from './persona'
import { SessionHub, type SessionStatusFile, type SoundName } from './sessions'
import { applyOverrides, fromOptions, inQuietHours, nextVerbosity, saveOverride, type Settings, type Verbosity } from './settings'
import { listTemplates, loadTemplate, resolveParams, templateName, type LoadedTemplate, type TemplateEntry } from './templates'
import { describeTool, permissionDetail, PlanTracker } from './tools'
import { baseName, errorText, joinPath, speakableIntro, speakableProject, truncate } from './util'

export const PANE_ID = 'avatar'

/** Anfangswerte der Zustände `avatar.view` und `avatar.panel`. */
export const EMPTY_VIEW: AvatarView = {
  mood: 'idle',
  sessions: [],
  companion: 'off',
  voices: [],
  isSpeaker: false,
  updatedAt: 0,
}
export const FIRST_PANEL: PanelState = { tab: 'status' }

type Level = 'urgent' | 'milestone' | 'info' | 'reply'
type ToolInput = { tool: string; tool_use_id?: string; agentId?: string } & Record<string, unknown>
type SayItem = { n: number; text: string; lang: Lang; isUrgent: boolean; at: number }

const SLEEP_AFTER_MS = 10 * 60_000

export class Controller {
  io: Io | undefined
  settings: Settings
  isActive = false
  lang: Lang = 'de'
  sessionId = ''
  project = ''
  dataDir = ''
  pluginRoot = ''
  isWindows = false
  template: LoadedTemplate | undefined
  templateError: string | undefined
  templates: TemplateEntry[] = []
  voices: VoiceInfo[] = []
  mood: AvatarMood = 'idle'
  step: string | undefined
  stepVerb: string | undefined
  attention: string | undefined
  lastSaid: string | undefined
  lastAnswer = ''
  others: SessionStatusFile[] = []
  isSpeaker = false

  private hub: SessionHub | undefined
  private companion: Companion | undefined
  private plan = new PlanTracker()
  private uiCulture: string | undefined
  private claudeLanguage: string | undefined
  private moodTimer: Timer | undefined
  private ticker: Timer | undefined
  private isTicking = false
  private lastActivity = 0
  private mainTurnId: string | undefined
  private isTurnRunning = false
  private isVoiceTurn = false
  private isStopRequested = false
  private desktopPrompts: string[] = []
  private bundle: { key: string; count: number; at: number } | undefined
  private lastSpokenAt = 0
  private lastUrgentAt = 0
  private say: SayItem[] = []
  private sayN = 0
  private stopSpeech = 0
  private sound: { n: number; path: string } | undefined
  private soundN = 0
  private bubble: { n: number; lines: string[]; isUrgent: boolean; showMs: number } = { n: 0, lines: [], isUrgent: false, showMs: 0 }
  private stateSeq = 0
  private isPublishScheduled = false
  private fallbackSpeechBroken = false
  private permissionTool: string | undefined
  private lastToolInput: ToolInput | undefined
  private hasGreeted = false
  private lastStepNumber: number | undefined

  constructor(private readonly options: PluginOptions) {
    this.settings = fromOptions(options)
  }

  get s(): ReturnType<typeof strings> {
    return strings(this.lang)
  }

  get style(): PersonaStyle {
    if (this.settings.style) return this.settings.style
    const fromTemplate = this.template?.manifest.persona?.style
    return isPersonaStyle(fromTemplate) ? fromTemplate : 'neon'
  }

  get params(): Record<string, string | boolean | number> {
    return this.template ? resolveParams(this.template.manifest, this.settings.params) : {}
  }

  get companionStatus(): CompanionStatus {
    if (!this.isWindows) return 'unsupported'
    return this.companion?.status ?? 'off'
  }

  get companionNote(): string | undefined {
    return this.companion?.note
  }

  // ------------------------------------------------------------------ Start & Ende

  async start(io: Io, e: { cwd: string; isInteractive: boolean }): Promise<void> {
    this.io = io
    if (!e.isInteractive) return
    this.isActive = true
    this.settings = applyOverrides(fromOptions(this.options), await io.storeGet('overrides').catch(() => undefined))
    this.pluginRoot = io.pluginRoot
    this.isWindows = io.env.os === 'Windows_NT'
    const home = io.env.userProfile || io.env.home || e.cwd
    this.dataDir = joinPath(home, '.claude-desktop-avatar')
    this.sessionId = await io.sessionId()
    const repo = await io.sessionRepo().catch(() => null)
    this.project = baseName(repo?.root ?? e.cwd) || 'claude'
    const language = await io.setting('language').catch(() => undefined)
    this.claudeLanguage = typeof language === 'string' ? language : undefined
    this.resolveLang()
    await this.reloadTemplates()
    this.hub = new SessionHub(io, this.dataDir, this.sessionId)
    this.companion = new Companion(io, {
      pluginRoot: this.pluginRoot,
      dataDir: this.dataDir,
      onMessage: message => this.safely(() => this.onCompanion(message)),
      onStatus: () => this.publish(),
    })
    this.lastActivity = await io.now()
    await this.tick()
    this.ticker = io.every(2000, () => void this.tick())
    if (!this.isWindows || !this.settings.desktop) void io.openPane(this.settings.name).catch(() => undefined)
    // Begrüßung, sobald der Desktop-Avatar bereit ist (er meldet die Windows-Sprache), spätestens nach 4 s.
    io.after(4000, () => this.safely(() => this.greet()))
    this.publish()
  }

  async end(): Promise<void> {
    const io = this.io
    if (!this.isActive || !io) return
    this.isActive = false
    this.ticker?.cancel()
    this.moodTimer?.cancel()
    const now = await io.now()
    this.companion?.stop(this.companionState(now, true))
    await this.hub?.markEnded(this.project, now)
    await this.hub?.releaseSpeaker()
  }

  greet(): void {
    if (this.hasGreeted || !this.isActive || !this.isSpeaker) return
    this.hasGreeted = true
    if (this.settings.verbosity === 'quiet') return
    const text = this.template?.manifest.persona?.greeting?.[this.lang] ?? line(this.style, this.lang, 'greet')
    this.announce({ text, level: 'milestone', sound: 'start', bubble: [text] })
  }

  async reloadTemplates(): Promise<void> {
    const io = this.io
    if (!io) return
    const builtIn = joinPath(this.pluginRoot, 'templates')
    const user = joinPath(this.dataDir, 'templates')
    this.templates = await listTemplates(io, builtIn, user).catch(() => [])
    const entry = this.templates.find(one => one.id === this.settings.templateId) ?? this.templates.find(one => one.isBuiltIn) ?? this.templates[0]
    if (!entry) {
      this.template = undefined
      this.templateError = this.lang === 'en' ? 'No template found.' : 'Keine Vorlage gefunden.'
      return
    }
    try {
      this.template = await loadTemplate(io, entry.dir)
      this.templateError = undefined
    } catch (error) {
      this.templateError = errorText(error)
      const fallback = this.templates.find(one => one.isBuiltIn && one.id !== entry.id)
      if (fallback) this.template = await loadTemplate(io, fallback.dir).catch(() => undefined)
    }
  }

  // ------------------------------------------------------------------ Takt

  private async tick(): Promise<void> {
    const io = this.io
    if (!io || !this.isActive || !this.hub || this.isTicking) return
    this.isTicking = true
    try {
      const now = await io.now()
      const wasSpeaker = this.isSpeaker
      this.isSpeaker = await this.hub.claimSpeaker(now).catch(() => false)
      if (this.isSpeaker !== wasSpeaker) this.publish()
      this.syncCompanion(now)
      await this.hub.writeSelf({
        project: this.project,
        mood: this.mood,
        step: this.step,
        plan: this.plan.progress(),
        needsYou: this.attention !== undefined,
        updatedAt: now,
      })
      const before = JSON.stringify(this.others.map(one => [one.id, one.mood, one.step, one.needsYou]))
      this.others = await this.hub.readOthers(now)
      if (this.isSpeaker) for (const { project, event } of this.hub.takeNewEvents(this.others, now)) this.relay(project, event.text, event.isUrgent, event.sound)
      if (JSON.stringify(this.others.map(one => [one.id, one.mood, one.step, one.needsYou])) !== before) this.publish()
      for (const text of await this.hub.readInbox()) void this.submitFromDesktop(text)
      if (this.mood === 'idle' && now - this.lastActivity > SLEEP_AFTER_MS) this.setMood('sleeping')
      if (this.companion && this.companion.status !== 'off' && this.companion.status !== 'failed') this.companion.push(this.companionState(now))
    } catch (error) {
      this.log(`tick: ${errorText(error)}`)
    } finally {
      this.isTicking = false
    }
  }

  private syncCompanion(now: number): void {
    if (!this.companion) return
    const isWanted = this.isActive && this.isSpeaker && this.isWindows && this.settings.desktop
    const status = this.companion.status
    if (isWanted && status === 'off') this.companion.start(this.companionState(now))
    else if (!isWanted && status !== 'off' && status !== 'failed') this.companion.stop(this.companionState(now, true))
  }

  // ------------------------------------------------------------------ Zustand

  private setMood(mood: AvatarMood): void {
    if (this.mood === mood) return
    this.mood = mood
    this.moodTimer?.cancel()
    this.moodTimer = undefined
    const once = this.template?.manifest.states[mood]
    const holdMs = mood === 'success' ? once?.duration ?? 1800 : mood === 'error' ? once?.duration ?? 1600 : 0
    if (holdMs > 0 && this.io) {
      this.moodTimer = this.io.after(Math.max(holdMs, 2500), () =>
        this.safely(() => {
          if (this.mood === mood) this.setMood(this.isTurnRunning ? 'working' : 'idle')
        }),
      )
    }
    this.publish()
    this.pushCompanionNow()
  }

  private touch(): void {
    this.lastActivity = Date.now()
    if (this.mood === 'sleeping') this.setMood('idle')
  }

  private resolveLang(): void {
    const chosen = this.settings.language
    if (chosen === 'de' || chosen === 'en') {
      this.lang = chosen
      return
    }
    const claude = (this.claudeLanguage ?? '').toLowerCase()
    if (/^(de|german|deutsch)/.test(claude)) this.lang = 'de'
    else if (/^(en|english|englisch)/.test(claude)) this.lang = 'en'
    else if (this.uiCulture) this.lang = this.uiCulture.toLowerCase().startsWith('en') ? 'en' : 'de'
    else this.lang = 'de'
  }

  /** Aktualisiert Anzeige und Statuszeile höchstens etwa alle 120 ms. */
  publish(): void {
    const io = this.io
    if (!io || this.isPublishScheduled) return
    this.isPublishScheduled = true
    io.after(120, () => {
      this.isPublishScheduled = false
      void io.setView(this.snapshot()).catch(() => undefined)
      this.safely(() => io.status(this.statusLine()))
    })
  }

  snapshot(): AvatarView {
    return {
      mood: this.mood,
      step: this.step,
      plan: this.plan.progress(),
      lastSaid: this.lastSaid,
      lastAnswer: this.lastAnswer ? truncate(this.lastAnswer, 400) : undefined,
      attention: this.attention,
      sessions: this.sessionBriefs(),
      companion: this.companionStatus,
      companionNote: this.companionNote,
      voices: this.voices,
      isSpeaker: this.isSpeaker,
      updatedAt: Date.now(),
    }
  }

  /** Die Statuszeile unter der Eingabe: nur, solange etwas läuft oder jemand wartet. */
  statusLine(): string | undefined {
    if (!this.isActive) return undefined
    const waiting = this.others.filter(one => one.needsYou).map(one => one.project)
    const isBusy = this.mood === 'thinking' || this.mood === 'working' || this.mood === 'attention'
    if (!isBusy && waiting.length === 0) return undefined
    const parts = [`◆ ${this.settings.name} · ${this.s.mood[this.mood]}`]
    if (this.attention) parts.push(this.attention)
    else if (isBusy) parts.push(this.stepLine())
    if (waiting.length > 0) parts.push(this.s.sessionWaits(waiting.join(', ')))
    return truncate(parts.join(' · '), 200)
  }

  sessionBriefs(): SessionBrief[] {
    const self: SessionBrief = {
      id: this.sessionId,
      project: this.project,
      mood: this.mood,
      step: this.step,
      plan: this.plan.progress(),
      needsYou: this.attention !== undefined,
      updatedAt: Date.now(),
      isSelf: true,
    }
    return [
      self,
      ...this.others.map(one => ({ id: one.id, project: one.project, mood: one.mood, step: one.step, plan: one.plan, needsYou: one.needsYou, updatedAt: one.updatedAt, isSelf: false })),
    ]
  }

  // ------------------------------------------------------------------ Ansagen

  /**
   * Eine Meldung: Sprechblase, Ton, Ansage und Systembenachrichtigung je nach
   * Ausführlichkeit, Ruhezeiten und Drosselung. Nur der Sprecher spricht; die
   * anderen Sitzungen legen ihre Meldungen im Status-Ordner ab.
   */
  announce(options: { text: string; level: Level; sound?: SoundName; bubble?: string[]; notify?: boolean }): void {
    const io = this.io
    if (!io || !this.isActive) return
    const { text, level } = options
    const verbosity = this.settings.verbosity
    const now = Date.now()
    if (options.bubble) this.setBubble(options.bubble, level === 'urgent', level === 'urgent' ? 0 : level === 'info' ? (verbosity === 'chatty' ? 3500 : -1) : 7000)

    const soundAllowed = options.sound !== undefined && (level === 'urgent' || level === 'reply' || verbosity !== 'quiet') && (level !== 'info' || verbosity === 'chatty')
    const speechAllowed = this.speechAllowed(level, now)

    if (options.notify && this.settings.notifications) void io.notify(text, this.settings.name).catch(() => undefined)

    if (!this.isSpeaker) {
      if (soundAllowed || speechAllowed) this.hub?.addEvent(text, level === 'urgent', now, soundAllowed ? options.sound : undefined)
      return
    }
    if (soundAllowed && options.sound) this.playSound(options.sound)
    if (speechAllowed) this.speak(text, level === 'urgent')
  }

  private speechAllowed(level: Level, now: number): boolean {
    if (!this.settings.speech) return false
    if (level === 'reply') return true
    if (inQuietHours(this.settings.quietHours, new Date(now))) return false
    const verbosity = this.settings.verbosity
    if (verbosity === 'quiet') return false
    if (level === 'info' && verbosity !== 'chatty') return false
    if (level === 'urgent') {
      if (now - this.lastUrgentAt < 5000) return false
      this.lastUrgentAt = now
      return true
    }
    const gap = level === 'milestone' ? 5000 : 20_000
    return now - this.lastSpokenAt >= gap
  }

  /** Meldung einer anderen Sitzung, angesagt vom Sprecher. */
  private relay(project: string, text: string, isUrgent: boolean, sound?: SoundName): void {
    this.setBubble([`${project} · ${text}`], isUrgent, isUrgent ? 0 : 7000)
    if (sound) this.playSound(sound)
    if (this.settings.speech && !inQuietHours(this.settings.quietHours, new Date())) this.speak(`${speakableProject(project)}: ${text}`, isUrgent)
  }

  speak(text: string, isUrgent: boolean): void {
    const io = this.io
    if (!io || !text.trim()) return
    const now = Date.now()
    this.lastSpokenAt = now
    this.lastSaid = text
    if (this.companion?.isRunning) {
      this.say = [...this.say, { n: ++this.sayN, text, lang: this.lang, isUrgent, at: now }].slice(-8)
      this.pushCompanionNow()
    } else if (!this.fallbackSpeechBroken) {
      const voice = this.lang === 'en' ? this.settings.voiceEn : this.settings.voiceDe
      void io.speak(text, voice || undefined).catch(() => {
        this.fallbackSpeechBroken = true
      })
    }
    this.publish()
  }

  private stopSpeaking(): void {
    if (this.say.length === 0) return
    this.stopSpeech++
    this.say = []
    this.pushCompanionNow()
  }

  playSound(name: SoundName): void {
    const io = this.io
    if (!io) return
    const fromTemplate = this.template?.manifest.sounds?.[name]
    const path = fromTemplate && this.template ? joinPath(this.template.dir, fromTemplate) : joinPath(this.pluginRoot, 'sounds', `${name}.wav`)
    if (this.companion?.isRunning) {
      this.sound = { n: ++this.soundN, path }
      this.pushCompanionNow()
    } else {
      void io.play(`sounds/${name}.wav`).catch(() => undefined)
    }
  }

  private setBubble(lines: string[], isUrgent: boolean, showMs: number): void {
    this.bubble = { n: this.bubble.n + 1, lines: lines.map(one => truncate(one, 160)), isUrgent, showMs }
    this.pushCompanionNow()
  }

  // ------------------------------------------------------------------ Desktop-Begleiter

  companionState(now: number, quit = false): string {
    const s = this.s
    const sessions = this.sessionBriefs().map(one => ({
      id: one.id,
      project: one.project,
      mood: one.mood,
      label: s.mood[one.mood],
      step: one.step ?? '',
      needsYou: one.needsYou,
      isSelf: one.isSelf,
    }))
    const plan = this.plan.progress()
    return JSON.stringify({
      v: 1,
      seq: ++this.stateSeq,
      heartbeatAt: now,
      quit,
      visible: this.settings.desktop,
      ghost: this.settings.ghost,
      lang: this.lang,
      name: this.settings.name,
      mood: this.mood,
      title: `${this.settings.name} · ${s.mood[this.mood]}`,
      step: this.step ?? '',
      plan: plan ? { done: plan.done, total: plan.total, current: plan.current ?? '' } : null,
      attention: this.attention ?? '',
      bubble: this.bubble,
      sessions,
      say: this.say,
      stopSpeech: this.stopSpeech,
      sound: this.sound ?? null,
      template: this.template ? { dir: this.template.dir, file: this.template.manifest.pixel.file, params: this.params, scale: this.settings.scale } : null,
      speech: {
        enabled: this.settings.speech,
        voiceDe: this.settings.voiceDe,
        voiceEn: this.settings.voiceEn,
      },
      hotkey: this.settings.hotkey,
      verbosity: this.settings.verbosity,
      voiceMode: this.settings.voiceMode,
    })
  }

  private pushCompanionNow(): void {
    if (!this.companion || this.companion.status === 'off' || this.companion.status === 'failed') return
    this.companion.push(this.companionState(Date.now()))
  }

  private onCompanion(message: CompanionMessage): void {
    switch (message.type) {
      case 'ready':
        this.voices = Array.isArray(message.voices) ? message.voices.slice(0, 40) : []
        this.uiCulture = message.uiCulture
        this.resolveLang()
        this.pushCompanionNow()
        this.publish()
        this.io?.after(400, () => this.safely(() => this.greet()))
        break
      case 'prompt':
        if (message.session && message.session !== this.sessionId) {
          const target = this.others.find(one => one.id === message.session)
          void this.hub?.sendTo(message.session, message.text, Date.now())
          this.setBubble([`→ ${target?.project ?? '…'}: ${truncate(message.text, 80)}`], false, 4000)
        } else void this.submitFromDesktop(message.text)
        break
      case 'command':
        void this.companionCommand(message.name, message.value)
        break
      case 'moved':
        if (typeof message.scale === 'number' && message.scale !== this.settings.scale) void this.change({ scale: message.scale })
        break
      case 'error':
      case 'log':
        this.log(`desktop: ${message.message}`)
        break
      default:
        break
    }
  }

  private async companionCommand(name: string, value?: string): Promise<void> {
    switch (name) {
      case 'status':
        await this.runIntent({ kind: 'status' }, true)
        break
      case 'stop':
        await this.runIntent({ kind: 'stop' }, true)
        break
      case 'verbosity':
        if (value === 'quiet' || value === 'normal' || value === 'chatty') await this.setVerbosity(value, true)
        break
      case 'voiceMode':
        await this.change({ voiceMode: !this.settings.voiceMode })
        this.speakReply(this.s.voiceModeSet(this.settings.voiceMode))
        break
      case 'speech':
        await this.change({ speech: !this.settings.speech })
        break
      case 'ghost':
        await this.change({ ghost: value === 'on' ? true : value === 'off' ? false : !this.settings.ghost })
        break
      case 'quit':
        await this.change({ desktop: false })
        break
      case 'summary':
        await this.runIntent({ kind: 'summary' }, true)
        break
      case 'test':
        await this.runTest()
        break
      default:
        break
    }
  }

  // ------------------------------------------------------------------ Prompts & Befehle

  /**
   * `prompt.submit`: erkennt Befehle an den Avatar (die er selbst beantwortet)
   * und hängt bei gesprochenen Aufträgen den Hinweis für eine vorlesbare Antwort an.
   */
  async onPromptSubmit(e: { text: string; command?: unknown; isMeta?: true }): Promise<{ drop?: string; text?: string; context?: string }> {
    if (!this.isActive || e.command || e.isMeta) return {}
    const index = this.desktopPrompts.indexOf(e.text)
    const isFromDesktop = index >= 0
    if (isFromDesktop) this.desktopPrompts.splice(index, 1)
    const { isAddressed, rest } = addressed(e.text, this.settings.name)
    if (isAddressed) {
      const intent: Intent | undefined = rest ? intentOf(rest) : { kind: 'hello' }
      if (intent) {
        const reply = await this.runIntent(intent, true)
        return { drop: `${this.settings.name}: ${reply}` }
      }
    }
    this.touch()
    this.stopSpeaking()
    const isVoice = isAddressed || isFromDesktop || this.settings.voiceMode
    this.isVoiceTurn = isVoice
    this.isTurnRunning = true
    this.attention = undefined
    this.step = undefined
    this.stepVerb = undefined
    this.bundle = undefined
    this.setMood('thinking')
    if (isVoice && this.isSpeaker && this.settings.verbosity !== 'quiet') this.setBubble([line(this.style, this.lang, 'ack')], false, 2500)
    return {
      text: isAddressed && rest ? rest : undefined,
      context: isVoice ? this.s.speakableHint : undefined,
    }
  }

  /** Text aus dem Eingabefeld des Desktop-Avatars oder der Eingangsdatei. */
  async submitFromDesktop(text: string): Promise<void> {
    const io = this.io
    if (!io || !text.trim()) return
    const { isAddressed, rest } = addressed(text, this.settings.name)
    const subject = isAddressed ? rest : text
    const intent = intentOf(subject)
    if (intent) {
      await this.runIntent(intent, true)
      return
    }
    this.desktopPrompts = [...this.desktopPrompts, subject].slice(-5)
    await io.submit(subject).catch(error => this.log(`prompt.submit: ${errorText(error)}`))
  }

  /** Führt einen Befehl an den Avatar aus und spricht die Antwort. */
  async runIntent(intent: Intent, shouldSpeak: boolean): Promise<string> {
    const io = this.io
    const s = this.s
    let reply = ''
    switch (intent.kind) {
      case 'status':
        reply = this.statusText()
        break
      case 'stop':
        if (this.isTurnRunning && this.mainTurnId && io) {
          this.isStopRequested = true
          await io.abort(this.mainTurnId).catch(error => this.log(`turn.abort: ${errorText(error)}`))
          reply = line(this.style, this.lang, 'aborted') || s.stopped
        } else reply = s.nothingToStop
        this.stopSpeaking()
        break
      case 'quieter':
        reply = await this.setVerbosity(nextVerbosity(this.settings.verbosity, -1), false)
        break
      case 'louder':
        reply = await this.setVerbosity(nextVerbosity(this.settings.verbosity, 1), false)
        break
      case 'mute':
        this.stopSpeaking()
        reply = await this.setVerbosity('quiet', false)
        break
      case 'doing':
        reply = await this.whatAmIDoing()
        break
      case 'summary':
        reply = await this.summarizeLastAnswer()
        break
      case 'repeat':
        reply = this.lastSaid ?? s.noAnswerYet
        break
      case 'usage':
        reply = await this.usageText()
        break
      case 'hide':
        await this.change({ desktop: false })
        reply = s.desktopSet(false)
        break
      case 'show':
        await this.change({ desktop: true })
        reply = s.desktopSet(true)
        break
      case 'voiceMode':
        await this.change({ voiceMode: intent.on })
        reply = s.voiceModeSet(intent.on)
        break
      case 'thanks':
        reply = line(this.style, this.lang, 'thanks')
        break
      case 'whoami':
        reply = whoamiLine(this.style, this.lang, this.settings.name)
        break
      case 'help':
        reply = this.lang === 'en' ? 'Here is what I can do.' : 'Das kann ich für dich tun.'
        if (shouldSpeak) this.speakReply(reply)
        return `${reply}\n\n${s.help(this.settings.name)}`
      case 'hello':
        reply = line(this.style, this.lang, 'hello')
        break
    }
    if (shouldSpeak) this.speakReply(reply)
    return reply
  }

  private speakReply(reply: string): void {
    this.setBubble([reply], false, 7000)
    if (this.isSpeaker) {
      if (this.settings.speech) this.speak(reply, true)
    } else this.hub?.addEvent(reply, true, Date.now())
  }

  private async setVerbosity(value: Verbosity, shouldSpeak: boolean): Promise<string> {
    await this.change({ verbosity: value })
    const reply = this.s.verbositySet(this.s.verbosityLabel[value])
    if (shouldSpeak) this.speakReply(reply)
    return reply
  }

  statusText(): string {
    const s = this.s
    const sessions = this.sessionBriefs()
    const lines = sessions.map(one => s.sessionLine(speakableProject(one.project), s.mood[one.mood], one.needsYou ? s.waiting : one.step))
    return [s.statusIntro(sessions.length), ...lines].join(' ')
  }

  private async whatAmIDoing(): Promise<string> {
    const io = this.io
    const fallback = this.step ? `${this.step}.` : this.s.statusIntro(1)
    if (!io || !this.isTurnRunning) return fallback
    const prompt =
      this.lang === 'en'
        ? 'In one short spoken sentence, without Markdown, say what you are working on right now. Do not use tools.'
        : 'Sag in einem kurzen gesprochenen Satz ohne Markdown, woran du gerade arbeitest. Benutze keine Werkzeuge.'
    const result = await io.fork(prompt).catch(() => undefined)
    return result && result.isAnswered ? speakableIntro(result.text, 220) : fallback
  }

  private async summarizeLastAnswer(): Promise<string> {
    const io = this.io
    if (!io || !this.lastAnswer) return this.s.noAnswerYet
    const instruction =
      this.lang === 'en'
        ? 'Summarize the following answer in at most two short spoken sentences, without Markdown:'
        : 'Fasse die folgende Antwort in höchstens zwei kurzen gesprochenen Sätzen ohne Markdown zusammen:'
    const result = await io.complete(`${instruction}\n\n${truncate(this.lastAnswer, 6000)}`).catch(() => undefined)
    return result && result.isAnswered ? speakableIntro(result.text, 260) : speakableIntro(this.lastAnswer, 220)
  }

  private async usageText(): Promise<string> {
    const io = this.io
    if (!io) return this.s.usageUnknown
    const usage = await io.sessionUsage().catch(() => undefined)
    const windows = usage?.rateLimits ?? []
    if (windows.length === 0) return this.s.usageUnknown
    const parts = windows.slice(0, 3).map(one => {
      const resets = one.resetsAt ? formatTime(one.resetsAt, this.lang) : undefined
      return this.s.usageWindow(usageKindLabel(one.kind, this.lang), one.percentUsed, resets)
    })
    return this.s.usage(parts)
  }

  /** `/avatar …` */
  async onSlash(args: string): Promise<{ text: string; openPane?: PanelState['tab'] }> {
    const action: SlashAction = parseSlash(args)
    const s = this.s
    switch (action.kind) {
      case 'pane':
        return { text: `${this.settings.name}: ${this.statusText()}`, openPane: 'status' }
      case 'look':
        return { text: `${this.settings.name}: ${s.ui.look}`, openPane: 'look' }
      case 'setup':
        return { text: this.setupText(), openPane: 'setup' }
      case 'ghost': {
        const on = action.on ?? !this.settings.ghost
        await this.change({ ghost: on })
        return { text: s.ghostSet(on) }
      }
      case 'test':
        void this.runTest()
        return { text: s.testLine(this.settings.name) }
      case 'restart':
        await this.restartCompanion()
        return { text: `${this.settings.name}: ${s.companion[this.companionStatus]}` }
      case 'verbosity':
        return { text: await this.setVerbosity(action.value, false) }
      case 'speech':
        await this.change({ speech: action.on })
        return { text: s.speechSet(action.on) }
      case 'rename':
        await this.change({ name: action.name.slice(0, 40) })
        return { text: `${s.ui.name}: ${this.settings.name}` }
      case 'template': {
        const entry = this.templates.find(one => one.id === action.id || templateName(one, this.lang).toLowerCase() === action.id.toLowerCase())
        if (!entry) return { text: `${s.ui.template}: ${this.templates.map(one => one.id).join(', ')}` }
        await this.change({ templateId: entry.id })
        await this.reloadTemplates()
        this.pushCompanionNow()
        this.publish()
        return { text: s.templateSet(templateName(entry, this.lang)) }
      }
      case 'style':
        if (isPersonaStyle(action.style)) {
          await this.change({ style: action.style })
          return { text: `${s.ui.style}: ${s.styleLabel[action.style]}` }
        }
        return { text: `${s.ui.style}: neon, friendly, concise, formal, butler` }
      case 'unknown':
        return { text: s.help(this.settings.name) }
      default: {
        const reply = await this.runIntent(action, true)
        return { text: `${this.settings.name}: ${reply}` }
      }
    }
  }

  setupText(): string {
    const s = this.s
    const note = this.companionNote ? ` (${this.companionNote})` : ''
    return s.setupMarkdown({
      name: this.settings.name,
      companion: `${s.companion[this.companionStatus]}${note}`,
      voices: this.voices.map(voice => `${voice.name} (${voice.culture})`),
      language: this.lang,
    })
  }

  /** Ändert Einstellungen, speichert sie für alle Sitzungen und überträgt sie. */
  async change(patch: Partial<Settings>): Promise<void> {
    const io = this.io
    if (!io) return
    this.settings = { ...this.settings, ...patch }
    await saveOverride(io, patch).catch(error => this.log(`store: ${errorText(error)}`))
    if (patch.language) this.resolveLang()
    if (patch.desktop !== undefined) this.syncCompanion(Date.now())
    this.pushCompanionNow()
    this.publish()
  }

  async restartCompanion(): Promise<void> {
    const io = this.io
    if (!this.companion || !io) return
    this.companion.stop()
    await io.sleep(600)
    this.syncCompanion(Date.now())
  }

  async runTest(): Promise<void> {
    const io = this.io
    if (!io) return
    const sequence: Array<[AvatarMood, number]> = [
      ['thinking', 1600],
      ['working', 2200],
      ['attention', 2200],
      ['success', 2200],
      ['error', 1800],
      ['sleeping', 1800],
      ['idle', 0],
    ]
    this.playSound('start')
    this.speak(this.s.testLine(this.settings.name), false)
    for (const [mood, ms] of sequence) {
      this.mood = mood
      this.step = `${this.s.ui.test}: ${this.s.mood[mood]}`
      this.publish()
      this.pushCompanionNow()
      if (mood === 'attention') this.playSound('attention')
      if (mood === 'success') this.playSound('done')
      if (mood === 'error') this.playSound('error')
      if (ms > 0) await io.sleep(ms)
    }
    this.step = undefined
    this.publish()
    this.pushCompanionNow()
  }

  // ------------------------------------------------------------------ Ereignisse der Sitzung

  onTurnStart(e: { turnId: string; agentId?: string }): void {
    if (!this.isActive || e.agentId) return
    this.mainTurnId = e.turnId
    this.isTurnRunning = true
    if (this.mood === 'idle' || this.mood === 'sleeping' || this.mood === 'success') this.setMood('thinking')
  }

  beforeTool(input: ToolInput): void {
    if (!this.isActive) return
    this.touch()
    this.lastToolInput = input
    const info = describeTool(input)
    if (info.needsYou) {
      const text = info.text(this.lang)
      this.attention = text
      this.setMood('attention')
      const spoken = info.needsYou === 'question' ? line(this.style, this.lang, 'question') : text
      this.announce({ text: spoken, level: 'urgent', sound: 'attention', bubble: [text], notify: true })
      return
    }
    if (info.isPlanOnly) return
    const now = Date.now()
    let text = info.text(this.lang)
    if (info.bundleKey && this.bundle && this.bundle.key === info.bundleKey && now - this.bundle.at < 3000) {
      this.bundle = { key: info.bundleKey, count: this.bundle.count + 1, at: now }
      if (info.many) text = info.many(this.lang, this.bundle.count)
    } else this.bundle = info.bundleKey ? { key: info.bundleKey, count: 1, at: now } : undefined
    if (input.agentId) text = this.s.subagent + text
    this.step = text
    this.stepVerb = info.verb(this.lang)
    if (this.mood !== 'attention') this.setMood('working')
    if (this.settings.verbosity === 'chatty') this.announce({ text, level: 'info', bubble: [this.stepLine()] })
    else {
      this.setBubble([this.stepLine()], false, -1)
      this.publish()
    }
  }

  afterTool(input: ToolInput, result: unknown): void {
    if (!this.isActive) return
    const tool = String(input.tool)
    if (tool === 'TaskCreate' || tool === 'TaskUpdate' || tool === 'TodoWrite') {
      const ran = typeof result === 'object' && result !== null ? (result as { result?: unknown }).result : undefined
      this.plan.observe(input, ran)
      const stepNumber = this.plan.currentStep()
      const progress = this.plan.progress()
      if (stepNumber !== undefined && stepNumber !== this.lastStepNumber && progress?.current) {
        this.lastStepNumber = stepNumber
        const text = this.s.planStep(stepNumber, progress.total, progress.current)
        this.step = text
        this.announce({ text: this.lang === 'en' ? `Next step: ${progress.current}.` : `Nächster Schritt: ${progress.current}.`, level: 'info', bubble: [text] })
      }
      this.publish()
      return
    }
    const outcome = typeof result === 'object' && result !== null ? (result as { deny?: string; isError?: boolean }) : {}
    const needsYou = describeTool(input).needsYou
    if (needsYou || this.permissionTool === input.tool_use_id || this.mood === 'attention') {
      this.attention = undefined
      this.permissionTool = undefined
      this.setMood('working')
    }
    if ((outcome.deny || outcome.isError) && this.settings.verbosity === 'chatty' && this.step) {
      this.announce({ text: this.s.failed(this.step), level: 'info', bubble: [this.s.failed(this.step)] })
    }
    this.publish()
  }

  onNotification(e: { notification_type?: string; message?: string }): void {
    if (!this.isActive) return
    const kind = e.notification_type ?? ''
    if (kind === 'permission_prompt') {
      const detail = this.lastToolInput ? permissionDetail(this.lastToolInput) : truncate(e.message ?? '', 80)
      this.attention = this.s.permission(detail)
      this.permissionTool = this.lastToolInput?.tool_use_id
      this.setMood('attention')
      this.announce({ text: line(this.style, this.lang, 'permission'), level: 'urgent', sound: 'attention', bubble: [this.attention], notify: true })
    } else if (kind === 'agent_needs_input' || kind === 'elicitation_dialog') {
      this.attention = truncate(e.message ?? this.s.question, 120)
      this.setMood('attention')
      this.announce({ text: line(this.style, this.lang, 'question'), level: 'urgent', sound: 'attention', bubble: [this.attention], notify: true })
    } else if (kind === 'idle_prompt' && !this.isTurnRunning) {
      this.announce({ text: waitingLine(this.style, this.lang, speakableProject(this.project)), level: 'info', sound: 'message', bubble: [this.s.sessionWaits(this.project)] })
    }
  }

  onTurnComplete(e: { reason: string; answer: string; durationMs: number; agentId?: string }): void {
    if (!this.isActive || e.agentId) return
    this.isTurnRunning = false
    this.mainTurnId = undefined
    this.attention = undefined
    const wasVoice = this.isVoiceTurn
    this.isVoiceTurn = false
    const wasStopped = this.isStopRequested
    this.isStopRequested = false
    const lastStep = this.step
    this.step = undefined
    this.stepVerb = undefined
    if (e.reason === 'answer') {
      this.lastAnswer = e.answer ?? ''
      this.setMood('success')
      const minutes = Math.round(e.durationMs / 60_000)
      const isLong = e.durationMs > 45_000
      const intro = speakableIntro(this.lastAnswer)
      if ((wasVoice || this.settings.voiceMode) && intro) {
        this.announce({ text: intro, level: 'reply', sound: 'done', bubble: [intro], notify: isLong })
      } else {
        const text = minutes >= 2 ? doneLongLine(this.style, this.lang, minutes) : line(this.style, this.lang, 'done')
        this.announce({ text, level: 'milestone', sound: 'done', bubble: [text, lastStep ?? ''].filter(Boolean), notify: isLong })
      }
    } else if (e.reason === 'aborted') {
      this.setMood('idle')
      if (!wasStopped) this.setBubble([line(this.style, this.lang, 'aborted')], false, 4000)
    } else {
      this.setMood('error')
      const text = line(this.style, this.lang, 'error')
      this.announce({ text, level: 'milestone', sound: 'error', bubble: [text], notify: true })
    }
    this.publish()
  }

  // ------------------------------------------------------------------ Hilfen

  log(text: string): void {
    this.io?.log(`avatar: ${text}`)
  }

  safely(fn: () => void | Promise<void>): void {
    try {
      const result = fn()
      if (result instanceof Promise) result.catch(error => this.log(errorText(error)))
    } catch (error) {
      this.log(errorText(error))
    }
  }

  stepLine(): string {
    const plan = this.plan.progress()
    const parts = [this.project]
    if (plan) parts.push(`${plan.done}/${plan.total}`)
    if (this.step) parts.push(this.step)
    return parts.join(' · ')
  }
}

function formatTime(iso: string, lang: Lang): string | undefined {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toLocaleTimeString(lang === 'en' ? 'en-GB' : 'de-DE', { hour: '2-digit', minute: '2-digit' })
}
