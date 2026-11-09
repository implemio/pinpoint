// WHAT THE PICKER DRAWS: the outline that follows the pointer with its card, a mark on each picked element, and the
// dock after a pick (the bar, and the details panel under it), in one shadow root over the page, so the app's styles
// never reach it and it never reaches the app's. It takes no focus and handles no event itself: the controller reads
// presses off the composed path (`actOf`), so a focus trap or an outside-press handler in the app never sees it.
//
// ONE LOOK IN EVERY APP: its own colours, never the app's tokens, so the outline and the bar are the same in every
// project, theme and mode. A dark surface, and one teal accent ringed in a dark halo, so it shows on white and on
// black alike.

const CSS = `
:host {
  all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; color-scheme: dark;
  --pp-accent: oklch(79.8% 0.065 193.3);
  --pp-accent-ink: oklch(24% 0.03 193);
  --pp-surface: oklch(21% 0.006 250);
  --pp-raised: oklch(27% 0.008 250);
  --pp-line: oklch(100% 0 0 / 0.12);
  --pp-text: oklch(95% 0.005 250);
  --pp-muted: oklch(70% 0.012 250);
  --pp-warn: oklch(82% 0.13 75);
  --pp-halo: rgb(0 0 0 / 0.55);
  --pp-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --pp-sans: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.box { position: fixed; border: 2px solid var(--pp-accent); border-radius: 4px; pointer-events: none; box-shadow: 0 0 0 1px var(--pp-halo), inset 0 0 0 1px var(--pp-halo); }
.picked { background: color-mix(in srgb, var(--pp-accent) 12%, transparent); }
.noted { border-style: dashed; }
.notetag { position: absolute; right: -2px; bottom: 100%; padding: 0 6px; border-radius: 4px 4px 0 0; background: var(--pp-accent); color: var(--pp-accent-ink); font: 600 10px/1.6 var(--pp-sans); white-space: nowrap; }
.num { position: absolute; left: -2px; top: -2px; padding: 0 6px; border-radius: 3px 0 4px 0; background: var(--pp-accent); color: var(--pp-accent-ink); font: 600 11px/1.6 var(--pp-mono); }
.card {
  position: fixed; max-width: min(32rem, calc(100vw - 16px)); padding: 4px 8px; border: 1px solid var(--pp-line); border-radius: 6px;
  background: var(--pp-surface); color: var(--pp-text); font: 11px/1.5 var(--pp-mono); white-space: nowrap; overflow: hidden;
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.35); pointer-events: none;
}
.card div { overflow: hidden; text-overflow: ellipsis; }
.accent { color: var(--pp-accent); }
.muted { color: var(--pp-muted); }
.dock { position: fixed; display: flex; flex-direction: column; gap: 4px; max-width: calc(100vw - 16px); pointer-events: auto; }
.bar {
  display: flex; align-items: flex-end; gap: 2px; align-self: flex-start; padding: 4px; border: 1px solid var(--pp-line); border-radius: 8px;
  background: var(--pp-surface); color: var(--pp-text); font: 12px/1.4 var(--pp-sans); box-shadow: 0 6px 24px rgb(0 0 0 / 0.35);
}
.status { padding: 4px 8px; white-space: nowrap; color: var(--pp-accent); }
.act { padding: 4px 8px; border-radius: 6px; cursor: pointer; white-space: nowrap; user-select: none; }
.act:hover, .act.on { background: var(--pp-raised); }
.act.small { display: flex; align-items: center; padding: 4px 5px; color: var(--pp-muted); }
.act svg { width: 13px; height: 13px; }
.act.small:hover { color: var(--pp-text); }
.sep { width: 1px; align-self: stretch; margin: 2px; background: var(--pp-line); }
.note {
  all: unset; display: block; box-sizing: border-box; width: min(28rem, calc(100vw - 160px)); max-height: 40vh; padding: 4px 8px;
  border-radius: 6px; background: var(--pp-raised); color: var(--pp-text); font: 12px/1.45 var(--pp-sans); white-space: pre-wrap;
  overflow-wrap: anywhere; overflow-y: auto; resize: none; caret-color: var(--pp-accent); cursor: text;
}
.note::placeholder { color: var(--pp-muted); }
.panel {
  width: min(38rem, calc(100vw - 16px)); padding: 8px 10px; overflow: auto; border: 1px solid var(--pp-line); border-radius: 8px;
  background: var(--pp-surface); color: var(--pp-text); font: 11.5px/1.55 var(--pp-mono); box-shadow: 0 6px 24px rgb(0 0 0 / 0.35);
}
.pick + .pick { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--pp-line); }
.head { margin-bottom: 2px; font-weight: 600; overflow-wrap: anywhere; }
.row { display: flex; gap: 10px; }
.key { flex: none; width: 3.75rem; color: var(--pp-muted); }
.val { min-width: 0; overflow-wrap: anywhere; }
.val > span + span::before { content: ' · '; color: var(--pp-muted); }
.link { cursor: pointer; text-decoration: underline; text-decoration-color: var(--pp-line); text-underline-offset: 2px; }
.link:hover { color: var(--pp-accent); text-decoration-color: currentColor; }
.lib { color: var(--pp-muted); }
.warn { color: var(--pp-warn); }
.foot { display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px; }
.button { padding: 3px 10px; border: 1px solid var(--pp-line); border-radius: 6px; font: 12px/1.4 var(--pp-sans); cursor: pointer; user-select: none; }
.button:hover { background: var(--pp-raised); }
`

export function createUi() {
  const host = document.createElement('pinpoint-ui')
  host.setAttribute('data-pinpoint', '')
  host.setAttribute('data-v-inspector-ignore', '')
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `<style>${CSS}</style><div class="box" data-hover hidden></div><div class="card" data-card hidden></div><div data-noted></div><div data-marks></div><div class="dock" hidden><div class="bar" role="toolbar"></div><div class="panel" hidden></div></div>`
  const hoverBox = root.querySelector('[data-hover]')
  const card = root.querySelector('[data-card]')
  const marksLayer = root.querySelector('[data-marks]')
  const notedLayer = root.querySelector('[data-noted]')
  const dock = root.querySelector('.dock')
  const bar = root.querySelector('.bar')
  const panel = root.querySelector('.panel')
  // ON <html>, NOT <body>: a transform on the body would make every fixed box inside it relative to the body.
  document.documentElement.append(host)

  let marked = []
  let notedMarks = []
  let anchor = null
  let hovered = null
  /** The note's box while one is typed: a real textarea, so it edits as any does. */
  let noteArea = null

  const node = (tag, className, text) => {
    const el = document.createElement(tag)
    if (className) el.className = className
    if (text !== undefined) el.textContent = text
    return el
  }
  const actable = (el, act, value) => {
    el.dataset.act = act
    if (value !== undefined) el.dataset.value = value
    el.setAttribute('role', 'button')
    return el
  }

  const place = (box, el) => {
    const rect = el.getBoundingClientRect()
    Object.assign(box.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
  }
  /** Lucide's trash-2, drawn in the text's colour. */
  const trashIcon = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    for (const [name, value] of Object.entries({ 'viewBox': '0 0 24 24', 'fill': 'none', 'stroke': 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(name, value)
    for (const d of ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2', 'M10 11v6', 'M14 11v6']) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', d)
      svg.append(path)
    }
    return svg
  }
  const clampLeft = (left, width) => Math.min(Math.max(8, left), Math.max(8, innerWidth - width - 8))

  /** Over the element when there is room, else under it, else inside its top; always inside the window across. */
  const placeCard = () => {
    if (card.hidden || !hovered) return
    const rect = hovered.getBoundingClientRect()
    const size = card.getBoundingClientRect()
    const top = rect.top - size.height - 6 >= 4 ? rect.top - size.height - 6 : rect.bottom + 6 + size.height <= innerHeight - 4 ? rect.bottom + 6 : Math.max(4, rect.top + 4)
    Object.assign(card.style, { left: `${clampLeft(rect.left, size.width)}px`, top: `${top}px` })
  }

  /**
   * THE DOCK under the anchor when it fits, else over it, else on the side with more room, the panel scrolling in
   * what is left; inside the window's foot when the anchor fills the window.
   */
  const placeDock = () => {
    if (dock.hidden || !anchor) return
    const rect = anchor.getBoundingClientRect()
    const barHeight = bar.getBoundingClientRect().height
    const below = innerHeight - rect.bottom - 16
    const above = rect.top - 16
    const need = barHeight + (panel.hidden ? 0 : panel.scrollHeight + 6)
    let side = below >= need ? 'below' : above >= need ? 'above' : below >= above ? 'below' : 'above'
    let room = side === 'below' ? below : above
    if (room < barHeight + 48) {
      side = 'inside'
      room = innerHeight * 0.6
    }
    panel.style.maxHeight = `${Math.max(96, room - barHeight - 6)}px`
    const size = dock.getBoundingClientRect()
    const top = side === 'below' ? rect.bottom + 8 : side === 'above' ? rect.top - 8 - size.height : innerHeight - 8 - size.height
    Object.assign(dock.style, { left: `${clampLeft(rect.left, size.width)}px`, top: `${Math.max(8, top)}px` })
  }

  /** The note's box as tall as its words, up to 40% of the window, then it scrolls. */
  const fitNote = () => {
    if (!noteArea) return
    noteArea.style.height = 'auto'
    noteArea.style.height = `${Math.min(noteArea.scrollHeight, innerHeight * 0.4)}px`
    placeDock()
  }

  const reposition = () => {
    marked.forEach((el, index) => marksLayer.children[index] && place(marksLayer.children[index], el))
    notedMarks.forEach((mark, index) => notedLayer.children[index] && place(notedLayer.children[index], mark.el))
    if (hovered && !hoverBox.hidden) place(hoverBox, hovered)
    placeCard()
    placeDock()
  }
  window.addEventListener('scroll', reposition, { capture: true, passive: true })
  window.addEventListener('resize', reposition, { passive: true })

  return {
    owns: target => target === host,

    /** The outline on `el` and, given `lines` (`[{ text, tone }]` rows), its card; nothing for `null`. */
    hover(el, lines) {
      hovered = el
      if (!el) {
        hoverBox.hidden = true
        card.hidden = true
        return
      }
      place(hoverBox, el)
      hoverBox.hidden = false
      if (lines) {
        card.replaceChildren(...lines.map(line => node('div', line.tone ?? '', line.text)))
        card.hidden = false
      }
      placeCard()
    },

    marks(elements) {
      marked = elements
      marksLayer.replaceChildren(...elements.map((el, index) => {
        const box = node('div', 'box picked')
        if (elements.length > 1) box.append(node('span', 'num', String(index + 1)))
        place(box, el)
        return box
      }))
    },

    /** A dashed outline and a tag (`{ el, text }`) on every element with a note; none for `[]`. */
    noted(marks) {
      notedMarks = marks
      notedLayer.replaceChildren(...marks.map((mark) => {
        const box = node('div', 'box noted')
        box.append(node('span', 'notetag', mark.text))
        place(box, mark.el)
        return box
      }))
    },

    /**
     * The bar's parts, in order: `{ status }`, `{ sep: true }`, `{ act, text, on }`, or `{ note }` (the note's box,
     * holding those words; focus it with `focusNote`).
     */
    showBar(el, parts) {
      if (el) anchor = el
      noteArea = null
      bar.replaceChildren(...parts.map((part) => {
        if (part.sep) return node('span', 'sep')
        if (part.status !== undefined) return node('span', 'status', part.status)
        if (part.note !== undefined) {
          noteArea = Object.assign(document.createElement('textarea'), { className: 'note', rows: 1, value: part.note, spellcheck: true, placeholder: 'What about it? Enter copies, Shift+Enter is a new line' })
          return noteArea
        }
        const button = actable(node('span', ['act', part.on ? 'on' : '', part.small ? 'small' : ''].filter(Boolean).join(' '), part.text), part.act)
        if (part.icon === 'trash') button.append(trashIcon())
        if (part.title) {
          button.title = part.title
          button.setAttribute('aria-label', part.title)
        }
        return button
      }))
      dock.hidden = false
      placeDock()
      fitNote()
    },

    noteValue: () => noteArea?.value ?? '',
    fitNote,
    /** The keyboard into the note, its caret at the end. */
    focusNote() {
      if (!noteArea) return
      noteArea.focus({ preventScroll: true })
      noteArea.setSelectionRange(noteArea.value.length, noteArea.value.length)
    },
    blurNote: () => noteArea?.blur(),
    /** Whether an event is the note's own (a key, a press, its input), read off the composed path. */
    isNote: event => Boolean(noteArea) && event.composedPath().includes(noteArea),

    /**
     * The details panel, or none. `picks` is `[{ head, rows: [{ key, items: [{ text, act, value, tone }] }] }]`; an item
     * with an act is pressable (a source line opens in the editor, a key is copied). `foot` is the panel's buttons.
     */
    showPanel(picks, foot = []) {
      if (!picks) {
        panel.hidden = true
        panel.replaceChildren()
        placeDock()
        return
      }
      panel.replaceChildren(...picks.map((pick) => {
        const section = node('div', 'pick')
        section.append(node('div', 'head', pick.head))
        for (const row of pick.rows) {
          const line = node('div', 'row')
          const value = node('div', 'val')
          for (const item of row.items) {
            const span = node('span', [item.act ? 'link' : '', item.tone ?? ''].join(' ').trim(), item.text)
            value.append(item.act ? actable(span, item.act, item.value) : span)
          }
          line.append(node('span', 'key', row.key), value)
          section.append(line)
        }
        return section
      }), ...(foot.length ? [(() => {
        const bottom = node('div', 'foot')
        bottom.append(...foot.map(button => actable(node('span', 'button', button.text), button.act)))
        return bottom
      })()] : []))
      panel.hidden = false
      placeDock()
    },

    hideBar() {
      dock.hidden = true
      panel.hidden = true
      anchor = null
      noteArea = null
    },

    barOpen: () => !dock.hidden,

    /** The act pressed and its value, read off the composed path of an event the shadow root retargeted to the host. */
    actOf(event) {
      const target = event.composedPath().find(el => el instanceof HTMLElement && el.dataset?.act)
      return target ? { act: target.dataset.act, value: target.dataset.value } : null
    },
  }
}
