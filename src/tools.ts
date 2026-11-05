// Übersetzt Werkzeugaufrufe in kurze, sprechbare Schritte und verfolgt die
// Aufgabenliste von Claude (TaskCreate/TaskUpdate oder TodoWrite).

import type { PlanProgress } from '../types'
import type { Lang } from './i18n'
import { strings } from './i18n'
import { baseName, hostOf, isRecord, str, truncate } from './util'

export type ToolCategory =
  | 'read'
  | 'write'
  | 'edit'
  | 'shell'
  | 'search'
  | 'web'
  | 'agent'
  | 'plan'
  | 'mcp'
  | 'question'
  | 'other'

export type StepInfo = {
  category: ToolCategory
  /** Gleichartige Schritte mit demselben Schlüssel werden gebündelt. */
  bundleKey?: string
  text: (lang: Lang) => string
  /** Text für mehrere gebündelte Schritte. */
  many?: (lang: Lang, count: number) => string
  /** Der Schritt braucht dich (Rückfrage, Plan zur Freigabe). */
  needsYou?: 'question' | 'plan'
  /** Kurzform für den Spinner. */
  verb: (lang: Lang) => string
  /** Schritt nur in der Aufgabenliste, nicht als eigener Schritt anzeigen. */
  isPlanOnly?: boolean
}

type ToolInput = { tool: string } & Record<string, unknown>

const TEST = /\b(test|tests|jest|vitest|pytest|mocha|spec|phpunit|rspec|go test|cargo test|dotnet test|ctest)\b/i
const BUILD = /\b(build|tsc|webpack|vite build|cargo build|make|gradle|mvn|msbuild|dotnet build|cmake)\b/i
const INSTALL = /\b(npm (i|install|ci|add)|pnpm (i|install|add)|yarn( add| install)?\b|pip3? install|cargo add|poetry (add|install)|bundle install|go get|nuget)\b/i
const LINT = /\b(lint|eslint|prettier|ruff|flake8|black|stylelint|clippy|biome)\b/i

function verbs(lang: Lang) {
  return lang === 'en'
    ? { read: 'Reading', write: 'Writing', edit: 'Editing', test: 'Testing', build: 'Building', shell: 'Running', search: 'Searching', web: 'Researching', agent: 'Delegating', plan: 'Planning', mcp: 'Connecting', question: 'Asking', other: 'Working' }
    : { read: 'Liest', write: 'Schreibt', edit: 'Bearbeitet', test: 'Testet', build: 'Baut', shell: 'Führt aus', search: 'Sucht', web: 'Recherchiert', agent: 'Delegiert', plan: 'Plant', mcp: 'Verbindet', question: 'Fragt', other: 'Arbeitet' }
}

function describeShell(command: string): StepInfo {
  const flat = command.replace(/\s+/g, ' ').trim()
  if (TEST.test(flat)) return { category: 'shell', bundleKey: 'tests', text: l => strings(l).tests, verb: l => verbs(l).test }
  if (INSTALL.test(flat)) return { category: 'shell', bundleKey: 'install', text: l => strings(l).install, verb: l => verbs(l).shell }
  if (LINT.test(flat)) return { category: 'shell', bundleKey: 'lint', text: l => strings(l).lint, verb: l => verbs(l).shell }
  if (BUILD.test(flat)) return { category: 'shell', bundleKey: 'build', text: l => strings(l).build, verb: l => verbs(l).build }
  const git = /^git\s+([a-z-]+)/i.exec(flat)
  if (git) {
    const sub = git[1] ?? 'git'
    return { category: 'shell', bundleKey: `git-${sub}`, text: l => strings(l).git(sub), verb: l => verbs(l).shell }
  }
  const short = truncate(flat, 48)
  return { category: 'shell', text: l => strings(l).shell(short), verb: l => verbs(l).shell }
}

export function describeTool(input: ToolInput): StepInfo {
  const tool = String(input.tool)
  const file = str(input['file_path']) ?? str(input['notebook_path']) ?? str(input['path'])
  const name = file ? baseName(file) : ''
  switch (tool) {
    case 'Read':
      return { category: 'read', bundleKey: 'read', text: l => strings(l).read(name || '…'), many: (l, n) => strings(l).readMany(n), verb: l => verbs(l).read }
    case 'Write':
      return { category: 'write', text: l => strings(l).write(name || '…'), verb: l => verbs(l).write }
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return { category: 'edit', bundleKey: 'edit', text: l => strings(l).edit(name || '…'), many: (l, n) => strings(l).editMany(n), verb: l => verbs(l).edit }
    case 'Bash':
    case 'PowerShell':
      return describeShell(str(input['command']) ?? '')
    case 'Grep': {
      const pattern = truncate(str(input['pattern']) ?? '', 40)
      return { category: 'search', bundleKey: 'grep', text: l => strings(l).grep(pattern), verb: l => verbs(l).search }
    }
    case 'Glob': {
      const pattern = truncate(str(input['pattern']) ?? '', 40)
      return { category: 'search', bundleKey: 'glob', text: l => strings(l).glob(pattern), verb: l => verbs(l).search }
    }
    case 'WebSearch': {
      const query = truncate(str(input['query']) ?? '', 50)
      return { category: 'web', bundleKey: 'websearch', text: l => strings(l).webSearch(query), verb: l => verbs(l).web }
    }
    case 'WebFetch': {
      const host = hostOf(str(input['url']) ?? '')
      return { category: 'web', bundleKey: 'webfetch', text: l => strings(l).webFetch(host), verb: l => verbs(l).web }
    }
    case 'Agent':
    case 'Task': {
      const description = truncate(str(input['description']) ?? str(input['subagent_type']) ?? '…', 50)
      return { category: 'agent', text: l => strings(l).agent(description), verb: l => verbs(l).agent }
    }
    case 'TaskCreate':
    case 'TaskUpdate':
    case 'TaskGet':
    case 'TaskList':
    case 'TodoWrite':
      return { category: 'plan', isPlanOnly: true, text: l => verbs(l).plan, verb: l => verbs(l).plan }
    case 'AskUserQuestion':
      return { category: 'question', needsYou: 'question', text: l => strings(l).question, verb: l => verbs(l).question }
    case 'ExitPlanMode':
      return { category: 'question', needsYou: 'plan', text: l => strings(l).planReady, verb: l => verbs(l).plan }
    case 'Skill': {
      const skill = truncate(str(input['skill']) ?? str(input['name']) ?? '…', 40)
      return { category: 'other', text: l => strings(l).skill(skill), verb: l => verbs(l).other }
    }
    default: {
      const mcp = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/.exec(tool)
      if (mcp) {
        const server = mcp[1] ?? 'mcp'
        const action = mcp[2] ?? tool
        return { category: 'mcp', bundleKey: `mcp-${server}`, text: l => strings(l).mcp(server, action), verb: l => verbs(l).mcp }
      }
      return { category: 'other', text: l => strings(l).tool(tool), verb: l => verbs(l).other }
    }
  }
}

/** Ein knapper, lesbarer Hinweis, was eine Freigabe betrifft. */
export function permissionDetail(input: ToolInput): string {
  const tool = String(input.tool)
  const command = str(input['command'])
  if (command) return `${tool} ${truncate(command, 60)}`
  const file = str(input['file_path']) ?? str(input['notebook_path'])
  if (file) return `${tool} ${baseName(file)}`
  const url = str(input['url'])
  if (url) return `${tool} ${hostOf(url)}`
  return tool
}

type PlanTask = { id: string; subject: string; activeForm?: string; status: string }

export class PlanTracker {
  private tasks = new Map<string, PlanTask>()
  private order: string[] = []
  private pendingCreate = 0

  reset(): void {
    this.tasks.clear()
    this.order = []
  }

  /** Wertet einen Aufruf der Aufgaben-Werkzeuge aus; `result` ist das Ergebnis nach dem Aufruf. */
  observe(input: ToolInput, result: unknown): void {
    const tool = String(input.tool)
    if (tool === 'TodoWrite') this.fromTodoWrite(input['todos'])
    else if (tool === 'TaskCreate') this.fromTaskCreate(input, result)
    else if (tool === 'TaskUpdate') this.fromTaskUpdate(input)
  }

  private fromTodoWrite(todos: unknown): void {
    if (!Array.isArray(todos)) return
    this.reset()
    todos.forEach((todo, index) => {
      if (!isRecord(todo)) return
      const id = String(index)
      this.tasks.set(id, {
        id,
        subject: str(todo['content']) ?? str(todo['subject']) ?? '',
        activeForm: str(todo['activeForm']),
        status: str(todo['status']) ?? 'pending',
      })
      this.order.push(id)
    })
  }

  private fromTaskCreate(input: ToolInput, result: unknown): void {
    const id = findTaskId(result) ?? `created-${++this.pendingCreate}`
    if (!this.tasks.has(id)) this.order.push(id)
    this.tasks.set(id, {
      id,
      subject: str(input['subject']) ?? str(input['description']) ?? '',
      activeForm: str(input['activeForm']),
      status: 'pending',
    })
  }

  private fromTaskUpdate(input: ToolInput): void {
    const id = str(input['taskId']) ?? str(input['id']) ?? str(input['task_id']) ?? (typeof input['taskId'] === 'number' ? String(input['taskId']) : undefined)
    if (!id) return
    const task = this.tasks.get(id) ?? { id, subject: str(input['subject']) ?? '', status: 'pending' }
    if (!this.tasks.has(id)) this.order.push(id)
    const status = str(input['status'])
    if (status === 'deleted') {
      this.tasks.delete(id)
      this.order = this.order.filter(one => one !== id)
      return
    }
    this.tasks.set(id, {
      ...task,
      subject: str(input['subject']) ?? task.subject,
      activeForm: str(input['activeForm']) ?? task.activeForm,
      status: status ?? task.status,
    })
  }

  progress(): PlanProgress | undefined {
    const list = this.order.map(id => this.tasks.get(id)).filter((task): task is PlanTask => task !== undefined)
    if (list.length < 2) return undefined
    const done = list.filter(task => task.status === 'completed').length
    const running = list.find(task => task.status === 'in_progress')
    const current = running ? running.activeForm ?? running.subject : undefined
    return { done, total: list.length, current: current ? truncate(current, 60) : undefined }
  }

  /** Die laufende Aufgabe als Schrittnummer (1-basiert), sofern bekannt. */
  currentStep(): number | undefined {
    const list = this.order.map(id => this.tasks.get(id)).filter((task): task is PlanTask => task !== undefined)
    const index = list.findIndex(task => task.status === 'in_progress')
    return index >= 0 ? index + 1 : undefined
  }
}

function findTaskId(result: unknown, depth = 0): string | undefined {
  if (depth > 3 || !isRecord(result)) return undefined
  const direct = result['id'] ?? result['taskId'] ?? result['task_id']
  if (typeof direct === 'string' || typeof direct === 'number') return String(direct)
  for (const key of ['task', 'result', 'data']) {
    const nested = findTaskId(result[key], depth + 1)
    if (nested) return nested
  }
  return undefined
}
