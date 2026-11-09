// THE PICKER: hold the keys (Ctrl+Shift, Cmd+Shift on a Mac) and an outline follows the pointer; click to pick the
// element, click more to pick several, and let go. What was picked is on the clipboard at every click, wrapped in
// one tag so it reads apart from the words around it, and kept by the dev server for an agent to read over MCP.
// The bar that opens then adds a note, a screenshot or opens the first line in the editor.
import { described, i18nKeys, trail } from './source.mjs'
import { createUi } from './ui.mjs'

export const defaults = Object.freeze({
  /** The keys held to pick: `mod` is Ctrl, or Cmd on a Mac. */
  modifiers: ['mod', 'shift'],
  /** The tag the copied block is wrapped in. */
  tag: 'picked',
  /** A source path holding any of these is not yours, and is never a line of the block. */
  skip: ['node_modules/'],
  /** The trail of components stops at the first whose file matches (a Nuxt page or layout). */
  stopAt: '(^|/)(pages|layouts)/',
  /** The bar after a pick: Note, Screenshot, Open in editor. */
  bar: true,
  /** How long the bar stays while nothing happens on it, in milliseconds. */
  barTimeout: 8000,
  /** Where the dev server's half listens. */
  endpoint: '/__pinpoint',
})

const CONTEXT = '__pinpointContext'
const STATE = '__pinpoint'

/**
 * A line or lines added to every block, after the elements: `fn({ elements, page })` answers a string, an array of
 * them or nothing. Kept on `globalThis.__pinpointContext`, so code that does not import this package can push one.
 * Returns the way to take it off again.
 */
export function addPickContext(fn) {
  const list = (globalThis[CONTEXT] ||= [])
  list.push(fn)
  return () => {
    const index = list.indexOf(fn)
    if (index >= 0) list.splice(index, 1)
  }
}

/** The last pick in this tab, `{ id, text, note, page, at }`, or null. Also `globalThis.__pinpoint.last`. */
export function lastPick() {
  return globalThis[STATE]?.last ?? null
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
const attribute = value => String(value).replace(/"/g, '%22')
const stop = (event) => {
  event.preventDefault()
  event.stopImmediatePropagation()
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  }
  catch {}
  // NO CLIPBOARD API (an iframe without `allow="clipboard-write"`, an old engine): the old way, focus put back.
  const active = document.activeElement
  try {
    const area = Object.assign(document.createElement('textarea'), { value: text, readOnly: true })
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
    document.documentElement.append(area)
    area.select()
    const done = document.execCommand('copy')
    area.remove()
    return done
  }
  catch {
    return false
  }
  finally {
    active?.focus?.({ preventScroll: true })
  }
}

/** The text and the picture as one clipboard item: where it is pasted takes the one it reads. */
async function copyWithPicture(text, picture) {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'image/png': picture })])
    return true
  }
  catch {
    return false
  }
}

/** The background a picture of the element should sit on: the nearest one painted, else white. */
function groundOf(el) {
  for (let node = el; node; node = node.parentElement) {
    const colour = getComputedStyle(node).backgroundColor
    if (colour && colour !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(colour)) return colour
  }
  return '#ffffff'
}

/** One PNG of the picked elements, stacked and numbered when there are several. */
async function shoot(elements) {
  const { domToCanvas } = await import('modern-screenshot')
  const scale = Math.min(2, window.devicePixelRatio || 1)
  const filter = node => !(node instanceof Element && node.hasAttribute('data-pinpoint'))
  const shots = []
  for (const el of elements) shots.push(await domToCanvas(el, { scale, filter, backgroundColor: groundOf(el) }))
  let canvas = shots[0]
  if (shots.length > 1) {
    const gap = Math.round(12 * scale)
    canvas = document.createElement('canvas')
    canvas.width = Math.max(...shots.map(shot => shot.width))
    canvas.height = shots.reduce((sum, shot) => sum + shot.height, 0) + gap * (shots.length - 1)
    const context = canvas.getContext('2d')
    let y = 0
    shots.forEach((shot, index) => {
      context.drawImage(shot, 0, y)
      context.fillStyle = 'rgba(0, 0, 0, 0.75)'
      context.fillRect(0, y, 20 * scale, 18 * scale)
      context.fillStyle = '#ffffff'
      context.font = `${12 * scale}px sans-serif`
      context.fillText(String(index + 1), 6 * scale, y + 13 * scale)
      y += shot.height + gap
    })
  }
  return new Promise((done, fail) => canvas.toBlob(blob => (blob ? done(blob) : fail(new Error('The screenshot came out empty.'))), 'image/png'))
}

export function start(options = {}) {
  if (typeof window === 'undefined' || globalThis[STATE]) return
  const o = { ...defaults, ...options }
  const state = { last: null }
  globalThis[STATE] = state
  const stopAt = new RegExp(o.stopAt)
  const ours = at => !o.skip.some(part => at.includes(part))
  const needs = new Set(o.modifiers)
  const armed = event => needs.size > 0
    && (!needs.has('mod') || event.ctrlKey || event.metaKey)
    && (!needs.has('shift') || event.shiftKey)
    && needs.has('alt') === event.altKey
  const ui = createUi()

  /** What is picked while the keys are held. */
  let batch = []
  /** The pick the bar is about: `{ id, elements, note, text }`. */
  let shown = null
  /** The note being typed, or null while the bar is not a box. */
  let noting = null
  let pointer = { x: -1, y: -1 }
  let labelHeldUntil = 0
  let barTimer

  const linesOf = el => trail(el, { ours, stopAt })

  function build(elements, note) {
    const dark = document.documentElement.classList.contains('dark')
    const out = [`<${o.tag} page="${attribute(location.pathname + location.search)}" viewport="${innerWidth}x${innerHeight}"${dark ? ' theme="dark"' : ''}>`]
    const several = elements.length > 1
    elements.forEach((el, index) => {
      const indent = several ? '   ' : ''
      out.push(`${several ? `${index + 1}. ` : ''}${described(el)}`)
      for (const line of linesOf(el)) out.push(`${indent}${line.at} (${line.what})`)
      const keys = i18nKeys(el)
      if (keys.length) out.push(`${indent}i18n: ${keys.join(', ')}`)
    })
    for (const fn of globalThis[CONTEXT] ?? []) {
      try {
        for (const line of [fn({ elements, page: location.pathname })].flat()) {
          if (line) out.push(String(line))
        }
      }
      catch (error) {
        console.warn('[pinpoint] A pick context failed:', error)
      }
    }
    if (note) out.push(`note: ${note}`)
    out.push(`</${o.tag}>`)
    return `\n${out.join('\n')}\n`
  }

  async function post(path, body, type = 'application/json') {
    try {
      const response = await fetch(`${o.endpoint}${path}`, { method: 'POST', headers: { 'content-type': type }, body })
      return response.ok
    }
    catch {
      return false
    }
  }

  function remember(pick) {
    state.last = { id: pick.id, text: pick.text, note: pick.note || null, page: location.pathname + location.search, at: Date.now() }
    void post('/pick', JSON.stringify({ id: pick.id, page: state.last.page, text: pick.text, note: pick.note || undefined }))
  }

  /** "index.vue:46:9 UButton": the first line of the trail, short, or why there is none. */
  function labelOf(el) {
    const first = linesOf(el)[0]
    if (!first) return `${el.tagName.toLowerCase()}, no source of yours`
    const name = first.what.startsWith('this element') ? el.tagName.toLowerCase() : first.what.split(' ')[0]
    return `${first.at.split('/').pop()} ${name}`
  }

  // ---- The bar -----------------------------------------------------------------------------------------------------

  function barParts(status) {
    if (noting !== null) return [{ note: noting }, { act: 'note-done', text: 'Copy' }, { act: 'note-cancel', text: 'Cancel' }]
    const canOpen = Boolean(linesOf(shown.elements[0])[0])
    return [
      { status },
      { sep: true },
      { act: 'note', text: 'Note' },
      { act: 'shot', text: 'Screenshot' },
      ...(canOpen ? [{ act: 'open', text: 'Open in editor' }] : []),
      { act: 'close', text: '×' },
    ]
  }

  const copiedWords = () => (shown.elements.length > 1 ? `Copied ${shown.elements.length}` : 'Copied')

  function renderBar(status = copiedWords()) {
    if (shown) ui.showBar(shown.elements.at(-1), barParts(status))
  }

  function closeBar() {
    clearTimeout(barTimer)
    noting = null
    shown = null
    ui.hideBar()
    ui.marks([])
  }

  /** The bar goes once nothing has happened on it for a while; never while a note is being typed. */
  function holdBar() {
    clearTimeout(barTimer)
    if (shown && noting === null) barTimer = setTimeout(closeBar, o.barTimeout)
  }

  async function submitNote() {
    const note = noting.trim()
    noting = null
    if (note) {
      shown.note = note
      shown.text = build(shown.elements, note)
      const done = await copyText(shown.text)
      remember(shown)
      renderBar(done ? 'Copied with your note' : 'Could not copy')
    }
    else {
      renderBar()
    }
    holdBar()
  }

  async function takeShot() {
    const pick = shown
    renderBar('Taking a screenshot...')
    clearTimeout(barTimer)
    const picture = shoot(pick.elements)
    picture.catch(() => {})
    const copied = await copyWithPicture(pick.text, picture)
    let saved = false
    try {
      saved = await post(`/shot?id=${pick.id}`, await picture, 'image/png')
    }
    catch (error) {
      console.warn('[pinpoint] The screenshot failed:', error)
    }
    if (shown !== pick) return
    renderBar(copied ? 'Screenshot copied' : saved ? 'Screenshot kept, could not copy it' : 'Could not take a screenshot')
    holdBar()
  }

  async function openInEditor() {
    const first = linesOf(shown.elements[0])[0]
    if (!first) return
    const done = await post('/open', JSON.stringify({ file: first.at }))
    renderBar(done ? 'Opening in your editor' : 'Could not reach the dev server')
    holdBar()
  }

  function act(name) {
    if (!shown || !name) return
    if (name === 'close') return closeBar()
    if (name === 'note') {
      noting = ''
      clearTimeout(barTimer)
      return renderBar()
    }
    if (name === 'note-done') return submitNote()
    if (name === 'note-cancel') {
      noting = null
      renderBar()
      return holdBar()
    }
    if (name === 'shot') return takeShot()
    if (name === 'open') return openInEditor()
  }

  /** A note is typed here, never in a field: the keys are taken whole, so the app's focused field gets none. */
  function typeNote(event) {
    const { key } = event
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(key)) return event.stopImmediatePropagation()
    // PASTE BRINGS ITS WORDS in its own event, below.
    if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'v') return event.stopImmediatePropagation()
    stop(event)
    if (key === 'Enter') return submitNote()
    if (key === 'Escape') return act('note-cancel')
    if (key === 'Backspace') noting = event.ctrlKey || event.altKey ? noting.replace(/\s*\S+\s*$/, '') : noting.slice(0, -1)
    else if (key.length === 1 && !event.ctrlKey && !event.metaKey) noting += key
    else return
    renderBar()
  }

  // ---- Picking -----------------------------------------------------------------------------------------------------

  async function add(el) {
    if (!batch.length) closeBar()
    const index = batch.indexOf(el)
    if (index >= 0) batch.splice(index, 1)
    else batch.push(el)
    ui.marks(batch)
    if (!batch.length) return ui.hover(null)
    const text = build(batch)
    const done = await copyText(text)
    labelHeldUntil = Date.now() + 900
    ui.hover(el, done ? (batch.length > 1 ? `Copied ${batch.length}` : 'Copied') : 'Could not copy, see the console')
    if (!done) console.info(`[pinpoint]${text}`)
  }

  /** The keys let go: the picks become one, kept for the agent, and the bar opens on it. */
  function endBatch() {
    const elements = batch
    batch = []
    ui.hover(null)
    shown = { id: newId(), elements, note: '', text: build(elements) }
    remember(shown)
    if (o.bar) {
      renderBar()
      holdBar()
    }
    else {
      shown = null
      ui.marks([])
    }
  }

  function follow(event) {
    if (!armed(event)) {
      ui.hover(null)
      if (batch.length) endBatch()
      return
    }
    const el = document.elementFromPoint(pointer.x, pointer.y)
    if (!el || ui.owns(el)) return ui.hover(null)
    ui.hover(el, Date.now() < labelHeldUntil ? undefined : labelOf(el))
  }

  window.addEventListener('pointermove', (event) => {
    pointer = { x: event.clientX, y: event.clientY }
    if (ui.owns(event.target)) holdBar()
    follow(event)
  }, { capture: true, passive: true })

  window.addEventListener('keydown', (event) => {
    if (noting !== null) return typeNote(event)
    if (event.key === 'Escape' && ui.barOpen()) {
      stop(event)
      return closeBar()
    }
    follow(event)
  }, { capture: true })

  window.addEventListener('keyup', (event) => {
    if (noting !== null) return event.stopImmediatePropagation()
    follow(event)
  }, { capture: true })

  window.addEventListener('paste', (event) => {
    if (noting === null) return
    stop(event)
    noting += (event.clipboardData?.getData('text/plain') ?? '').replace(/\s+/g, ' ')
    renderBar()
  }, { capture: true })

  window.addEventListener('blur', () => {
    ui.hover(null)
    if (batch.length) endBatch()
  })

  // A PRESS ON THE BAR MOVES NO FOCUS AND REACHES NOTHING IN THE APP (a dialog's outside press would close it); a
  // pick takes the whole press, so no text is selected and no button, link or row acts on it.
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
    window.addEventListener(type, (event) => {
      if (ui.owns(event.target) || (event.button === 0 && armed(event))) return stop(event)
      if (type === 'pointerdown' && ui.barOpen()) closeBar()
    }, { capture: true })
  }

  window.addEventListener('click', (event) => {
    if (ui.owns(event.target)) {
      stop(event)
      return act(ui.actOf(event))
    }
    if (event.button !== 0 || !armed(event) || !(event.target instanceof Element)) return
    stop(event)
    void add(event.target)
  }, { capture: true })
}
