// WHERE AN ELEMENT IS WRITTEN, read off the store vite-plugin-vue-tracer fills in dev (`globalThis.__vue_tracer__`:
// every rendered vnode's props mapped to the file, line and column of the template call that made it), and Vue's
// own dev handles on an element (`__vnode`, `__vueParentComponent`). Nothing here asks the server.

const TRACER = '__vue_tracer__'

function short(value, max) {
  const text = String(value).replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}...` : text
}

/** "path:line:column" (the column counted from 1, as editors count it) of the call that made these props. */
export function positionOf(props) {
  const position = props ? globalThis[TRACER]?.vnodeToPos?.get(props) : undefined
  return position ? `${position[0]}:${position[1]}:${position[2] + 1}` : undefined
}

export function componentName(instance) {
  const type = instance.type ?? {}
  return type.__name || type.name || type.__file?.split('/').pop()?.replace(/\.vue$/, '') || 'Anonymous'
}

const UNSAID = new Set(['class', 'style', 'key', 'ref', 'ref_for', 'ref_key'])

/** The props a template passed, as written there: words, numbers and switches, no handlers, at most six. */
export function passedProps(props) {
  const out = []
  for (const [key, value] of Object.entries(props ?? {})) {
    if (out.length >= 6) break
    if (UNSAID.has(key) || /^on[A-Z]/.test(key)) continue
    if (typeof value === 'string' && value) out.push(`${key}="${short(value, 40).replace(/"/g, '\'')}"`)
    else if (typeof value === 'number' || typeof value === 'boolean') out.push(`${key}=${value}`)
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
 * WHERE IT IS WRITTEN, innermost first, as `{ at, what }`: the element's own template line (or its nearest
 * ancestor's in the same component, for a bare span), then the line where each component around it is used, with
 * the props passed there, up to the page or layout that holds it (`stopAt`). Only lines `ours` accepts: a library's
 * element has none of ours, so its first line is where we used that library's component.
 */
export function trail(el, { ours, stopAt, max = 6 }) {
  const lines = []
  const owner = el.__vueParentComponent
  for (let node = el, depth = 0; node && depth < 6 && node.__vueParentComponent === owner; node = node.parentElement, depth++) {
    const at = positionOf(node.__vnode?.props)
    if (!at || !ours(at)) continue
    lines.push({ at, what: node === el ? 'this element' : `this element, in its ${node.tagName.toLowerCase()}` })
    break
  }
  for (let instance = owner ?? null; instance && lines.length <= max; instance = instance.parent) {
    const at = positionOf(instance.vnode?.props)
    if (at && ours(at) && !lines.some(line => line.at === at)) lines.push({ at, what: [componentName(instance), ...passedProps(instance.vnode.props)].join(' ') })
    if (stopAt.test(instance.type?.__file ?? '')) break
  }
  return lines
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

function flatten(messages, prefix, out) {
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.push([path, value])
    else if (typeof value === 'function') {
      const source = value.source ?? value.loc?.source
      if (typeof source === 'string') out.push([path, source])
    }
    else if (value && typeof value === 'object') flatten(value, path, out)
  }
  return out
}

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Up to three keys whose message reads as the element's words, exact matches first: each plural form tried on its
 * own, a placeholder (`{count}`) matching any words, a literal (`{'@'}`) as itself.
 */
export function i18nKeys(el) {
  const words = wordsOf(el)
  if (words.length < 2 || words.length > 160) return []
  const messages = messagesOf(el)
  if (!messages) return []
  const exact = []
  const patterned = []
  for (const [key, source] of flatten(messages, '', [])) {
    for (const form of source.split('|')) {
      const text = form.replace(/\{'([^']*)'\}/g, '$1').replace(/\s+/g, ' ').trim()
      if (!text) continue
      if (text === words) {
        exact.push(key)
        break
      }
      if (text.includes('{') && new RegExp(`^${text.split(/\{[^}]*\}/).map(escape).join('.+?')}$`).test(words)) {
        patterned.push(key)
        break
      }
    }
    if (exact.length >= 3) break
  }
  return [...exact, ...patterned].slice(0, 3)
}
