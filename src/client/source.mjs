// WHAT AN ELEMENT IS AND WHERE IT IS WRITTEN, read in the browser off what dev mode already keeps: the store
// vite-plugin-vue-tracer fills (`globalThis.__vue_tracer__`: every rendered vnode's props mapped to the file, line
// and column of the template call that made it), Vue's own dev handles on an element (`__vnode`,
// `__vueParentComponent`), the computed style, and the app's i18n messages. Nothing here asks the server.

const TRACER = '__vue_tracer__'

export function short(value, max) {
  const text = String(value).replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}...` : text
}

/** "path:line:column" (the column counted from 1, as editors count it) of the call that made these props. */
export function positionOf(props) {
  const position = props ? globalThis[TRACER]?.vnodeToPos?.get(props) : undefined
  return position ? `${position[0]}:${position[1]}:${position[2] + 1}` : undefined
}

/** A library's path from its last `node_modules/` on: "@nuxt/ui/dist/runtime/components/PageHero.vue:64:12". */
export function libraryPath(at) {
  const index = at.lastIndexOf('node_modules/')
  return index >= 0 ? at.slice(index + 'node_modules/'.length) : at
}

export function componentName(instance) {
  const type = instance.type ?? {}
  return type.__name || type.name || type.__file?.split('/').pop()?.replace(/\.vue$/, '') || 'Anonymous'
}

const UNSAID = new Set(['class', 'style', 'key', 'ref', 'ref_for', 'ref_key'])

/**
 * The props a template passed, as written there, never handlers: words, numbers and switches, at most six of them
 * cut at 40 characters; or, `full`, every one, objects as short JSON.
 */
export function passedProps(props, full = false) {
  const out = []
  for (const [key, value] of Object.entries(props ?? {})) {
    if (!full && out.length >= 6) break
    if (UNSAID.has(key) || /^on[A-Z]/.test(key)) continue
    if (typeof value === 'string' && value) out.push(`${key}="${short(value, full ? 120 : 40).replace(/"/g, '\'')}"`)
    else if (typeof value === 'number' || typeof value === 'boolean') out.push(`${key}=${value}`)
    else if (full && value && typeof value === 'object') {
      try {
        out.push(`${key}=${short(JSON.stringify(value), 80)}`)
      }
      catch {}
    }
  }
  return out
}

/** The words a person would call the element by: its label, its text, else its title, placeholder or alt. */
export function wordsOf(el) {
  const words = el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('alt') || ''
  return words.replace(/\s+/g, ' ').trim()
}

/** `span "Get started"`: its tag, its id, its words. No angle brackets, so it never reads as the wrapper's tag. */
export function described(el) {
  const words = wordsOf(el)
  return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${words ? ` "${short(words, 80)}"` : ''}`
}

/**
 * WHERE IT IS WRITTEN, innermost first: the element's own template line (`kind: 'element'`, or its nearest ancestor's
 * in the same component, for a bare span), then the line where each component around it is used (`kind:
 * 'component'`, its name and the props passed there), up to the page or layout that holds it (`stopAt`). Only lines
 * `ours` accepts: a library's element has none of ours, so its first line is where we used that library's component.
 */
export function trail(el, { ours, stopAt, max = 6 }) {
  const lines = []
  const owner = el.__vueParentComponent
  for (let node = el, depth = 0; node && depth < 6 && node.__vueParentComponent === owner; node = node.parentElement, depth++) {
    const at = positionOf(node.__vnode?.props)
    if (!at || !ours(at)) continue
    lines.push({ at, kind: 'element', nested: node === el ? null : node.tagName.toLowerCase() })
    break
  }
  for (let instance = owner ?? null; instance && lines.length <= max; instance = instance.parent) {
    const at = positionOf(instance.vnode?.props)
    if (at && ours(at) && !lines.some(line => line.at === at)) lines.push({ at, kind: 'component', name: componentName(instance), props: instance.vnode.props })
    if (stopAt.test(instance.type?.__file ?? '')) break
  }
  return lines
}

/** The element's own template line wherever it is, a library's included: where the library draws it. */
export function drawnAt(el) {
  const owner = el.__vueParentComponent
  for (let node = el, depth = 0; node && depth < 6 && node.__vueParentComponent === owner; node = node.parentElement, depth++) {
    const at = positionOf(node.__vnode?.props)
    if (at) return at
  }
  return null
}

// Wrappers that are no one's part: the part's owner is the first component above them.
const PLUMBING = new Set(['Primitive', 'Slot', 'Fragment', 'BaseTransition', 'Transition', 'TransitionGroup', 'KeepAlive', 'Teleport', 'Suspense', 'ClientOnly', 'RouterLink'])

/**
 * WHICH PART OF A COMPONENT IT IS: the nearest `data-slot` (Nuxt UI and Reka mark every part of a component with
 * one: `title`, `description`, `label`), with the component that draws that part.
 */
export function partOf(el) {
  const slotted = el.closest('[data-slot]')
  if (!slotted) return null
  // THE TEMPLATE THAT WROTE IT (`vnode.ctx`, the instance rendering when the vnode was made), not the component it is
  // mounted inside: a hero's title passed through its container's slot is the hero's part. A wrapper (Reka's
  // `<Primitive as="h1" data-slot="title">`) is skipped the same way, through whoever wrote the wrapper.
  let owner = slotted.__vnode?.ctx ?? slotted.__vueParentComponent
  while (owner && PLUMBING.has(componentName(owner))) owner = owner.vnode?.ctx ?? owner.parent
  return { slot: slotted.getAttribute('data-slot'), owner: owner ? componentName(owner) : null }
}

/** The passed prop whose words are the element's words: where on screen the text came from. */
export function sourceProp(props, words) {
  if (!words) return null
  for (const [key, value] of Object.entries(props ?? {})) {
    if (typeof value === 'string' && value.replace(/\s+/g, ' ').trim() === words) return key
  }
  return null
}

// ---- The look ----------------------------------------------------------------------------------------------------

let paint
/** Any CSS colour as sRGB bytes and alpha, through a canvas, which converts oklch and the rest. */
function rgba(colour) {
  paint ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  paint.clearRect(0, 0, 1, 1)
  paint.fillStyle = '#000'
  paint.fillStyle = colour
  paint.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data
  return [r, g, b, a / 255]
}

const hex = ([r, g, b, a]) => `#${[r, g, b].map(value => value.toString(16).padStart(2, '0')).join('')}${a < 0.99 ? ` ${Math.round(a * 100)}%` : ''}`

/** The background the element is seen on: its own when painted, else the nearest painted one above it. */
function groundOf(el) {
  for (let node = el; node; node = node.parentElement) {
    const colour = rgba(getComputedStyle(node).backgroundColor)
    if (colour[3] > 0.05) return colour
  }
  return [255, 255, 255, 1]
}

function luminance([r, g, b]) {
  const [R, G, B] = [r, g, b].map((value) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

/** WCAG's contrast of the text against what it sits on, a translucent text blended over its ground first. */
function contrast(text, ground) {
  const [r, g, b, a] = text
  const seen = [r * a + ground[0] * (1 - a), g * a + ground[1] * (1 - a), b * a + ground[2] * (1 - a)]
  const [light, dark] = [luminance(seen), luminance(ground)].sort((x, y) => y - x)
  return Math.round(((light + 0.05) / (dark + 0.05)) * 10) / 10
}

/** "8px 16px", or nothing when every side is 0. */
function box(style, property) {
  const sides = ['top', 'right', 'bottom', 'left'].map(side => style.getPropertyValue(`${property}-${side}`))
  if (sides.every(side => side === '0px')) return null
  const [t, r, b, l] = sides
  if (t === b && r === l) return t === r ? t : `${t} ${r}`
  return sides.join(' ')
}

export function lookOf(el) {
  const style = getComputedStyle(el)
  const rect = el.getBoundingClientRect()
  const ground = groundOf(el)
  const parts = [
    `${Math.round(rect.width)}×${Math.round(rect.height)}`,
    `${style.fontFamily.split(',')[0].replace(/['"]/g, '').trim()} ${style.fontSize}/${style.lineHeight} ${style.fontWeight}`,
    `${hex(rgba(style.color))} on ${hex(ground)}`,
  ]
  if (/flex|grid/.test(style.display)) parts.push(`${style.display}${style.flexDirection === 'column' ? ' column' : ''}${style.gap && style.gap !== 'normal' && style.gap !== '0px' ? ` gap ${style.gap}` : ''}`)
  const padding = box(style, 'padding')
  const margin = box(style, 'margin')
  if (padding) parts.push(`padding ${padding}`)
  if (margin) parts.push(`margin ${margin}`)
  if (style.borderRadius && style.borderRadius !== '0px') parts.push(`radius ${style.borderRadius}`)
  return { size: parts[0], line: parts.join(' · '), classes: (el.getAttribute('class') ?? '').replace(/\s+/g, ' ').trim(), contrast: contrast(rgba(style.color), ground), large: Number.parseFloat(style.fontSize) >= 24 || (Number.parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700) }
}

// ---- Accessibility -----------------------------------------------------------------------------------------------

const ROLES = { a: 'link', button: 'button', nav: 'navigation', main: 'main', header: 'banner', footer: 'contentinfo', aside: 'complementary', form: 'form', ul: 'list', ol: 'list', li: 'listitem', img: 'img', textarea: 'textbox', select: 'combobox', dialog: 'dialog', table: 'table', section: 'region', article: 'article', hr: 'separator' }

function roleOf(el) {
  const explicit = el.getAttribute('role')
  if (explicit) return explicit
  const tag = el.tagName.toLowerCase()
  if (/^h[1-6]$/.test(tag)) return `heading ${tag[1]}`
  if (tag === 'a') return el.hasAttribute('href') ? 'link' : null
  if (tag === 'input') {
    const type = el.getAttribute('type') ?? 'text'
    return { checkbox: 'checkbox', radio: 'radio', range: 'slider', button: 'button', submit: 'button', search: 'searchbox' }[type] ?? 'textbox'
  }
  return ROLES[tag] ?? null
}

function nameOf(el) {
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const words = labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ').trim()
    if (words) return words
  }
  return wordsOf(el)
}

export function a11yOf(el, look) {
  const role = roleOf(el)
  const name = nameOf(el)
  const focusable = el.tabIndex >= 0 && !el.hasAttribute('disabled')
  const hasText = Boolean(el.textContent?.trim())
  const enough = look.large ? 3 : 4.5
  return {
    line: [role ?? 'no role', name ? `name "${short(name, 60)}"` : 'no name', focusable ? 'focusable' : 'not focusable', hasText ? `contrast ${look.contrast}:1${look.contrast < enough ? ` (under ${enough}:1)` : ''}` : null].filter(Boolean).join(' · '),
    low: hasText && look.contrast < enough,
  }
}

// ---- Data ----------------------------------------------------------------------------------------------------------

export function dataOf(el) {
  const own = [...el.attributes]
    .filter(attribute => attribute.name.startsWith('data-') && !attribute.name.startsWith('data-v-') && attribute.name !== 'data-pinpoint')
    .map(attribute => (attribute.value ? `${attribute.name}="${short(attribute.value, 60)}"` : attribute.name))
  const landmark = el.hasAttribute('data-landmark') ? null : el.closest('[data-landmark]')?.getAttribute('data-landmark')
  if (landmark) own.push(`in landmark ${landmark}`)
  return own
}

// ---- The translation key behind the words (vue-i18n) -------------------------------------------------------------

const unref = value => (value && value.__v_isRef ? value.value : value)

/** The app's i18n, whichever way it is reachable: Nuxt's `$i18n`, vue-i18n's dev handle, or the global property. */
function messagesOf(el) {
  let node = el
  while (node && !node.__vue_app__) node = node.parentElement
  const app = node?.__vue_app__ ?? document.querySelector('[data-v-app]')?.__vue_app__
  if (!app) return null
  for (const i18n of [app.$nuxt?.$i18n, app.__VUE_I18N__?.global, app.config?.globalProperties?.$i18n]) {
    if (!i18n) continue
    const locale = unref(i18n.locale)
    const messages = unref(i18n.messages)?.[locale] ?? i18n.getLocaleMessage?.(locale)
    if (messages && typeof messages === 'object') return messages
  }
  return null
}

// A MESSAGE MAY BE PRECOMPILED (@intlify's AST, which Nuxt i18n ships): a resource node (`type` 0) whose `loc.source`
// is the message as written, in dev; else its body put back together, from the long keys or the minified ones
// (`t`, `b`, `s`, `i`, `c`, `v`, `k`). Node types: 1 plural, 2 message, 3 text, 4 named, 5 list, 9 literal.
const typeOf = node => node?.type ?? node?.t
const isResource = value => value && typeof value === 'object' && typeOf(value) === 0 && ('body' in value || 'b' in value)

function bodySource(body) {
  if (!body) return undefined
  if (typeOf(body) === 1) return (body.cases ?? body.c ?? []).map(bodySource).join(' | ')
  const fixed = body.static ?? body.s
  if (typeof fixed === 'string') return fixed
  return (body.items ?? body.i ?? []).map((item) => {
    const type = typeOf(item)
    if (type === 3 || type === 9) return item.value ?? item.v ?? ''
    if (type === 4 || type === 5) return `{${item.key ?? item.k}}`
    return ''
  }).join('')
}

function messageSource(value) {
  if (typeof value === 'string') return value
  if (typeof value === 'function') return value.source ?? value.loc?.source
  if (isResource(value)) return typeof value.loc?.source === 'string' ? value.loc.source : bodySource(value.body ?? value.b)
  return undefined
}

function flatten(messages, prefix, out) {
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string' || typeof value === 'function' || isResource(value)) {
      const source = messageSource(value)
      if (typeof source === 'string') out.push([path, source])
    }
    else if (value && typeof value === 'object') {
      flatten(value, path, out)
    }
  }
  return out
}

// THE FLATTENED MESSAGES ARE KEPT while the locale's object and its namespaces stay the same: the hover card asks on
// every element the pointer crosses. A namespace loaded later makes the count differ, and they are read again.
let flatCache = { messages: null, count: -1, flat: [] }
function flatOf(messages) {
  const count = Object.keys(messages).length
  if (flatCache.messages !== messages || flatCache.count !== count) flatCache = { messages, count, flat: flatten(messages, '', []) }
  return flatCache.flat
}

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Up to three keys whose message reads as the element's words, exact matches first: each plural form tried on its
 * own, a placeholder (`{count}`) matching any words, a literal (`{'@'}`) as itself. A form whose own words are under
 * 40% of the element's (`{name}` alone matches anything) is no match.
 */
export function i18nKeys(el) {
  const words = wordsOf(el)
  if (words.length < 2 || words.length > 160) return []
  const messages = messagesOf(el)
  if (!messages) return []
  const exact = []
  const patterned = []
  for (const [key, source] of flatOf(messages)) {
    for (const form of source.split('|')) {
      const text = form.replace(/\{'([^']*)'\}/g, '$1').replace(/\s+/g, ' ').trim()
      if (!text) continue
      if (text === words) {
        exact.push(key)
        break
      }
      if (!text.includes('{')) continue
      const fixed = text.split(/\{[^}]*\}/)
      if (fixed.join('').trim().length < Math.max(3, words.length * 0.4)) continue
      if (new RegExp(`^${fixed.map(escape).join('.+?')}$`).test(words)) {
        patterned.push(key)
        break
      }
    }
    if (exact.length >= 3) break
  }
  return [...exact, ...patterned].slice(0, 3)
}

// ---- Everything about one element, for the block, the card and the panel -----------------------------------------

/**
 * THE ELEMENT DESCRIBED ONCE: what the short block, the hover card and the details panel each read. The part is said on
 * the first component line only when that component draws the part (`UPageHero › title`); otherwise it is the
 * panel's own row.
 */
export function describe(el, { ours, stopAt }) {
  const words = wordsOf(el)
  const lines = trail(el, { ours, stopAt })
  const part = partOf(el)
  const first = lines.find(line => line.kind === 'component')
  const look = lookOf(el)
  const drawn = drawnAt(el)
  return {
    el,
    label: described(el),
    lines,
    part,
    partOnLine: Boolean(part && first && part.owner === first.name && lines[0] === first),
    from: first ? sourceProp(first.props, words) : null,
    library: drawn && !ours(drawn) ? libraryPath(drawn) : null,
    keys: i18nKeys(el),
    look,
    a11y: a11yOf(el, look),
    data: dataOf(el),
    props: first ? passedProps(first.props, true) : [],
  }
}

/** One trail line as the block writes it: "path:line:col (UPageHero › title · title="..." ...)". */
export function lineText(info, line) {
  if (line.kind === 'element') return `${line.at} (this element${line.nested ? `, in its ${line.nested}` : ''})`
  const head = `${line.name}${info.partOnLine && line === info.lines[0] ? ` › ${info.part.slot}` : ''}`
  const props = passedProps(line.props)
  return `${line.at} (${head}${props.length ? ` · ${props.join(' ')}` : ''})`
}
