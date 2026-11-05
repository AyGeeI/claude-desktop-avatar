// Erkennt Befehle an den Avatar: gesprochen oder getippt mit dem Namen
// davor („Vela, Status“), über das Eingabefeld am Desktop-Avatar oder als
// `/avatar …`. Alles andere geht unverändert an Claude.

export type Intent =
  | { kind: 'status' }
  | { kind: 'stop' }
  | { kind: 'quieter' }
  | { kind: 'louder' }
  | { kind: 'mute' }
  | { kind: 'doing' }
  | { kind: 'summary' }
  | { kind: 'repeat' }
  | { kind: 'usage' }
  | { kind: 'hide' }
  | { kind: 'show' }
  | { kind: 'voiceMode'; on: boolean }
  | { kind: 'thanks' }
  | { kind: 'whoami' }
  | { kind: 'help' }
  | { kind: 'hello' }

export type SlashAction =
  | Intent
  | { kind: 'pane' }
  | { kind: 'look' }
  | { kind: 'setup' }
  | { kind: 'ghost'; on?: boolean }
  | { kind: 'test' }
  | { kind: 'restart' }
  | { kind: 'verbosity'; value: 'quiet' | 'normal' | 'chatty' }
  | { kind: 'speech'; on: boolean }
  | { kind: 'rename'; name: string }
  | { kind: 'template'; id: string }
  | { kind: 'style'; style: string }
  | { kind: 'unknown'; text: string }

const FILLERS = new Set(['bitte', 'mal', 'jetzt', 'doch', 'sofort', 'kurz', 'please', 'now', 'right', 'quickly', 'jetzt bitte'])

const PHRASES: Array<[Intent, string[]]> = [
  [{ kind: 'stop' }, ['stopp', 'stop', 'abbrechen', 'abbruch', 'halt', 'hör auf', 'hoer auf', 'cancel', 'abort', 'stopp das', 'stop that']],
  [
    { kind: 'status' },
    ['status', 'stand', 'wie ist der stand', 'wie stehts', 'wie steht es', 'überblick', 'ueberblick', 'lagebericht', 'lage', 'report', 'status report', 'whats the status', 'what is the status', 'overview', 'update', 'sitrep'],
  ],
  [{ kind: 'quieter' }, ['leiser', 'weniger', 'quieter', 'less', 'weniger reden']],
  [{ kind: 'louder' }, ['lauter', 'mehr', 'gesprächiger', 'gespraechiger', 'louder', 'more', 'mehr reden']],
  [{ kind: 'mute' }, ['still', 'ruhe', 'sei still', 'psst', 'pst', 'mute', 'silence', 'be quiet', 'quiet']],
  [
    { kind: 'doing' },
    ['was machst du', 'was machst du gerade', 'was tust du', 'woran arbeitest du', 'was passiert', 'was läuft', 'was laeuft', 'what are you doing', 'whats happening', 'what is happening', 'what are you working on'],
  ],
  [{ kind: 'summary' }, ['zusammenfassung', 'fass zusammen', 'zusammenfassen', 'kurzfassung', 'summary', 'summarize', 'summarise', 'tldr', 'sum up']],
  [{ kind: 'repeat' }, ['wiederholen', 'wiederhole', 'nochmal', 'noch mal', 'noch einmal', 'repeat', 'say again', 'again', 'pardon']],
  [{ kind: 'usage' }, ['kontingent', 'limit', 'limits', 'nutzung', 'verbrauch', 'wie viel habe ich noch', 'usage', 'quota', 'rate limit', 'rate limits']],
  [{ kind: 'hide' }, ['versteck dich', 'verstecken', 'ausblenden', 'verschwinde', 'hide', 'hide yourself', 'go away']],
  [{ kind: 'show' }, ['zeig dich', 'einblenden', 'komm zurück', 'komm zurueck', 'show yourself', 'show', 'come back']],
  [{ kind: 'voiceMode', on: true }, ['sprachmodus an', 'sprachmodus ein', 'vorlesen an', 'lies vor', 'voice mode on', 'read aloud']],
  [{ kind: 'voiceMode', on: false }, ['sprachmodus aus', 'vorlesen aus', 'voice mode off', 'stop reading']],
  [{ kind: 'thanks' }, ['danke', 'dankeschön', 'danke schön', 'vielen dank', 'merci', 'thanks', 'thank you', 'cheers']],
  [{ kind: 'whoami' }, ['wer bist du', 'stell dich vor', 'who are you', 'introduce yourself']],
  [{ kind: 'help' }, ['hilfe', 'befehle', 'was kannst du', 'help', 'commands', 'what can you do']],
  [{ kind: 'hello' }, ['hallo', 'hi', 'hey', 'servus', 'moin', 'hello', 'yo', 'guten morgen', 'guten tag', 'good morning']],
]

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’`´']/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripFillers(words: string[]): string[] {
  const out = [...words]
  while (out.length > 0 && FILLERS.has(out[out.length - 1]!)) out.pop()
  while (out.length > 0 && FILLERS.has(out[0]!)) out.shift()
  return out
}

/** Erkennt einen Befehl, wenn der Text genau ein Befehl ist (höchstens ein paar Füllwörter dazu). */
export function intentOf(text: string): Intent | undefined {
  const words = stripFillers(normalize(text).split(' ').filter(Boolean))
  if (words.length === 0) return undefined
  const joined = words.join(' ')
  for (const [intent, phrases] of PHRASES) {
    for (const phrase of phrases) {
      if (joined === phrase) return intent
      if (joined.startsWith(phrase + ' ')) {
        const rest = joined.slice(phrase.length + 1).split(' ')
        if (rest.length <= 2 && phrase.split(' ').length >= 2) return intent
      }
    }
  }
  return undefined
}

/**
 * Prüft, ob der Text an den Avatar gerichtet ist („Vela, …“, „Hey Vela …“),
 * und liefert den Rest ohne Anrede.
 */
export function addressed(text: string, name: string): { isAddressed: boolean; rest: string } {
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!escaped) return { isAddressed: false, rest: text }
  const pattern = new RegExp(`^\\s*(?:(?:hey|hi|hallo|ok|okay|yo|hej)[\\s,]+)?${escaped}(?:[\\s,:;!.?\\-–—]+|$)`, 'iu')
  const match = pattern.exec(text)
  if (!match) return { isAddressed: false, rest: text }
  return { isAddressed: true, rest: text.slice(match[0].length).trim() }
}

/** Liest die Argumente von `/avatar …`. */
export function parseSlash(args: string): SlashAction {
  const raw = args.trim()
  const words = normalize(raw).split(' ').filter(Boolean)
  const head = words[0] ?? ''
  const tail = words.slice(1).join(' ')
  const onOff = (value: string): boolean | undefined =>
    ['an', 'ein', 'on', 'true', '1', 'ja', 'yes'].includes(value) ? true : ['aus', 'off', 'false', '0', 'nein', 'no'].includes(value) ? false : undefined

  switch (head) {
    case '':
      return { kind: 'pane' }
    case 'aussehen':
    case 'look':
    case 'design':
      return { kind: 'look' }
    case 'einrichten':
    case 'setup':
      return { kind: 'setup' }
    case 'geist':
    case 'ghost': {
      const on = onOff(tail)
      return on === undefined ? { kind: 'ghost' } : { kind: 'ghost', on }
    }
    case 'test':
      return { kind: 'test' }
    case 'neustart':
    case 'restart':
      return { kind: 'restart' }
    case 'leise':
    case 'quiet':
    case 'still':
      return { kind: 'verbosity', value: 'quiet' }
    case 'normal':
      return { kind: 'verbosity', value: 'normal' }
    case 'gesprächig':
    case 'gespraechig':
    case 'chatty':
      return { kind: 'verbosity', value: 'chatty' }
    case 'sprache':
    case 'sprachmodus':
    case 'voice': {
      const on = onOff(tail.replace(/^mode\s*/, ''))
      return on === undefined ? { kind: 'unknown', text: raw } : { kind: 'voiceMode', on }
    }
    case 'ton':
    case 'speech':
    case 'stimme': {
      const on = onOff(tail)
      return on === undefined ? { kind: 'unknown', text: raw } : { kind: 'speech', on }
    }
    case 'zeigen':
    case 'show':
      return { kind: 'show' }
    case 'verstecken':
    case 'hide':
      return { kind: 'hide' }
    case 'name':
    case 'umbenennen':
    case 'rename': {
      const name = raw.split(/\s+/).slice(1).join(' ').trim()
      return name ? { kind: 'rename', name } : { kind: 'unknown', text: raw }
    }
    case 'vorlage':
    case 'template':
      return tail ? { kind: 'template', id: raw.split(/\s+/)[1] ?? tail } : { kind: 'look' }
    case 'stil':
    case 'style':
      return tail ? { kind: 'style', style: tail } : { kind: 'look' }
    default: {
      const intent = intentOf(raw)
      return intent ?? { kind: 'unknown', text: raw }
    }
  }
}
