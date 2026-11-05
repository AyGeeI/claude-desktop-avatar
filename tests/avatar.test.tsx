// Tests der Mod „avatar“ gegen die Engine (claude plugin test .).
// Unter der Mod steht hier eine kleine Welt aus dem Speicher: Dateisystem,
// Uhr, Speicher und Umgebung. Windows fehlt, also bleibt der Desktop-Begleiter
// aus und die Seitenleiste öffnet sich.

import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { describe, expect, mock, test } from 'claude-code/testing'
import { addressed, intentOf, parseSlash } from '../src/commands'
import { inQuietHours } from '../src/settings'
import { composeFrame, over, parseColor, validateManifest, validatePixel, type LoadedTemplate } from '../src/templates'
import { describeTool, PlanTracker } from '../src/tools'
import { plainSpeech, speakableIntro, speakableProject } from '../src/util'

const MANIFEST = {
  formatVersion: 1,
  id: 'cda.vela',
  version: '1.0.0',
  name: { de: 'Vela', en: 'Vela' },
  author: 'test',
  license: 'CC-BY-4.0',
  parameters: { glow: { type: 'color', default: '#00e5ff' } },
  states: { idle: {}, working: { fallback: 'idle' } },
  pixel: { file: 'pixel.json' },
  persona: { style: 'neon' },
}

const PIXEL = {
  width: 4,
  height: 4,
  palette: { '.': 'transparent', a: { param: 'glow' }, h: { param: 'glow', alpha: 0.5 } },
  frames: { i0: ['.aa.', 'aaaa', 'aaaa', '.aa.'], h0: ['hhhh', '....', '....', '....'] },
  states: { idle: { frames: ['i0'], fps: 2 } },
}

type World = { files: Map<string, string>; spoken: string[]; opened: string[]; statuses: Array<string | undefined> }

const norm = (path: string) => path.replace(/\\/g, '/')

/** Ein Befehl, getippt im Terminal. */
const TYPED = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const

/** Die Welt unter der Mod: Dateien im Speicher, Uhr, Speicher, Umgebung, Oberfläche. */
function world(on: On): World & { clock: ReturnType<typeof mock.clock> } {
  const files = new Map<string, string>()
  const spoken: string[] = []
  const opened: string[] = []
  const statuses: Array<string | undefined> = []
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  mock.store(on)
  mock.env(on, { HOME: '/home/test' })
  on('command.register', () => ({ value: { command: 'avatar' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.repo', () => ({ value: { root: '/work/webshop-api', name: 'webshop-api', remote: null, internal: false } }))
  on('settings.read', () => ({ value: {} }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: { isSent: true, channel: 'terminal_bell' } }))
  on('audio.speak', (_, e) => {
    spoken.push(e.text)
    return { value: { via: 'system' } }
  })
  on('audio.play', () => ({ value: undefined }))
  on('fs.write', (_, e) => {
    files.set(norm(e.path), e.text)
    return { value: undefined }
  })
  on('fs.read', (_, e) => {
    const path = norm(e.path)
    if (path.endsWith('/templates/vela/avatar.json')) return { value: JSON.stringify(MANIFEST) }
    if (path.endsWith('/templates/vela/pixel.json')) return { value: JSON.stringify(PIXEL) }
    const text = files.get(path)
    if (text === undefined) throw new Error(`ENOENT: ${path}`)
    return { value: text }
  })
  on('fs.list', (_, e) => {
    const path = norm(e.path)
    if (path.endsWith('/templates') && !path.includes('.claude-desktop-avatar')) {
      return { value: [{ name: 'vela', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] }
    }
    const prefix = path.endsWith('/') ? path : `${path}/`
    const names = [...files.keys()].filter(one => one.startsWith(prefix) && !one.slice(prefix.length).includes('/'))
    return { value: names.map(one => ({ name: one.slice(prefix.length), kind: 'file', size: 1, mtimeMs: clock.now(), isLink: false })) }
  })
  on('tool.call', () => ({ result: {} }))
  return { files, spoken, opened, statuses, clock }
}

async function startSession($: Engine, w: ReturnType<typeof world>): Promise<void> {
  await $.session.start({ cwd: '/work/webshop-api', surface: 'desktop', isInteractive: true })
  await w.clock.advance(300)
}

const PANE = (surface: 'terminal' | 'desktop') =>
  ({
    plugin: 'avatar',
    component: 'Pane',
    requestId: 'avatar',
    surface,
    props: {
      title: 'Vela',
      isFocused: false,
      bodyColumns: 44,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 30 },
      view: {},
    },
  }) as const

describe('Sitzung', () => {
  test('ohne Windows öffnet sich die Seitenleiste mit Vela', async ($, on) => {
    const w = world(on)
    await startSession($, w)
    expect(w.opened).toContain('avatar')
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount(PANE(surface))
      const title = await ui.find({ type: 'Text', text: /Vela/ })
      expect(title?.text).toContain('Vela')
      await ui.unmount()
    }
  })

  test('ein Werkzeugaufruf wird zum angezeigten Schritt', async ($, on) => {
    const w = world(on)
    await startSession($, w)
    await $.tool.call({ tool: 'Read', file_path: '/work/webshop-api/src/app.ts' })
    await w.clock.advance(300)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount(PANE(surface))
      const step = await ui.find({ type: 'Text', text: /app\.ts/ })
      expect(step?.text).toContain('Liest app.ts')
      await ui.unmount()
    }
    expect(w.statuses.some(one => typeof one === 'string' && one.includes('Vela'))).toBe(true)
  })

  test('/avatar leise speichert die Ausführlichkeit für alle Sitzungen', async ($, on) => {
    const w = world(on)
    await startSession($, w)
    const result = await $.command.run({ command: 'avatar', args: 'leise', ...TYPED })
    expect(result.text).toContain('leise')
    const status = await $.command.run({ command: 'avatar', args: 'status', ...TYPED })
    expect(status.text).toContain('Webshop API')
  })

  test('„Vela, status“ beantwortet der Avatar selbst', async ($, on) => {
    const w = world(on)
    await startSession($, w)
    const result = await $.prompt.submit({ text: 'Vela, status', wait: false, origin: { kind: 'composer' } })
    expect(result.drop).toContain('Vela:')
    expect(w.spoken.length).toBeGreaterThan(0)
  })

  test('ein gewöhnlicher Auftrag geht unverändert weiter', async ($, on) => {
    const w = world(on)
    on('prompt.submit', (_, e) => ({ text: e.text }))
    await startSession($, w)
    const result = await $.prompt.submit({ text: 'Bitte die Tests reparieren', wait: false, origin: { kind: 'composer' } })
    expect(result.drop).toBeUndefined()
    expect(result.text).toBe('Bitte die Tests reparieren')
  })
})

describe('Reine Logik', () => {
  test('Befehle an den Avatar werden erkannt', () => {
    expect(addressed('Vela, was machst du gerade?', 'Vela')).toEqual({ isAddressed: true, rest: 'was machst du gerade?' })
    expect(addressed('Bitte baue das Projekt', 'Vela').isAddressed).toBe(false)
    expect(intentOf('stopp')?.kind).toBe('stop')
    expect(intentOf('fass zusammen')?.kind).toBe('summary')
    expect(intentOf('refaktoriere die Datenbankschicht')).toBeUndefined()
    expect(parseSlash('gesprächig')).toEqual({ kind: 'verbosity', value: 'chatty' })
  })

  test('Ruhezeiten über Mitternacht', () => {
    const at = (hour: number) => new Date(2026, 0, 1, hour, 30)
    expect(inQuietHours('22-7', at(23))).toBe(true)
    expect(inQuietHours('22-7', at(6))).toBe(true)
    expect(inQuietHours('22-7', at(12))).toBe(false)
    expect(inQuietHours('', at(23))).toBe(false)
  })

  test('Werkzeuge werden zu Schritten', () => {
    expect(describeTool({ tool: 'Bash', command: 'npm test' }).bundleKey).toBe('tests')
    expect(describeTool({ tool: 'Bash', command: 'git push origin main' }).bundleKey).toBe('git-push')
    expect(describeTool({ tool: 'AskUserQuestion' }).needsYou).toBe('question')
    const plan = new PlanTracker()
    plan.observe({ tool: 'TodoWrite', todos: [{ content: 'A', status: 'completed' }, { content: 'B', status: 'in_progress' }, { content: 'C', status: 'pending' }] }, undefined)
    expect(plan.progress()).toEqual({ done: 1, total: 3, current: 'B' })
  })

  test('Vorlagen werden geprüft und durchscheinend gemischt', () => {
    expect(validateManifest(MANIFEST as never)).toEqual([])
    expect(validatePixel(PIXEL as never)).toEqual([])
    expect(validatePixel({ ...PIXEL, frames: { i0: ['.aa', 'aaaa', 'aaaa', '.aa.'] } } as never).length).toBeGreaterThan(0)
    const template = { dir: '/t', manifest: MANIFEST, pixel: PIXEL } as unknown as LoadedTemplate
    const colors = new Map<string, number>([
      ['.', 0],
      ['a', parseColor('#00e5ff')],
      ['h', parseColor('#ff000080')],
    ])
    const pixels = composeFrame(template, colors, ['i0', 'h0'])
    expect(pixels[1]).toBe(over(parseColor('#ff000080'), parseColor('#00e5ff')))
    expect(pixels[0]! >>> 24).toBe(0x80)
  })

  test('Sprache: Markdown fällt weg, Projektnamen klingen natürlich', () => {
    expect(plainSpeech('**Fertig**: `npm test` läuft.')).toBe('Fertig: npm test läuft.')
    expect(speakableProject('webshop-api')).toBe('Webshop API')
    expect(speakableIntro('Erledigt. Die Tests laufen wieder.\n\n```ts\ncode\n```')).toBe('Erledigt. Die Tests laufen wieder.')
  })
})
