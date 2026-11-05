// Alle Texte der Oberfläche und des Erzählers, auf Deutsch und Englisch.
// Persönlichkeitsabhängige Sätze stehen in persona.ts.

import type { AvatarMood } from '../types'

export type Lang = 'de' | 'en'

export type Strings = {
  mood: Record<AvatarMood, string>
  read: (file: string) => string
  readMany: (n: number) => string
  write: (file: string) => string
  edit: (file: string) => string
  editMany: (n: number) => string
  tests: string
  build: string
  install: string
  lint: string
  git: (sub: string) => string
  shell: (command: string) => string
  grep: (pattern: string) => string
  glob: (pattern: string) => string
  webSearch: (query: string) => string
  webFetch: (host: string) => string
  agent: (description: string) => string
  mcp: (server: string, tool: string) => string
  skill: (name: string) => string
  question: string
  planReady: string
  tool: (name: string) => string
  planStep: (n: number, m: number, text: string) => string
  failed: (text: string) => string
  subagent: string
  permission: (detail: string) => string
  waiting: string
  sessionWaits: (project: string) => string
  otherSessions: string
  noOtherSessions: string
  lastSaid: string
  speakableHint: string
  help: (name: string) => string
  setupMarkdown: (info: SetupInfo) => string
  verbosityLabel: Record<'quiet' | 'normal' | 'chatty', string>
  verbositySet: (label: string) => string
  voiceModeSet: (on: boolean) => string
  speechSet: (on: boolean) => string
  desktopSet: (on: boolean) => string
  ghostSet: (on: boolean) => string
  templateSet: (name: string) => string
  stopped: string
  nothingToStop: string
  noAnswerYet: string
  statusIntro: (count: number) => string
  sessionLine: (project: string, mood: string, step?: string) => string
  usage: (parts: string[]) => string
  usageUnknown: string
  usageWindow: (kind: string, percent: number, resets?: string) => string
  companion: Record<'off' | 'starting' | 'running' | 'failed' | 'unsupported', string>
  ui: {
    status: string
    look: string
    setup: string
    back: string
    voiceMode: string
    speech: string
    desktop: string
    on: string
    off: string
    template: string
    size: string
    style: string
    voiceDe: string
    voiceEn: string
    automatic: string
    name: string
    rename: string
    test: string
    restart: string
  }
  styleLabel: Record<string, string>
  testLine: (name: string) => string
}

export type SetupInfo = {
  name: string
  companion: string
  voices: string[]
  language: Lang
}

const de: Strings = {
  mood: {
    idle: 'bereit',
    thinking: 'denkt nach',
    working: 'arbeitet',
    speaking: 'spricht',
    attention: 'braucht dich',
    success: 'fertig',
    error: 'Fehler',
    sleeping: 'schläft',
  },
  read: file => `Liest ${file}`,
  readMany: n => `Liest ${n} Dateien`,
  write: file => `Erstellt ${file}`,
  edit: file => `Bearbeitet ${file}`,
  editMany: n => `Bearbeitet ${n} Dateien`,
  tests: 'Führt die Tests aus',
  build: 'Baut das Projekt',
  install: 'Installiert Abhängigkeiten',
  lint: 'Prüft den Code',
  git: sub => `Git: ${sub}`,
  shell: command => `Führt aus: ${command}`,
  grep: pattern => `Durchsucht das Projekt nach „${pattern}“`,
  glob: pattern => `Sucht Dateien: ${pattern}`,
  webSearch: query => `Recherchiert: „${query}“`,
  webFetch: host => `Liest ${host}`,
  agent: description => `Startet Hilfsagent: ${description}`,
  mcp: (server, tool) => `Nutzt ${server}: ${tool}`,
  skill: name => `Nutzt Skill ${name}`,
  question: 'Claude hat eine Frage an dich',
  planReady: 'Plan zur Freigabe bereit',
  tool: name => `Nutzt ${name}`,
  planStep: (n, m, text) => `Schritt ${n}/${m} · ${text}`,
  failed: text => `Fehlgeschlagen: ${text}`,
  subagent: 'Hilfsagent · ',
  permission: detail => `Freigabe nötig: ${detail}`,
  waiting: 'Wartet auf dich',
  sessionWaits: project => `${project} wartet auf dich`,
  otherSessions: 'Andere Sitzungen',
  noOtherSessions: 'Keine anderen Sitzungen offen.',
  lastSaid: 'Zuletzt',
  speakableHint:
    'Hinweis des Desktop-Avatars: Die Person spricht gerade per Sprache mit dir und hört deine Antwort. ' +
    'Beginne mit ein bis zwei kurzen, gut vorlesbaren Sätzen ohne Markdown, Code oder Aufzählungen. Details danach.',
  help: name =>
    [
      `**${name} – Befehle** (gesprochen mit „${name}, …“ oder als \`/avatar …\`)`,
      '',
      '- **Status** – Überblick über alle offenen Sitzungen',
      '- **Stopp** – laufende Runde abbrechen',
      '- **Leiser** / **Lauter** / **Still** – Ausführlichkeit',
      '- **Was machst du gerade?** – ein Satz zum aktuellen Stand',
      '- **Zusammenfassung** – die letzte Antwort in zwei Sätzen',
      '- **Wiederholen** – letzte Ansage noch einmal',
      '- **Kontingent** – Nutzungslimits deines Abos',
      '- **Versteck dich** / **Zeig dich** – Desktop-Avatar aus- oder einblenden',
      '- **Sprachmodus an/aus** – Antworten vorlesen',
      '',
      'Weitere Befehle: `/avatar aussehen`, `/avatar einrichten`, `/avatar geist`, `/avatar test`, `/avatar neustart`.',
    ].join('\n'),
  setupMarkdown: info =>
    [
      `## ${info.name} einrichten`,
      '',
      `**Desktop-Avatar:** ${info.companion}`,
      '',
      '**Spracheingabe mit `/voice`** (einmalig):',
      '1. In Claude Code `/voice tap` eingeben: antippen, sprechen, erneut antippen – ab drei Wörtern wird automatisch gesendet.',
      '2. Oder `/voice hold` und in den Einstellungen `"voice": { "autoSubmit": true }` setzen.',
      '3. Sprache: in den Einstellungen `"language": "german"` – das gilt auch für Claudes Antworten.',
      '4. Mikrofon unter Windows freigeben: Einstellungen → Datenschutz und Sicherheit → Mikrofon.',
      `5. Sprich mit dem Avatar über seinen Namen: „${info.name}, Status“, „${info.name}, stopp“.`,
      '',
      'Hinweis: `/voice` überträgt das Audio zur Umwandlung in Text an Anthropic.',
      '',
      `**Gefundene Stimmen:** ${info.voices.length > 0 ? info.voices.join(', ') : 'noch keine Rückmeldung vom Desktop-Avatar'}`,
      '',
      '**Am Desktop-Avatar:** Klick öffnet das Eingabefeld, Doppelklick sagt den Status an, Rechtsklick öffnet das Menü, Mausrad ändert die Größe. Das Tastenkürzel (Standard Strg+Alt+Leertaste) öffnet die Eingabe von überall.',
    ].join('\n'),
  verbosityLabel: { quiet: 'leise', normal: 'normal', chatty: 'gesprächig' },
  verbositySet: label => `Ausführlichkeit: ${label}.`,
  voiceModeSet: on => (on ? 'Sprachmodus an: Ich lese Antworten vor.' : 'Sprachmodus aus.'),
  speechSet: on => (on ? 'Sprachausgabe an.' : 'Sprachausgabe aus.'),
  desktopSet: on => (on ? 'Desktop-Avatar eingeblendet.' : 'Desktop-Avatar ausgeblendet.'),
  ghostSet: on =>
    on
      ? 'Geistermodus an: Klicks gehen durch den Avatar hindurch. Das Tastenkürzel oder „/avatar geist“ schaltet ihn wieder aus.'
      : 'Geistermodus aus.',
  templateSet: name => `Vorlage: ${name}.`,
  stopped: 'Abgebrochen.',
  nothingToStop: 'Gerade läuft nichts, das ich abbrechen könnte.',
  noAnswerYet: 'Es gibt noch keine Antwort, die ich zusammenfassen könnte.',
  statusIntro: count =>
    count === 0 ? 'Keine Sitzung aktiv.' : count === 1 ? 'Eine Sitzung ist offen.' : `${count} Sitzungen sind offen.`,
  sessionLine: (project, mood, step) => (step ? `${project}: ${mood}, ${step}.` : `${project}: ${mood}.`),
  usage: parts => parts.join(' '),
  usageUnknown: 'Zu deinen Nutzungslimits habe ich gerade keine Angaben.',
  usageWindow: (kind, percent, resets) =>
    `${kind}: ${Math.round(percent)} Prozent genutzt${resets ? `, zurückgesetzt um ${resets}` : ''}.`,
  companion: {
    off: 'aus',
    starting: 'startet …',
    running: 'läuft',
    failed: 'konnte nicht starten – siehe Hinweis',
    unsupported: 'nur unter Windows verfügbar',
  },
  ui: {
    status: 'Status',
    look: 'Aussehen',
    setup: 'Einrichten',
    back: 'Zurück',
    voiceMode: 'Sprachmodus',
    speech: 'Sprache',
    desktop: 'Desktop',
    on: 'an',
    off: 'aus',
    template: 'Vorlage',
    size: 'Größe',
    style: 'Stil',
    voiceDe: 'Stimme Deutsch',
    voiceEn: 'Stimme Englisch',
    automatic: 'automatisch',
    name: 'Name',
    rename: 'Umbenennen',
    test: 'Test',
    restart: 'Neustart',
  },
  styleLabel: {
    neon: 'Neon (Netz-KI)',
    friendly: 'Freundlich',
    concise: 'Knapp',
    formal: 'Förmlich',
    butler: 'Butler',
  },
  testLine: name => `Hier ist ${name}. Systemtest läuft. Ton, Stimme und Animation sind bereit.`,
}

const en: Strings = {
  mood: {
    idle: 'ready',
    thinking: 'thinking',
    working: 'working',
    speaking: 'speaking',
    attention: 'needs you',
    success: 'done',
    error: 'error',
    sleeping: 'asleep',
  },
  read: file => `Reading ${file}`,
  readMany: n => `Reading ${n} files`,
  write: file => `Creating ${file}`,
  edit: file => `Editing ${file}`,
  editMany: n => `Editing ${n} files`,
  tests: 'Running the tests',
  build: 'Building the project',
  install: 'Installing dependencies',
  lint: 'Checking the code',
  git: sub => `Git: ${sub}`,
  shell: command => `Running: ${command}`,
  grep: pattern => `Searching the project for “${pattern}”`,
  glob: pattern => `Finding files: ${pattern}`,
  webSearch: query => `Researching: “${query}”`,
  webFetch: host => `Reading ${host}`,
  agent: description => `Starting subagent: ${description}`,
  mcp: (server, tool) => `Using ${server}: ${tool}`,
  skill: name => `Using skill ${name}`,
  question: 'Claude has a question for you',
  planReady: 'Plan ready for review',
  tool: name => `Using ${name}`,
  planStep: (n, m, text) => `Step ${n}/${m} · ${text}`,
  failed: text => `Failed: ${text}`,
  subagent: 'Subagent · ',
  permission: detail => `Approval needed: ${detail}`,
  waiting: 'Waiting for you',
  sessionWaits: project => `${project} is waiting for you`,
  otherSessions: 'Other sessions',
  noOtherSessions: 'No other sessions open.',
  lastSaid: 'Last',
  speakableHint:
    'Note from the desktop avatar: the person is talking to you by voice and will hear your answer. ' +
    'Start with one or two short sentences that read well aloud, without Markdown, code or lists. Details after that.',
  help: name =>
    [
      `**${name} – commands** (spoken as “${name}, …” or typed as \`/avatar …\`)`,
      '',
      '- **Status** – overview of all open sessions',
      '- **Stop** – cancel the running turn',
      '- **Quieter** / **Louder** / **Mute** – verbosity',
      '- **What are you doing?** – one sentence on the current state',
      '- **Summary** – the last answer in two sentences',
      '- **Repeat** – say the last announcement again',
      '- **Usage** – your plan’s usage limits',
      '- **Hide** / **Show yourself** – hide or show the desktop avatar',
      '- **Voice mode on/off** – read answers aloud',
      '',
      'More: `/avatar look`, `/avatar setup`, `/avatar ghost`, `/avatar test`, `/avatar restart`.',
    ].join('\n'),
  setupMarkdown: info =>
    [
      `## Setting up ${info.name}`,
      '',
      `**Desktop avatar:** ${info.companion}`,
      '',
      '**Voice input with `/voice`** (once):',
      '1. Type `/voice tap` in Claude Code: tap, speak, tap again – three words or more are sent automatically.',
      '2. Or use `/voice hold` and set `"voice": { "autoSubmit": true }` in your settings.',
      '3. Language: `"language": "english"` in your settings – this also sets Claude’s reply language.',
      '4. Allow the microphone on Windows: Settings → Privacy & security → Microphone.',
      `5. Talk to the avatar by name: “${info.name}, status”, “${info.name}, stop”.`,
      '',
      'Note: `/voice` sends the audio to Anthropic to turn it into text.',
      '',
      `**Voices found:** ${info.voices.length > 0 ? info.voices.join(', ') : 'no answer from the desktop avatar yet'}`,
      '',
      '**On the desktop avatar:** click opens the input, double-click reads the status, right-click opens the menu, the mouse wheel changes the size. The hotkey (default Ctrl+Alt+Space) opens the input from anywhere.',
    ].join('\n'),
  verbosityLabel: { quiet: 'quiet', normal: 'normal', chatty: 'chatty' },
  verbositySet: label => `Verbosity: ${label}.`,
  voiceModeSet: on => (on ? 'Voice mode on: I will read answers aloud.' : 'Voice mode off.'),
  speechSet: on => (on ? 'Speech on.' : 'Speech off.'),
  desktopSet: on => (on ? 'Desktop avatar shown.' : 'Desktop avatar hidden.'),
  ghostSet: on =>
    on
      ? 'Ghost mode on: clicks pass through the avatar. The hotkey or “/avatar ghost” turns it off again.'
      : 'Ghost mode off.',
  templateSet: name => `Template: ${name}.`,
  stopped: 'Cancelled.',
  nothingToStop: 'Nothing is running that I could cancel.',
  noAnswerYet: 'There is no answer yet that I could summarize.',
  statusIntro: count =>
    count === 0 ? 'No session is active.' : count === 1 ? 'One session is open.' : `${count} sessions are open.`,
  sessionLine: (project, mood, step) => (step ? `${project}: ${mood}, ${step}.` : `${project}: ${mood}.`),
  usage: parts => parts.join(' '),
  usageUnknown: 'I have no figures on your usage limits right now.',
  usageWindow: (kind, percent, resets) =>
    `${kind}: ${Math.round(percent)} percent used${resets ? `, resets at ${resets}` : ''}.`,
  companion: {
    off: 'off',
    starting: 'starting …',
    running: 'running',
    failed: 'could not start – see note',
    unsupported: 'available on Windows only',
  },
  ui: {
    status: 'Status',
    look: 'Look',
    setup: 'Setup',
    back: 'Back',
    voiceMode: 'Voice mode',
    speech: 'Speech',
    desktop: 'Desktop',
    on: 'on',
    off: 'off',
    template: 'Template',
    size: 'Size',
    style: 'Style',
    voiceDe: 'German voice',
    voiceEn: 'English voice',
    automatic: 'automatic',
    name: 'Name',
    rename: 'Rename',
    test: 'Test',
    restart: 'Restart',
  },
  styleLabel: {
    neon: 'Neon (net AI)',
    friendly: 'Friendly',
    concise: 'Concise',
    formal: 'Formal',
    butler: 'Butler',
  },
  testLine: name => `This is ${name}. Running a system check. Sound, voice and animation are ready.`,
}

export function strings(lang: Lang): Strings {
  return lang === 'en' ? en : de
}

/** Übersetzt die Fenster-Namen der Nutzungslimits in lesbare Wörter. */
export function usageKindLabel(kind: string, lang: Lang): string {
  const de: Record<string, string> = {
    five_hour: 'Fünf-Stunden-Fenster',
    seven_day: 'Sieben-Tage-Fenster',
    seven_day_opus: 'Sieben-Tage-Fenster für Opus',
    spend_limit: 'Ausgabenlimit',
  }
  const en: Record<string, string> = {
    five_hour: 'Five-hour window',
    seven_day: 'Seven-day window',
    seven_day_opus: 'Seven-day window for Opus',
    spend_limit: 'Spend limit',
  }
  return (lang === 'en' ? en : de)[kind] ?? kind.replace(/_/g, ' ')
}
