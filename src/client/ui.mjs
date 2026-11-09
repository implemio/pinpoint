// WHAT THE PICKER DRAWS: the outline that follows the pointer, a mark on each picked element and the bar after a
// pick, in one shadow root over the page, so the app's styles never reach it and it never reaches the app's. It
// takes no focus and handles no event itself: the controller reads presses off the composed path (`actOf`), so a
// focus trap or an outside-press handler in the app never sees the bar.

const CSS = `
:host {
  all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;
  --pp-accent: var(--ui-primary, #0ea5e9); --pp-ink: var(--ui-bg-inverted, #111827); --pp-paper: var(--ui-bg, #ffffff);
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.box { position: fixed; border: 2px solid var(--pp-accent); border-radius: 4px; pointer-events: none; }
.picked { background: color-mix(in srgb, var(--pp-accent) 10%, transparent); }
.tag, .num {
  position: absolute; left: -2px; padding: 1px 6px; white-space: nowrap;
  font: 500 11px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.tag { bottom: 100%; margin-bottom: 4px; border-radius: 4px; background: var(--pp-ink); color: var(--pp-paper); }
.num { top: -2px; border-radius: 3px 0 4px 0; background: var(--pp-accent); color: #fff; }
.bar {
  position: fixed; display: flex; align-items: center; gap: 2px; padding: 4px; max-width: calc(100vw - 16px);
  border-radius: 8px; background: var(--pp-ink); color: var(--pp-paper); pointer-events: auto;
  font: 12px/1.4 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; box-shadow: 0 6px 24px rgb(0 0 0 / 0.3);
}
.status { padding: 4px 8px; white-space: nowrap; opacity: 0.85; }
.act { padding: 4px 8px; border-radius: 6px; cursor: pointer; white-space: nowrap; user-select: none; }
.act:hover { background: color-mix(in srgb, var(--pp-paper) 16%, transparent); }
.sep { width: 1px; align-self: stretch; margin: 2px; background: color-mix(in srgb, var(--pp-paper) 22%, transparent); }
.note {
  display: flex; align-items: center; min-width: 16rem; max-width: 28rem; padding: 4px 8px; overflow: hidden;
  border-radius: 6px; background: color-mix(in srgb, var(--pp-paper) 12%, transparent); white-space: pre;
}
.placeholder { opacity: 0.6; }
.caret { display: inline-block; flex: none; width: 1px; height: 1.1em; margin-left: 1px; background: currentColor; animation: blink 1s steps(1) infinite; }
@keyframes blink { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .caret { animation: none; } }
`

export function createUi() {
  const host = document.createElement('pinpoint-ui')
  host.setAttribute('data-pinpoint', '')
  host.setAttribute('data-v-inspector-ignore', '')
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `<style>${CSS}</style><div class="box" data-hover hidden><span class="tag"></span></div><div data-marks></div><div class="bar" role="toolbar" hidden></div>`
  const hoverBox = root.querySelector('[data-hover]')
  const hoverTag = hoverBox.firstElementChild
  const marksLayer = root.querySelector('[data-marks]')
  const bar = root.querySelector('.bar')
  // ON <html>, NOT <body>: a transform on the body would make every fixed box inside it relative to the body.
  document.documentElement.append(host)

  let marked = []
  let anchor = null

  const place = (box, el) => {
    const rect = el.getBoundingClientRect()
    Object.assign(box.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
  }

  /** Under the anchor when it fits, else over it; inside the window across. */
  const placeBar = () => {
    if (bar.hidden || !anchor) return
    const rect = anchor.getBoundingClientRect()
    const size = bar.getBoundingClientRect()
    const below = rect.bottom + 8
    const top = below + size.height <= innerHeight - 8 ? below : Math.max(8, rect.top - 8 - size.height)
    const left = Math.min(Math.max(8, rect.left), Math.max(8, innerWidth - size.width - 8))
    Object.assign(bar.style, { left: `${left}px`, top: `${top}px` })
  }

  const reposition = () => {
    marked.forEach((el, index) => marksLayer.children[index] && place(marksLayer.children[index], el))
    placeBar()
  }
  window.addEventListener('scroll', reposition, { capture: true, passive: true })
  window.addEventListener('resize', reposition, { passive: true })

  const node = (tag, className, text) => {
    const el = document.createElement(tag)
    el.className = className
    if (text !== undefined) el.textContent = text
    return el
  }

  return {
    owns: target => target === host,

    hover(el, label) {
      if (!el) {
        hoverBox.hidden = true
        return
      }
      place(hoverBox, el)
      if (label !== undefined) hoverTag.textContent = label
      hoverBox.hidden = false
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

    /**
     * The bar's parts, in order: `{ status }`, `{ sep: true }`, `{ act, text }`, or `{ note }` (the words typed so
     * far, drawn as a box with its caret; the keys never go to a real field, so no focus moves).
     */
    showBar(el, parts) {
      if (el) anchor = el
      bar.replaceChildren(...parts.map((part) => {
        if (part.sep) return node('span', 'sep')
        if (part.status !== undefined) return node('span', 'status', part.status)
        if (part.note !== undefined) {
          const box = node('span', 'note')
          box.append(part.note ? document.createTextNode(part.note) : node('span', 'placeholder', 'What about it?'), node('span', 'caret'))
          return box
        }
        const act = node('span', 'act', part.text)
        act.dataset.act = part.act
        act.setAttribute('role', 'button')
        return act
      }))
      bar.hidden = false
      placeBar()
    },

    hideBar() {
      bar.hidden = true
      anchor = null
    },

    barOpen: () => !bar.hidden,

    /** The act pressed, read off the composed path of an event the shadow root retargeted to the host. */
    actOf: event => event.composedPath().find(target => target instanceof HTMLElement && target.dataset?.act)?.dataset.act,
  }
}
