// Einstieg der Mod „avatar“: registriert alle Hooks und verbindet sie mit
// dem Controller. Jeder Hook reicht an `next(e)` weiter; Fehler der Mod
// dürfen die Sitzung nie stören.
//
// `$` wird nie weitergereicht. Der Controller erreicht die Engine über das
// Objekt `io`, dessen Funktionen `$` hier jeweils direkt aufrufen.

import type { Register } from 'claude-code'
import { atom, update } from 'claude-code'
import { Controller, EMPTY_VIEW, FIRST_PANEL, PANE_ID } from '../src/controller'
import type { Io } from '../src/io'
import { registerViews } from '../src/render/views'

const viewAtom = atom({ plugin: 'avatar', key: 'view' } as const, EMPTY_VIEW, { shape: 'view-1' })
const panelAtom = atom({ plugin: 'avatar', key: 'panel' } as const, FIRST_PANEL, { shape: 'panel-1' })

export const register: Register = (on, options) => {
  const controller = new Controller(options)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    if (!e.isInteractive) return started
    await $.command
      .register({
        name: 'avatar',
        description: 'Desktop-Avatar: Status, Aussehen, Einrichten, leise/normal/gesprächig, Sprachmodus, Test',
        argumentHint: '[status|aussehen|einrichten|leise|normal|gesprächig|sprache an|aus|zeigen|verstecken|geist|test|neustart]',
        immediate: true,
      })
      .catch(() => undefined)

    const [os, userProfile, home] = await Promise.all([
      $.env.get('OS').catch(() => undefined),
      $.env.get('USERPROFILE').catch(() => undefined),
      $.env.get('HOME').catch(() => undefined),
    ])

    const io: Io = {
      pluginRoot: $.plugin.root,
      env: { os, userProfile, home },
      now: () => $.clock.now(),
      sleep: ms => $.clock.sleep(ms),
      after: (ms, fn) => $.clock.after(ms, fn),
      every: (ms, fn) => $.clock.every(ms, fn),
      read: path => $.fs.read(path),
      write: (path, text) => $.fs.write(path, text),
      list: path => $.fs.list(path),
      storeGet: key => $.store.get(key),
      storeSet: (key, value) => $.store.set(key, value),
      sessionId: () => $.session.id(),
      sessionRepo: () => $.session.repo(),
      sessionUsage: () => $.session.usage(),
      setting: key => $.settings.read({ key }),
      spawn: request => $.process.spawn(request),
      speak: (text, voice) => $.audio.speak(text, voice ? { voice } : undefined),
      play: asset => $.audio.play({ asset }),
      status: text => $.ui.status(text),
      notify: (text, title) => $.ui.notify(text, { title }),
      log: text => $.ui.log(text, { to: 'debug' }),
      openPane: title => $.ui.open({ id: PANE_ID, title }),
      blit: (requestId, key, cells) => $.ui.blit({ requestId, key, cells }),
      submit: text => $.prompt.submit({ text, asUser: true }),
      abort: turnId => $.turn.abort({ turnId }),
      fork: async prompt => {
        const answer = await $.model.fork({ prompt, effort: 'low' })
        return answer.isAnswered ? { isAnswered: true, text: answer.text } : { isAnswered: false }
      },
      complete: async prompt => {
        const answer = await $.model.complete({ model: 'haiku', prompt, maxTokens: 220, effort: 'low' })
        return answer.isAnswered ? { isAnswered: true, text: answer.text } : { isAnswered: false }
      },
      setView: view => update($, viewAtom, () => view),
    }

    // Start im Hintergrund, damit die Sitzung nicht wartet.
    controller.safely(() => controller.start(io, e))
    return started
  })

  on('session.end', async ($, e, next) => {
    await controller.end().catch(() => undefined)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    let result: { drop?: string; text?: string; context?: string } = {}
    try {
      result = await controller.onPromptSubmit(e)
    } catch (error) {
      controller.log(`prompt.submit: ${String(error)}`)
    }
    if (result.drop) return { drop: result.drop }
    if (!result.text && !result.context) return next(e)
    return next({
      ...e,
      ...(result.text ? { text: result.text } : {}),
      ...(result.context ? { context: [...(e.context ?? []), result.context] } : {}),
    })
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    controller.safely(() => controller.onTurnStart(e))
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    controller.safely(() => controller.beforeTool(e))
    const ran = await next(e)
    controller.safely(() => controller.afterTool(e, ran))
    return ran
  }).catch(($, e, next) => next(e))

  on('classic.Notification', async ($, e, next) => {
    controller.safely(() => controller.onNotification(e))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    controller.safely(() => controller.onTurnComplete(e))
    return done
  })

  on('command.run', { command: 'avatar' }, async ($, e) => {
    const result = await controller.onSlash(e.args)
    if (result.openPane) {
      const tab = result.openPane
      await update($, panelAtom, () => ({ tab })).catch(() => undefined)
      await $.ui.open({ id: PANE_ID, title: controller.settings.name, focus: true }).catch(() => undefined)
    }
    return { text: result.text }
  })

  registerViews(on, controller)
}
