// THE PICKER: hold the keys (Ctrl+Shift, Cmd+Shift on a Mac) and an outline follows the pointer with a card saying
// what is under it; click to pick the element, click more to pick several, and let go. What was picked is on the
// clipboard at every click, wrapped in one tag so it reads apart from the words around it, and kept by the dev server
// for an agent to read over MCP. The bar that opens then adds a note, a screenshot, opens the first line in the
// editor, or unfolds the details: everything read about each pick, with Copy full.
import { describe, lineText, short } from './source.mjs'
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
  /** The bar after a pick: Note, Screenshot, Open in editor, Details. */
  bar: true,
  /** How long the bar stays while nothing happens on it, in milliseconds. */
  barTimeout: 8000,
  /** Where the dev server's half listens. */
  endpoint: '/__pinpoint',
})

const CONTEXT = '__pinpointContext'
const STATE = '__pinpoint'
/** Whether the details panel opens with the bar, kept in the browser. */
const DETAILS_KEY = 'pinpoint:details'
/** How long a note left unsent is kept, and how long the chip offering it back stays. */
const KEEP_NOTE_MS = 10 * 60_000
const CHIP_MS = 8000

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
const stored = {
  get: (key) => {
    try {
      return localStorage.getItem(key)
    }
    catch {
      return null
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, value)
    }
    catch {}
  },
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

/**
 * THE EMPTY ROWS UNDER WHAT WAS DRAWN, cut off, never above the element's own height. A heading set solid (its line
 * height its font size) has glyphs past its box, which the copy drawn for the picture lays out a little lower, so it
 * is drawn with room under it and the room taken off again here.
 */
function trimmed(canvas, least, pad) {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const { width, height } = canvas
  if (height <= least) return canvas
  const rows = context.getImageData(0, least, width, height - least).data
  const [r, g, b] = context.getImageData(0, height - 1, 1, 1).data
  let last = -1
  for (let y = height - least - 1; y >= 0 && last < 0; y--) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4
      if (Math.abs(rows[at] - r) > 12 || Math.abs(rows[at + 1] - g) > 12 || Math.abs(rows[at + 2] - b) > 12) {
        last = y
        break
      }
    }
  }
  const keep = Math.min(height, Math.max(least, least + last + 1 + pad))
  if (keep === height) return canvas
  const out = document.createElement('canvas')
  out.width = width
  out.height = keep
  out.getContext('2d').drawImage(canvas, 0, 0)
  return out
}

/** One PNG of the picked elements, stacked and numbered when there are several. */
async function shoot(elements) {
  const { domToCanvas } = await import('modern-screenshot')
  const scale = Math.min(2, window.devicePixelRatio || 1)
  const filter = node => !(node instanceof Element && node.hasAttribute('data-pinpoint'))
  const shots = []
  for (const el of elements) {
    const { height } = el.getBoundingClientRect()
    const room = Math.min(160, Math.max(24, height * 0.5))
    const drawn = await domToCanvas(el, { scale, filter, backgroundColor: groundOf(el), height: height + room })
    shots.push(trimmed(drawn, Math.round(height * scale), Math.round(6 * scale)))
  }
  let canvas = shots[0]
  if (shots.length > 1) {
    // EACH NUMBER IN A GUTTER OF ITS OWN, so it never covers a small element.
    const gap = Math.round(12 * scale)
    const gutter = Math.round(24 * scale)
    canvas = document.createElement('canvas')
    canvas.width = gutter + Math.max(...shots.map(shot => shot.width))
    canvas.height = shots.reduce((sum, shot) => sum + shot.height, 0) + gap * (shots.length - 1)
    const context = canvas.getContext('2d')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    let y = 0
    shots.forEach((shot, index) => {
      context.drawImage(shot, gutter, y)
      context.fillStyle = '#111827'
      context.fillRect(0, y, gutter - Math.round(4 * scale), Math.round(18 * scale))
      context.fillStyle = '#ffffff'
      context.font = `${12 * scale}px sans-serif`
      context.fillText(String(index + 1), 6 * scale, y + 13 * scale)
      y += shot.height + gap
    })
  }
  return new Promise((done, fail) => canvas.toBlob(blob => (blob ? done(blob) : fail(new Error('The screenshot came out empty.'))), 'image/png'))
}

/** A server's answer to an editor that could not open: a `vscode://` address, opened as a link would be. */
function openAddress(url) {
  const link = Object.assign(document.createElement('a'), { href: url })
  link.style.display = 'none'
  document.documentElement.append(link)
  link.click()
  link.remove()
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
  /** The pick the bar is about: `{ id, elements, infos, note, text }`. */
  let shown = null
  /** The words a note started with while one is typed (its box holds what is typed since), or null. */
  let noting = null
  /** Where the keyboard was before the note took it, given back when the note ends. */
  let returnFocus = null
  /** A note left without Copy, kept with its picks: `{ infos, note, keys, at }`. */
  let parked = null
  let chip = false
  let chipTimer
  let details = stored.get(DETAILS_KEY) === 'open'
  let pointer = { x: -1, y: -1 }
  let labelHeldUntil = 0
  let barTimer

  const info = el => describe(el, { ours, stopAt })

  /** The block: the short one every click copies, or `full` with everything the details panel reads. */
  function build(infos, note, full = false) {
    const dark = document.documentElement.classList.contains('dark')
    const out = [`<${o.tag} page="${attribute(location.pathname + location.search)}" viewport="${innerWidth}x${innerHeight}"${dark ? ' theme="dark"' : ''}>`]
    const several = infos.length > 1
    infos.forEach((item, index) => {
      const indent = several ? '   ' : ''
      out.push(`${several ? `${index + 1}. ` : ''}${item.label}`)
      for (const line of item.lines) out.push(`${indent}${lineText(item, line)}`)
      if (item.keys.length) out.push(`${indent}i18n: ${item.keys.join(', ')}`)
      if (!full) return
      const part = [item.part ? `${item.part.owner ?? '?'} › ${item.part.slot}` : null, item.from ? `words from prop ${item.from}` : null, item.library ? `drawn at ${item.library}` : null].filter(Boolean)
      if (part.length) out.push(`${indent}part: ${part.join(', ')}`)
      out.push(`${indent}look: ${item.look.line}`)
      if (item.look.classes) out.push(`${indent}class: ${short(item.look.classes, 240)}`)
      out.push(`${indent}a11y: ${item.a11y.line}`)
      if (item.data.length) out.push(`${indent}data: ${item.data.join(' ')}`)
      if (item.props.length) out.push(`${indent}props: ${item.props.join(' ')}`)
    })
    for (const fn of globalThis[CONTEXT] ?? []) {
      try {
        for (const line of [fn({ elements: infos.map(item => item.el), page: location.pathname })].flat()) {
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
      let answer = null
      try {
        answer = await response.json()
      }
      catch {}
      return { ok: response.ok && answer?.ok !== false, answer }
    }
    catch {
      return { ok: false, answer: null }
    }
  }

  function remember(pick) {
    state.last = { id: pick.id, text: pick.text, note: pick.note || null, page: location.pathname + location.search, at: Date.now() }
    void post('/pick', JSON.stringify({ id: pick.id, page: state.last.page, text: pick.text, note: pick.note || undefined }))
  }

  // ---- The hover card ----------------------------------------------------------------------------------------------

  /** Three short lines: the element, its size and part; its first source line; its translation key. */
  function cardOf(el) {
    const item = info(el)
    const first = item.lines[0]
    const name = first?.kind === 'component' ? `${first.name}${item.partOnLine ? ` › ${item.part.slot}` : ''}` : item.part ? `${item.part.owner ?? ''} › ${item.part.slot}` : ''
    const lines = [{ text: [el.tagName.toLowerCase(), item.look.size, name].filter(Boolean).join(' · ') }]
    if (first) lines.push({ text: first.at.split('/').slice(-2).join('/'), tone: 'accent' })
    else lines.push({ text: item.library ? `no source of yours (drawn at ${item.library.split('/').pop()})` : 'no source of yours', tone: 'muted' })
    if (item.keys.length) lines.push({ text: `i18n ${item.keys[0]}`, tone: 'muted' })
    return lines
  }

  // ---- The bar and the details panel -------------------------------------------------------------------------------

  /** A pick's identity that outlives a re-render: its words and its first source line. */
  const keyOf = item => `${item.label}|${item.lines[0]?.at ?? ''}`
  const kept = () => {
    if (parked && Date.now() - parked.at > KEEP_NOTE_MS) parked = null
    return parked
  }
  /** Whether the pick on the bar shares an element with the kept note. */
  const resumable = () => Boolean(kept() && shown?.infos.some(item => parked.keys.has(keyOf(item))))

  function barParts(status) {
    if (noting !== null) return [{ note: noting }, { act: 'note-done', text: 'Copy' }, { act: 'note-cancel', text: 'Cancel' }]
    const canOpen = Boolean(shown.infos[0].lines[0])
    return [
      { status },
      { sep: true },
      resumable() ? { act: 'note', text: 'Resume note', on: true } : { act: 'note', text: 'Note' },
      { act: 'shot', text: 'Screenshot' },
      ...(canOpen ? [{ act: 'open', text: 'Open in editor' }] : []),
      { act: 'details', text: details ? 'Details ▴' : 'Details ▾', on: details },
      { act: 'close', text: '×' },
    ]
  }

  /** Every pick as a section: its source lines (press to open), its keys (press to copy), and what else was read. */
  function panelOf(pick) {
    return pick.infos.map((item, index) => {
      const rows = []
      if (item.lines.length) rows.push({ key: 'source', items: item.lines.map(line => ({ text: lineText(item, line), act: 'open-line', value: line.at })) })
      const part = [
        item.part ? { text: `${item.part.owner ?? '?'} › ${item.part.slot}` } : null,
        item.from ? { text: `words from prop ${item.from}` } : null,
        item.library ? { text: `drawn at ${item.library}`, tone: 'lib' } : null,
      ].filter(Boolean)
      if (part.length) rows.push({ key: 'part', items: part })
      if (item.keys.length) rows.push({ key: 'i18n', items: item.keys.map(key => ({ text: key, act: 'copy', value: key })) })
      rows.push({ key: 'look', items: [{ text: item.look.line }] })
      if (item.look.classes) rows.push({ key: 'class', items: [{ text: item.look.classes, act: 'copy', value: item.look.classes }] })
      rows.push({ key: 'a11y', items: [{ text: item.a11y.line, tone: item.a11y.low ? 'warn' : '' }] })
      if (item.data.length) rows.push({ key: 'data', items: item.data.map(text => ({ text })) })
      if (item.props.length) rows.push({ key: 'props', items: [{ text: item.props.join(' ') }] })
      return { head: `${pick.infos.length > 1 ? `${index + 1}  ` : ''}${item.label}`, rows }
    })
  }

  const copiedWords = () => (shown.infos.length > 1 ? `Copied ${shown.infos.length}` : 'Copied')

  /** The last picked element still on the page, for the bar to sit by. */
  const anchorOf = infos => infos.map(item => item.el).filter(el => el.isConnected).at(-1) ?? infos.at(-1).el

  function renderBar(status = copiedWords()) {
    if (!shown) return
    ui.showBar(anchorOf(shown.infos), barParts(status))
    ui.showPanel(details && noting === null ? panelOf(shown) : null, [{ act: 'copy-full', text: 'Copy full' }])
  }

  // ---- The note: a real textarea that borrows the keyboard, and is kept when it is left ---------------------------

  /** Opens the note's box with these words, the keyboard in it. */
  function enterNote(words) {
    const active = document.activeElement
    returnFocus = active && active !== document.body && !ui.owns(active) ? active : null
    noting = words
    clearTimeout(barTimer)
    renderBar()
    ui.focusNote()
  }

  /**
   * THE NOTE ENDS: its words kept with its picks unless it was sent (`keep`), and the keyboard given back where it
   * was, so a field they were typing in has it again as if it never left.
   */
  function leaveNote(keep) {
    if (noting === null) return null
    const words = ui.noteValue()
    noting = null
    if (keep && words.trim()) parked = { infos: shown.infos, note: words, keys: new Set(shown.infos.map(keyOf)), at: Date.now() }
    const back = returnFocus
    returnFocus = null
    if (back?.isConnected) back.focus({ preventScroll: true })
    else ui.blurNote()
    return words
  }

  function hideChip() {
    clearTimeout(chipTimer)
    if (!chip) return
    chip = false
    ui.hideBar()
  }

  /** Right after a note was closed unsent: "Note kept", with Resume, for a few seconds by where it was. */
  function showChip(infos) {
    chip = true
    ui.showBar(anchorOf(infos), [{ status: 'Note kept' }, { sep: true }, { act: 'resume', text: 'Resume' }, { act: 'dismiss', text: '×' }])
    ui.showPanel(null)
    clearTimeout(chipTimer)
    chipTimer = setTimeout(hideChip, CHIP_MS)
  }

  /** The bar goes. A note being typed is kept, and the chip offers it back unless a new pick is what closed it. */
  function closeBar({ offer = true } = {}) {
    clearTimeout(barTimer)
    if (chip) return hideChip()
    const pick = shown
    const words = leaveNote(true)
    shown = null
    ui.hideBar()
    ui.marks([])
    if (offer && pick && words?.trim()) showChip(pick.infos)
  }

  /** The bar goes once nothing has happened on it for a while; never while a note is typed or the details are open. */
  function holdBar() {
    clearTimeout(barTimer)
    if (shown && noting === null && !details) barTimer = setTimeout(closeBar, o.barTimeout)
  }

  async function submitNote() {
    const note = (leaveNote(false) ?? '').trim()
    if (note) {
      parked = null
      shown.note = note
      shown.text = build(shown.infos, note)
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
    const picture = shoot(pick.infos.map(item => item.el))
    picture.catch(() => {})
    const copied = await copyWithPicture(pick.text, picture)
    let saved = false
    try {
      saved = (await post(`/shot?id=${pick.id}`, await picture, 'image/png')).ok
    }
    catch (error) {
      console.warn('[pinpoint] The screenshot failed:', error)
    }
    if (shown !== pick) return
    renderBar(copied ? 'Screenshot copied' : saved ? 'Screenshot kept, could not copy it' : 'Could not take a screenshot')
    holdBar()
  }

  /** The dev server opens it; when it cannot, its `vscode://` address is tried, and the bar says why. */
  async function openInEditor(at) {
    if (!at) return
    renderBar('Opening...')
    const { ok, answer } = await post('/open', JSON.stringify({ file: at }))
    if (ok) renderBar(`Opened ${at.split('/').pop()}`)
    else {
      if (answer?.url) openAddress(answer.url)
      renderBar(answer?.url ? 'Tried a vscode:// link: start the dev server from a VS Code terminal' : answer?.error ?? 'Could not reach the dev server')
    }
    holdBar()
  }

  async function copyFull() {
    const done = await copyText(build(shown.infos, shown.note, true))
    renderBar(done ? 'Copied everything' : 'Could not copy')
    holdBar()
  }

  async function copyValue(value) {
    const done = await copyText(value)
    renderBar(done ? `Copied ${short(value, 40)}` : 'Could not copy')
    holdBar()
  }

  function act(pressed) {
    if (!pressed) return
    const { act: name, value } = pressed
    if (name === 'dismiss') return hideChip()
    if (name === 'resume') {
      if (!kept()) return hideChip()
      hideChip()
      const { infos, note } = parked
      parked = null
      shown = { id: newId(), infos, note: '', text: build(infos) }
      ui.marks(infos.map(item => item.el).filter(el => el.isConnected))
      return enterNote(note)
    }
    if (!shown) return
    if (name === 'close') return closeBar()
    if (name === 'note') {
      if (!resumable()) return enterNote('')
      // THE KEPT NOTE COMES BACK WITH ALL ITS PICKS: the ones picked again replace their old selves, the rest join.
      const fresh = new Map(shown.infos.map(item => [keyOf(item), item]))
      const merged = parked.infos.map(item => fresh.get(keyOf(item)) ?? item)
      for (const item of shown.infos) if (!merged.includes(item)) merged.push(item)
      const { note } = parked
      parked = null
      shown.infos = merged
      shown.text = build(merged)
      ui.marks(merged.map(item => item.el).filter(el => el.isConnected))
      return enterNote(note)
    }
    if (name === 'note-done') return submitNote()
    if (name === 'note-cancel') {
      leaveNote(true)
      renderBar()
      return holdBar()
    }
    if (name === 'details') {
      details = !details
      stored.set(DETAILS_KEY, details ? 'open' : 'folded')
      renderBar()
      return holdBar()
    }
    if (name === 'shot') return takeShot()
    if (name === 'open') return openInEditor(shown.infos[0].lines[0]?.at)
    if (name === 'open-line') return openInEditor(value)
    if (name === 'copy') return copyValue(value)
    if (name === 'copy-full') return copyFull()
  }

  // ---- Picking -----------------------------------------------------------------------------------------------------

  async function add(el) {
    if (!batch.length) closeBar({ offer: false })
    const index = batch.indexOf(el)
    if (index >= 0) batch.splice(index, 1)
    else batch.push(el)
    ui.marks(batch)
    if (!batch.length) return ui.hover(null)
    const text = build(batch.map(info))
    const done = await copyText(text)
    labelHeldUntil = Date.now() + 900
    // THE CARD IS MADE AGAIN once "Copied" has been read, or it would keep saying it.
    carded = null
    ui.hover(el, [{ text: done ? (batch.length > 1 ? `Copied ${batch.length}` : 'Copied') : 'Could not copy, see the console', tone: 'accent' }])
    if (!done) console.info(`[pinpoint]${text}`)
  }

  /** The keys let go: the picks become one, kept for the agent, and the bar opens on it. */
  function endBatch() {
    const infos = batch.map(info)
    batch = []
    ui.hover(null)
    shown = { id: newId(), infos, note: '', text: build(infos) }
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

  /**
   * A KEY BESIDE THE MODIFIERS IS A SHORTCUT, NOT A PICK (Ctrl+Shift+Z, Cmd+Shift+P): the outline stays hidden until
   * the pointer moves again, so a shortcut never flashes it.
   */
  let shortcut = false
  const MODIFIERS = ['Shift', 'Control', 'Meta', 'Alt', 'AltGraph', 'CapsLock']
  /** The element the card was last made for, so crossing one element reads it once. */
  let carded = null

  function follow(event) {
    if (!armed(event)) {
      ui.hover(null)
      carded = null
      if (batch.length) endBatch()
      return
    }
    if (shortcut) return ui.hover(null)
    const el = document.elementFromPoint(pointer.x, pointer.y)
    if (!el || ui.owns(el)) return ui.hover(null)
    if (Date.now() < labelHeldUntil) return ui.hover(el)
    if (el === carded) return ui.hover(el)
    carded = el
    ui.hover(el, cardOf(el))
  }

  window.addEventListener('pointermove', (event) => {
    pointer = { x: event.clientX, y: event.clientY }
    shortcut = false
    if (ui.owns(event.target)) holdBar()
    follow(event)
  }, { capture: true, passive: true })

  window.addEventListener('keydown', (event) => {
    if (ui.isNote(event)) {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        stop(event)
        return submitNote()
      }
      if (event.key === 'Escape') {
        stop(event)
        return act({ act: 'note-cancel' })
      }
      // EVERY OTHER KEY TYPES IN THE BOX and reaches nothing in the app: no shortcut of the page acts on it.
      return event.stopImmediatePropagation()
    }
    if (event.key === 'Escape' && ui.barOpen()) {
      stop(event)
      return closeBar()
    }
    if (!MODIFIERS.includes(event.key)) shortcut = true
    follow(event)
  }, { capture: true })

  window.addEventListener('keyup', (event) => {
    if (ui.isNote(event)) return event.stopImmediatePropagation()
    follow(event)
  }, { capture: true })

  // THE NOTE'S OWN EVENTS STAY ITS OWN: typing, pasting, its right-click menu, and the keyboard moving in and out of it
  // (a modal's focus trap or outside-focus handler would take the keyboard back, or close itself).
  for (const type of ['keypress', 'beforeinput', 'input', 'paste', 'cut', 'copy', 'compositionstart', 'compositionupdate', 'compositionend', 'contextmenu']) {
    window.addEventListener(type, (event) => {
      if (!ui.isNote(event)) return
      event.stopImmediatePropagation()
      if (type === 'input') ui.fitNote()
    }, { capture: true })
  }
  for (const type of ['focusin', 'focusout', 'focus', 'blur']) {
    window.addEventListener(type, (event) => {
      if (ui.owns(event.target) || ui.owns(event.relatedTarget)) event.stopImmediatePropagation()
    }, { capture: true })
  }

  window.addEventListener('blur', () => {
    ui.hover(null)
    carded = null
    if (batch.length) endBatch()
  })

  // A PRESS ON THE BAR MOVES NO FOCUS AND REACHES NOTHING IN THE APP (a dialog's outside press would close it); a
  // pick takes the whole press, so no text is selected and no button, link or row acts on it.
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
    window.addEventListener(type, (event) => {
      // IN THE NOTE'S BOX A PRESS PLACES THE CARET AND SELECTS, as in any box: kept from the app, not from the box.
      if (ui.isNote(event)) return event.stopImmediatePropagation()
      if (ui.owns(event.target) || (event.button === 0 && armed(event))) return stop(event)
      if (type === 'pointerdown' && ui.barOpen()) closeBar()
    }, { capture: true })
  }

  window.addEventListener('click', (event) => {
    if (ui.isNote(event)) return event.stopImmediatePropagation()
    if (ui.owns(event.target)) {
      stop(event)
      return act(ui.actOf(event))
    }
    if (event.button !== 0 || !armed(event) || !(event.target instanceof Element)) return
    stop(event)
    void add(event.target)
  }, { capture: true })
}

