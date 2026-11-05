// Zeichnet den Avatar für Claude Code: SVG für Desktop-App, VS Code und
// Mobil; Halbblock-Raster fürs Terminal, bildweise animiert über ui.blit.

import type { AvatarMood } from '../../types'
import type { Controller } from '../controller'
import { PANE_ID } from '../controller'
import type { Timer } from '../io'
import { composeFrame, fpsOf, framesOf, glitch, injectSvg, overlayFrames, paletteColors, pixelSvg, rasterCells, stateFor, svgDimensions } from '../templates'

export type AvatarSvg = { svg: string; width: number; height: number }

const svgCacheSized = new Map<string, AvatarSvg>()

export function avatarSvg(controller: Controller, mood: AvatarMood, size: number): AvatarSvg | undefined {
  const template = controller.template
  if (!template) return undefined
  const params = controller.params
  const key = JSON.stringify([template.manifest.id, template.manifest.version, template.dir, mood, params, size])
  const cached = svgCacheSized.get(key)
  if (cached) return cached
  let result: AvatarSvg
  if (template.svgSource) {
    const width = template.manifest.svg?.width ?? size
    const height = template.manifest.svg?.height ?? size
    result = { svg: injectSvg(template.svgSource, template.manifest, params, stateFor(template, mood), true), width, height }
  } else {
    result = { svg: pixelSvg(template, params, mood, { size, motion: true }), ...svgDimensions(template, size) }
  }
  if (svgCacheSized.size > 40) svgCacheSized.clear()
  svgCacheSized.set(key, result)
  return result
}

export function rasterFrame(controller: Controller, mood: AvatarMood, frameIndex: number): { cells: string; columns: number; rows: number } | undefined {
  const template = controller.template
  if (!template) return undefined
  const params = controller.params
  const colors = paletteColors(template.pixel, params)
  const state = stateFor(template, mood)
  const frames = framesOf(template, state)
  const name = frames[frameIndex % frames.length] ?? frames[0]
  if (!name) return undefined
  let pixels = composeFrame(template, colors, [name, ...overlayFrames(template, params)])
  if ((template.pixel.effects?.glitch ?? []).includes(state) && frameIndex % 2 === 0) {
    pixels = glitch(pixels, template.pixel.width, template.pixel.height, frameIndex * 7919 + 17)
  }
  return rasterCells(pixels, template.pixel.width, template.pixel.height)
}

/** Animiert das Raster in der Seitenleiste, solange sie im Terminal gezeichnet ist. */
export class RasterAnimator {
  private timer: Timer | undefined
  private frame = 0
  private misses = 0
  private lastMood: AvatarMood | undefined
  private fps = 0

  constructor(private readonly controller: Controller) {}

  ensure(): void {
    const io = this.controller.io
    const template = this.controller.template
    if (!template || !io) return
    const fps = fpsOf(template, stateFor(template, this.controller.mood))
    if (this.timer && fps === this.fps) return
    this.timer?.cancel()
    this.fps = fps
    this.misses = 0
    this.timer = io.every(Math.round(1000 / fps), () => void this.step())
  }

  stop(): void {
    this.timer?.cancel()
    this.timer = undefined
  }

  private async step(): Promise<void> {
    const io = this.controller.io
    if (!io) return
    const mood = this.controller.mood
    if (mood !== this.lastMood) {
      this.lastMood = mood
      this.frame = 0
      this.ensure()
    }
    this.frame++
    const raster = rasterFrame(this.controller, mood, this.frame)
    if (!raster) return
    const result = await io.blit(PANE_ID, 'avatar', raster.cells).catch(() => ({ deny: 'error' }))
    if (result.deny) {
      this.misses++
      if (this.misses > 4) this.stop()
    } else this.misses = 0
  }
}
