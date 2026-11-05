// Anzeige in Claude Code: Seitenleiste (Status, Aussehen, Einrichten), das
// Band über der Eingabe und das Wort im „Denkt nach"-Spinner.

import type { ElementTable, On, RenderElement } from 'claude-code'
import { atom, read, update } from 'claude-code'
import type { AvatarMood, AvatarView, SessionBrief } from '../../types'
import { EMPTY_VIEW, FIRST_PANEL, type Controller } from '../controller'
import { PERSONA_STYLES } from '../persona'
import { templateName } from '../templates'
import { avatarSvg, RasterAnimator, rasterFrame } from './avatar'

const viewAtom = atom({ plugin: 'avatar', key: 'view' } as const, EMPTY_VIEW, { shape: 'view-1' })
const panelAtom = atom({ plugin: 'avatar', key: 'panel' } as const, FIRST_PANEL, { shape: 'panel-1' })

const MOOD_COLOR: Record<AvatarMood, string> = {
  idle: '#7dd3fc',
  thinking: '#c084fc',
  working: '#22d3ee',
  speaking: '#f472b6',
  attention: '#facc15',
  success: '#4ade80',
  error: '#f87171',
  sleeping: '#94a3b8',
}

function bar(done: number, total: number, width = 10): string {
  const filled = total > 0 ? Math.round((done / total) * width) : 0
  return '▰'.repeat(filled) + '▱'.repeat(Math.max(0, width - filled))
}

function dot(session: SessionBrief): string {
  if (session.needsYou) return '◆'
  if (session.mood === 'working' || session.mood === 'thinking') return '●'
  return '○'
}

export function registerViews(on: On, controller: Controller): void {
  const animator = new RasterAnimator(controller)

  // ---------------------------------------------------------------- Seitenleiste
  on('ui.render', { component: 'Pane', requestId: 'avatar' }, async ($, e) => {
    const view: AvatarView = await read($, viewAtom)
    const panel = await read($, panelAtom)
    const s = controller.s
    const name = controller.settings.name
    const { Box, Text, Button } = $.ui.resolve(e)

    let avatar: ReturnType<typeof Text> | undefined
    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      const raster = rasterFrame(controller, view.mood, 0)
      if (raster) {
        avatar = <Raster key="avatar" columns={raster.columns} rows={raster.rows} cells={raster.cells} />
        animator.ensure()
      }
    } else {
      const { Svg } = $.ui.resolve(e)
      const svg = avatarSvg(controller, view.mood, 132)
      if (svg) avatar = <Svg source={svg} alt={`${name}, ${s.mood[view.mood]}`} width={150} height={150} isInteractive={true} />
    }

    const tabs = (
      <Box key="tabs" flexDirection="row" gap={1} marginTop={1}>
        <Button key="tab-status" label={s.ui.status} plain={panel.tab === 'status' ? undefined : true} onPress={() => void update($, panelAtom, () => ({ tab: 'status' }))} />
        <Button key="tab-look" label={s.ui.look} plain={panel.tab === 'look' ? undefined : true} onPress={() => void update($, panelAtom, () => ({ tab: 'look' }))} />
        <Button key="tab-setup" label={s.ui.setup} plain={panel.tab === 'setup' ? undefined : true} onPress={() => void update($, panelAtom, () => ({ tab: 'setup' }))} />
      </Box>
    )

    if (panel.tab === 'look') {
      const table = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          {avatar}
          {lookTab({ Box: table.Box, Text: table.Text, Select: table.Select, Input: table.Input }, controller)}
          {tabs}
        </Box>
      )
    }
    if (panel.tab === 'setup') {
      const { Markdown } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Markdown text={controller.setupText()} />
          <Box flexDirection="row" gap={1} marginTop={1}>
            <Button key="restart" label={s.ui.restart} onPress={() => void controller.restartCompanion()} />
            <Button key="test" label={s.ui.test} onPress={() => void controller.runTest()} />
          </Box>
          {tabs}
        </Box>
      )
    }

    const plan = view.plan
    const others = view.sessions.filter(one => !one.isSelf)
    const verbosity = controller.settings.verbosity
    return (
      <Box flexDirection="column">
        {avatar ? <Box key="figure" justifyContent="center">{avatar}</Box> : undefined}
        <Text bold color={MOOD_COLOR[view.mood]}>
          {name} · {s.mood[view.mood]}
        </Text>
        {view.attention ? <Text color="#facc15" wrap="wrap">⚠ {view.attention}</Text> : undefined}
        {view.step ? <Text wrap="wrap">▸ {view.step}</Text> : undefined}
        {plan ? (
          <Text dimColor>
            {bar(plan.done, plan.total)} {plan.done}/{plan.total}
            {plan.current ? ` · ${plan.current}` : ''}
          </Text>
        ) : undefined}
        {view.lastSaid ? (
          <Text dimColor wrap="wrap">
            {s.lastSaid}: „{view.lastSaid}“
          </Text>
        ) : undefined}
        <Box flexDirection="column" marginTop={1}>
          <Text bold>{s.otherSessions}</Text>
          {others.length === 0 ? <Text dimColor>{s.noOtherSessions}</Text> : undefined}
          {others.map(one => (
            <Text key={`session-${one.id}`} color={one.needsYou ? '#facc15' : undefined} wrap="truncate">
              {dot(one)} {one.project} · {one.needsYou ? s.waiting : s.mood[one.mood]}
              {one.step && !one.needsYou ? ` · ${one.step}` : ''}
            </Text>
          ))}
        </Box>
        <Box flexDirection="row" flexWrap="wrap" gap={1} marginTop={1}>
          <Button key="status" label={s.ui.status} onPress={() => void controller.runIntent({ kind: 'status' }, true)} />
          <Button
            key="verbosity"
            label={s.verbosityLabel[verbosity]}
            onPress={() => {
              const next = verbosity === 'quiet' ? 'normal' : verbosity === 'normal' ? 'chatty' : 'quiet'
              void controller.change({ verbosity: next })
            }}
          />
          <Button key="voice" label={`${s.ui.voiceMode}: ${controller.settings.voiceMode ? s.ui.on : s.ui.off}`} onPress={() => void controller.change({ voiceMode: !controller.settings.voiceMode })} />
          <Button key="speech" label={`${s.ui.speech}: ${controller.settings.speech ? s.ui.on : s.ui.off}`} onPress={() => void controller.change({ speech: !controller.settings.speech })} />
          <Button key="desktop" label={`${s.ui.desktop}: ${controller.settings.desktop ? s.ui.on : s.ui.off}`} onPress={() => void controller.change({ desktop: !controller.settings.desktop })} />
        </Box>
        <Text dimColor>
          {s.ui.desktop}: {s.companion[view.companion]}
          {view.companion === 'failed' && view.companionNote ? ` – ${view.companionNote}` : ''}
        </Text>
        {tabs}
      </Box>
    )
  })

  // ---------------------------------------------------------------- Band über der Eingabe
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const view = await read($, viewAtom)
    if (!controller.isActive || e.props.hasSurvey) return next(e)
    const waiting = view.sessions.filter(one => !one.isSelf && one.needsYou)
    const isBusy = view.mood === 'thinking' || view.mood === 'working' || view.mood === 'attention'
    if (!isBusy && waiting.length === 0) return next(e)
    const s = controller.s
    const { Box, Text } = $.ui.resolve(e)
    const parts: string[] = []
    if (view.attention) parts.push(view.attention)
    else if (view.step) parts.push(view.step)
    if (view.plan) parts.push(`${view.plan.done}/${view.plan.total}`)
    if (waiting.length > 0) parts.push(s.sessionWaits(waiting.map(one => one.project).join(', ')))
    return (
      <Box flexDirection="row">
        <Text bold color={MOOD_COLOR[view.mood]}>
          ◆ {controller.settings.name} · {s.mood[view.mood]}
        </Text>
        <Text wrap="truncate" color={view.attention ? '#facc15' : undefined}>
          {parts.length > 0 ? `  ${parts.join(' · ')}` : ''}
        </Text>
      </Box>
    )
  })

  // ---------------------------------------------------------------- Spinner
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    await read($, viewAtom)
    const verb = controller.stepVerb
    if (!controller.isActive || !verb) return next(e)
    return next({ ...e, props: { ...e.props, word: `${controller.settings.name}: ${verb}` } })
  })
}

type LookElements = Pick<ElementTable, 'Box' | 'Text' | 'Select' | 'Input'>

function lookTab(elements: LookElements, controller: Controller): RenderElement {
  const s = controller.s
  const lang = controller.lang
  const { Box, Text, Select, Input } = elements
  const template = controller.template
  const params = controller.params
  const voicesFor = (prefix: string) => [
    { value: '', label: s.ui.automatic },
    ...controller.voices.filter(one => one.culture.toLowerCase().startsWith(prefix)).map(one => ({ value: one.name, label: one.name })),
  ]

  const paramControls = Object.entries(template?.manifest.parameters ?? {}).map(([key, spec]) => {
    const label = spec.label?.[lang] ?? spec.label?.['en'] ?? key
    const current = params[key]
    const setParam = (value: string | boolean | number) => void controller.change({ params: { ...controller.settings.params, [key]: value } })
    if (spec.type === 'color') {
      const options = (spec.palette ?? [String(spec.default)]).map(color => ({ value: color, label: color }))
      if (typeof current === 'string' && !options.some(one => one.value === current)) options.unshift({ value: current, label: current })
      return <Select key={`param-${key}`} label={label} options={options} value={String(current)} onSelect={value => setParam(value)} />
    }
    if (spec.type === 'choice') {
      const options = (spec.options ?? []).map(option => ({ value: option.id, label: option.label?.[lang] ?? option.label?.['en'] ?? option.id }))
      return <Select key={`param-${key}`} label={label} options={options} value={String(current)} onSelect={value => setParam(value)} />
    }
    if (spec.type === 'toggle') {
      const options = [
        { value: 'true', label: s.ui.on },
        { value: 'false', label: s.ui.off },
      ]
      return <Select key={`param-${key}`} label={label} options={options} value={String(current)} onSelect={value => setParam(value === 'true')} />
    }
    const min = spec.min ?? 0
    const max = spec.max ?? 1
    const step = spec.step ?? (max - min) / 4
    const options: Array<{ value: string; label: string }> = []
    for (let value = min; value <= max + 1e-9; value += step) options.push({ value: value.toFixed(2), label: value.toFixed(2) })
    return <Select key={`param-${key}`} label={label} options={options} value={Number(current).toFixed(2)} onSelect={value => setParam(Number(value))} />
  })

  return (
    <Box flexDirection="column" gap={1}>
      <Select
        key="template"
        label={s.ui.template}
        options={controller.templates.map(one => ({ value: one.id, label: templateName(one, lang) }))}
        value={template?.manifest.id ?? ''}
        onSelect={value => void controller.onSlash(`vorlage ${value}`)}
      />
      {paramControls}
      <Select
        key="scale"
        label={s.ui.size}
        options={[2, 3, 4, 5, 6, 7, 8].map(n => ({ value: String(n), label: `${n}×` }))}
        value={String(controller.settings.scale)}
        onSelect={value => void controller.change({ scale: Number(value) })}
      />
      <Select
        key="style"
        label={s.ui.style}
        options={PERSONA_STYLES.map(style => ({ value: style, label: s.styleLabel[style] ?? style }))}
        value={controller.style}
        onSelect={value => void controller.onSlash(`stil ${value}`)}
      />
      <Select key="voice-de" label={s.ui.voiceDe} options={voicesFor('de')} value={controller.settings.voiceDe} onSelect={value => void controller.change({ voiceDe: value })} />
      <Select key="voice-en" label={s.ui.voiceEn} options={voicesFor('en')} value={controller.settings.voiceEn} onSelect={value => void controller.change({ voiceEn: value })} />
      <Input key="name" label={s.ui.name} value={controller.settings.name} submitLabel={s.ui.rename} onSubmit={value => void controller.onSlash(`name ${value}`)} />
      {controller.templateError ? <Text color="#f87171" wrap="wrap">{controller.templateError}</Text> : undefined}
    </Box>
  )
}
