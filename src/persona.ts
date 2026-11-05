// Persönlichkeiten des Avatars: wie er grüßt, Ergebnisse ansagt und auf
// Smalltalk reagiert. Alle Sätze sind eigene Formulierungen.

import type { Lang } from './i18n'
import { pickOne } from './util'

export type PersonaStyle = 'neon' | 'friendly' | 'concise' | 'formal' | 'butler'

export const PERSONA_STYLES: readonly PersonaStyle[] = ['neon', 'friendly', 'concise', 'formal', 'butler']

type Lines = {
  greet: string[]
  done: string[]
  doneLong: (minutes: number) => string[]
  permission: string[]
  question: string[]
  waiting: (project: string) => string[]
  error: string[]
  aborted: string[]
  thanks: string[]
  hello: string[]
  whoami: (name: string) => string[]
  ack: string[]
  wake: string[]
  idle: string[]
}

type Persona = Record<Lang, Lines>

const neon: Persona = {
  de: {
    greet: ['Systeme online. Ich bin da.', 'Wieder im Netz. Was steht an?', 'Verbindung steht. Leg los.'],
    done: ['Erledigt. Sauber gelaufen.', 'Fertig. Alles im grünen Bereich.', 'Job erledigt.'],
    doneLong: m => [`Fertig nach ${m} Minuten. Sauber gelaufen.`, `${m} Minuten, und durch. Erledigt.`],
    permission: ['Ich brauche deine Freigabe.', 'Dein Zug: Claude wartet auf eine Freigabe.'],
    question: ['Claude hat eine Frage an dich.', 'Rückfrage im Kanal. Schau mal rein.'],
    waiting: p => [`${p} wartet auf dich.`, `${p} hängt in der Warteschleife. Dein Zug.`],
    error: ['Da hat was geknallt.', 'Störung im System. Schau mal rein.'],
    aborted: ['Abgebrochen.', 'Runde gestoppt.'],
    thanks: ['Gern. Dafür bin ich da.', 'Immer doch.', 'Kein Ding.'],
    hello: ['Hey. Ich höre.', 'Bin da. Was brauchst du?'],
    whoami: n => [
      `Ich bin ${n}, deine Verbindung zu Claude Code. Ich sage dir, was läuft, und höre auf Befehle wie „${n}, Status“.`,
    ],
    ack: ['Bin dran.', 'Geht klar.', 'Läuft.'],
    wake: ['Wieder wach.', 'Systeme hochgefahren.'],
    idle: ['Alles ruhig im Netz.', 'Ich halte die Leitung warm.'],
  },
  en: {
    greet: ['Systems online. I’m here.', 'Back on the grid. What’s next?', 'Link is up. Go ahead.'],
    done: ['Done. Clean run.', 'Finished. All green.', 'Job’s done.'],
    doneLong: m => [`Done after ${m} minutes. Clean run.`, `${m} minutes and through. Finished.`],
    permission: ['I need your sign-off.', 'Your move: Claude is waiting for approval.'],
    question: ['Claude has a question for you.', 'Incoming question. Take a look.'],
    waiting: p => [`${p} is waiting for you.`, `${p} is on hold. Your move.`],
    error: ['Something blew up.', 'System glitch. Take a look.'],
    aborted: ['Cancelled.', 'Turn stopped.'],
    thanks: ['Anytime.', 'That’s what I’m here for.', 'No problem.'],
    hello: ['Hey. I’m listening.', 'Right here. What do you need?'],
    whoami: n => [
      `I’m ${n}, your link to Claude Code. I tell you what’s going on and listen for commands like “${n}, status”.`,
    ],
    ack: ['On it.', 'Got it.', 'Running.'],
    wake: ['Awake again.', 'Systems back up.'],
    idle: ['All quiet on the grid.', 'Keeping the line warm.'],
  },
}

const friendly: Persona = {
  de: {
    greet: ['Hallo! Ich bin da.', 'Schön, dass du da bist. Was machen wir?'],
    done: ['Fertig!', 'Geschafft, alles erledigt.'],
    doneLong: m => [`Fertig nach ${m} Minuten!`],
    permission: ['Claude braucht kurz deine Freigabe.'],
    question: ['Claude möchte dich etwas fragen.'],
    waiting: p => [`${p} wartet auf dich.`],
    error: ['Oh, da ist etwas schiefgegangen.'],
    aborted: ['Okay, abgebrochen.'],
    thanks: ['Gern geschehen!', 'Sehr gern!'],
    hello: ['Hallo! Ich höre zu.'],
    whoami: n => [`Ich bin ${n} und helfe dir, den Überblick über Claude Code zu behalten.`],
    ack: ['Mache ich.', 'Alles klar.'],
    wake: ['Guten Morgen!'],
    idle: ['Alles ruhig gerade.'],
  },
  en: {
    greet: ['Hi! I’m here.', 'Good to see you. What are we doing?'],
    done: ['Done!', 'All finished.'],
    doneLong: m => [`Done after ${m} minutes!`],
    permission: ['Claude needs your approval for a moment.'],
    question: ['Claude would like to ask you something.'],
    waiting: p => [`${p} is waiting for you.`],
    error: ['Oh, something went wrong.'],
    aborted: ['Okay, cancelled.'],
    thanks: ['You’re welcome!', 'Happy to help!'],
    hello: ['Hi! I’m listening.'],
    whoami: n => [`I’m ${n}, and I help you keep track of Claude Code.`],
    ack: ['Will do.', 'All right.'],
    wake: ['Good morning!'],
    idle: ['All quiet right now.'],
  },
}

const concise: Persona = {
  de: {
    greet: ['Bereit.'],
    done: ['Fertig.'],
    doneLong: m => [`Fertig, ${m} Minuten.`],
    permission: ['Freigabe nötig.'],
    question: ['Rückfrage.'],
    waiting: p => [`${p} wartet.`],
    error: ['Fehler.'],
    aborted: ['Abgebrochen.'],
    thanks: ['Gern.'],
    hello: ['Ja?'],
    whoami: n => [`${n}, Avatar für Claude Code.`],
    ack: ['Okay.'],
    wake: ['Bereit.'],
    idle: ['Ruhig.'],
  },
  en: {
    greet: ['Ready.'],
    done: ['Done.'],
    doneLong: m => [`Done, ${m} minutes.`],
    permission: ['Approval needed.'],
    question: ['Question.'],
    waiting: p => [`${p} waiting.`],
    error: ['Error.'],
    aborted: ['Cancelled.'],
    thanks: ['Sure.'],
    hello: ['Yes?'],
    whoami: n => [`${n}, avatar for Claude Code.`],
    ack: ['Okay.'],
    wake: ['Ready.'],
    idle: ['Quiet.'],
  },
}

const formal: Persona = {
  de: {
    greet: ['Guten Tag. Ich stehe bereit.'],
    done: ['Die Aufgabe ist abgeschlossen.'],
    doneLong: m => [`Die Aufgabe ist nach ${m} Minuten abgeschlossen.`],
    permission: ['Es wird Ihre Freigabe benötigt.'],
    question: ['Claude hat eine Rückfrage an Sie.'],
    waiting: p => [`${p} wartet auf Ihre Eingabe.`],
    error: ['Es ist ein Fehler aufgetreten.'],
    aborted: ['Der Vorgang wurde abgebrochen.'],
    thanks: ['Sehr gern.'],
    hello: ['Ich höre.'],
    whoami: n => [`Mein Name ist ${n}. Ich begleite Ihre Arbeit mit Claude Code.`],
    ack: ['Wird erledigt.'],
    wake: ['Ich stehe wieder bereit.'],
    idle: ['Es gibt nichts Neues.'],
  },
  en: {
    greet: ['Good day. I am at your service.'],
    done: ['The task is complete.'],
    doneLong: m => [`The task completed after ${m} minutes.`],
    permission: ['Your approval is required.'],
    question: ['Claude has a question for you.'],
    waiting: p => [`${p} is awaiting your input.`],
    error: ['An error has occurred.'],
    aborted: ['The operation was cancelled.'],
    thanks: ['You are welcome.'],
    hello: ['I am listening.'],
    whoami: n => [`My name is ${n}. I accompany your work with Claude Code.`],
    ack: ['It will be done.'],
    wake: ['I am ready again.'],
    idle: ['Nothing new to report.'],
  },
}

const butler: Persona = {
  de: {
    greet: ['Zu Diensten.', 'Willkommen zurück. Alle Systeme bereit.'],
    done: ['Erledigt, wie gewünscht.', 'Sehr wohl, die Aufgabe ist abgeschlossen.'],
    doneLong: m => [`Nach ${m} Minuten erledigt, wie gewünscht.`],
    permission: ['Verzeihung, Ihre Freigabe wird benötigt.'],
    question: ['Claude erbittet eine Antwort von Ihnen.'],
    waiting: p => [`${p} erwartet Sie.`],
    error: ['Ich fürchte, es gab ein Problem.'],
    aborted: ['Wie gewünscht, abgebrochen.'],
    thanks: ['Stets zu Diensten.', 'Es ist mir eine Freude.'],
    hello: ['Sie wünschen?'],
    whoami: n => [`${n}, zu Diensten. Ich halte Sie über Claude Code auf dem Laufenden.`],
    ack: ['Sehr wohl.', 'Wird umgehend erledigt.'],
    wake: ['Zu Diensten.'],
    idle: ['Alles in bester Ordnung.'],
  },
  en: {
    greet: ['At your service.', 'Welcome back. All systems ready.'],
    done: ['Done, as requested.', 'Very good, the task is complete.'],
    doneLong: m => [`Completed after ${m} minutes, as requested.`],
    permission: ['Pardon me, your approval is required.'],
    question: ['Claude requests an answer from you.'],
    waiting: p => [`${p} awaits you.`],
    error: ['I’m afraid there was a problem.'],
    aborted: ['As you wish, cancelled.'],
    thanks: ['Always at your service.', 'My pleasure.'],
    hello: ['You called?'],
    whoami: n => [`${n}, at your service. I keep you informed about Claude Code.`],
    ack: ['Very good.', 'Right away.'],
    wake: ['At your service.'],
    idle: ['Everything is in order.'],
  },
}

const PERSONAS: Record<PersonaStyle, Persona> = { neon, friendly, concise, formal, butler }

export type LineKey = Exclude<keyof Lines, 'doneLong' | 'waiting' | 'whoami'>

export function line(style: PersonaStyle, lang: Lang, key: LineKey): string {
  return pickOne(PERSONAS[style][lang][key]) ?? ''
}

export function doneLongLine(style: PersonaStyle, lang: Lang, minutes: number): string {
  return pickOne(PERSONAS[style][lang].doneLong(minutes)) ?? ''
}

export function waitingLine(style: PersonaStyle, lang: Lang, project: string): string {
  return pickOne(PERSONAS[style][lang].waiting(project)) ?? ''
}

export function whoamiLine(style: PersonaStyle, lang: Lang, name: string): string {
  return pickOne(PERSONAS[style][lang].whoami(name)) ?? ''
}

export function isPersonaStyle(value: unknown): value is PersonaStyle {
  return typeof value === 'string' && (PERSONA_STYLES as readonly string[]).includes(value)
}
