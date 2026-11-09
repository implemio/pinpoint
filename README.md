# pinpoint

Point at an element in your running Vue or Nuxt app and get **where it is written**: the page, the element, and the
lines of your own `.vue` files that draw it, innermost first. Paste it into a chat, an issue or an AI agent's prompt,
or let the agent read it over MCP with no paste at all.

```
<picked page="/" viewport="1440x900" theme="dark">
span "Get started"
apps/web/app/pages/index.vue:46:9 (UButton size="xl" to="/login")
apps/web/app/pages/index.vue:36:5 (UPageHero)
i18n: landing.hero.cta
</picked>
```

Dev only: nothing of it is in a build.

## Use

- **Hold Ctrl+Shift** (Cmd+Shift on a Mac): an outline follows the pointer, labelled with the file and line that draws
  what is under it.
- **Click** to pick it. Click more elements while holding the keys to pick several; they are numbered. A click on a
  picked one drops it. The click never reaches the page, so a button or link you pick does not act.
- **Let go.** The block is already on your clipboard (it is copied at every click), and a bar opens by the element:
  - **Note**: type what you want done; Enter copies the block again with `note: ...` inside it. The keys go to the bar,
    never to a field in the page.
  - **Screenshot**: a PNG of the picked elements, on the clipboard beside the text (where you paste takes the one it
    reads), and kept for the agent.
  - **Open in editor**: the first line, in your editor (through `launch-editor`; set `LAUNCH_EDITOR`, for example to
    `code`, if it guesses wrong).
  - Escape, a press anywhere else, or 8 seconds of nothing closes it.

What the block holds:

- `page`, `viewport`, and `theme="dark"` when the page wears a `dark` class.
- The element: its tag, id and words (its label, text, title, placeholder or alt).
- Its template line (`this element`), then each component around it where it is used, with the props passed there
  (words, numbers and switches; never handlers), up to the page or layout. Lines inside `node_modules` are left out,
  so for an element a library draws, the first line is where you used that library's component.
- `i18n:` the translation keys whose message reads as the element's words, when the app uses vue-i18n.
- Any lines your app adds (`addPickContext`, below) and your note.

## Install

From GitHub, as a dev dependency:

```bash
pnpm add -D github:implemio/pinpoint#semver:^0.1.0
```

`pnpm update @implemio/pinpoint` then moves to the newest tag in that range.

### Nuxt

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@implemio/pinpoint'],
  pinpoint: {}, // options, below
})
```

### Vue on Vite

```ts
// vite.config.ts
import vue from '@vitejs/plugin-vue'
import pinpoint from '@implemio/pinpoint/vite'

export default { plugins: [vue(), pinpoint()] }
```

The picker is put in `index.html` for you.

### The agent's side (MCP)

`pinpoint-mcp` is a stdio MCP server with two tools: `latest_pick` (the last pick, its note, and its screenshot as an
image) and `recent_picks`. Start it from the project's root. In a `.mcp.json`:

```json
{
  "mcpServers": {
    "pinpoint": { "command": "node", "args": ["node_modules/@implemio/pinpoint/src/mcp.mjs"] }
  }
}
```

Then "make this bigger" is enough: the agent calls `latest_pick` to learn what "this" is.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `modifiers` | `['mod', 'shift']` | The keys held to pick; `mod` is Ctrl, or Cmd on a Mac. Add `'alt'` to need it too. |
| `tag` | `'picked'` | The tag the block is wrapped in. |
| `skip` | `['node_modules/']` | A source path holding any of these is not yours. |
| `stopAt` | `'(^\|/)(pages\|layouts)/'` | A regular expression's source: the trail stops at the first component whose file matches. |
| `bar` | `true` | The bar after a pick. |
| `barTimeout` | `8000` | How long the bar stays while nothing happens on it, in milliseconds. |
| `endpoint` | `'/__pinpoint'` | Where the dev server's half listens. |
| `tracer` | `true` | Add `vite-plugin-vue-tracer`, which records each element's source line. Harmless beside Nuxt DevTools' own. |
| `enabled` | `true` | Nuxt only: off turns the module off. |

## From your app

```ts
import { addPickContext, lastPick } from '@implemio/pinpoint/client'

// A line in every block: the page's recent errors, the signed-in role, a feature flag.
addPickContext(({ elements, page }) => `role: ${currentRole()}`)

// The last pick in this tab, to attach to a bug report.
lastPick() // { id, text, note, page, at } or null
```

Code that should not import a dev dependency can use the globals instead: push a function onto
`globalThis.__pinpointContext` (an array, made if missing), and read `globalThis.__pinpoint?.last`.

## How it works

- `vite-plugin-vue-tracer` wraps each template call in dev so every rendered vnode knows its file, line and column
  (the same data Nuxt DevTools' component inspector uses). The picker reads it off the element (`__vnode`,
  `__vueParentComponent`) in the browser; nothing is asked of the server to build the block.
- A Vite middleware at `/__pinpoint` keeps the last 20 picks and their screenshots in
  `node_modules/.cache/pinpoint` at the workspace root, which is what the MCP server reads. Every checkout keeps its
  own.
- The outline and the bar live in one shadow root on `<html>`. The bar takes no focus and handles presses before the
  page does, so a modal's focus trap or outside-press handler never notices it.

## Limits

- Vue 3 and Vite only (Nuxt 3 and 4 included). React has no source line per element to read.
- Inside an iframe from another origin, the clipboard needs the frame to allow it (`allow="clipboard-write"`); the
  pick still reaches the MCP server without it.
- A page built with render functions in a library shows where you used the library's component, not its insides.

## License

MIT
