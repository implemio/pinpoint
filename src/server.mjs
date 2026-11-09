// THE DEV SERVER'S HALF: a connect middleware the Vite plugin mounts at `/__pinpoint`. It keeps each pick for the
// MCP server, keeps a pick's screenshot beside it, and opens a source line in the editor. Dev only: nothing here
// is reachable from a build.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
import launchEditor from 'launch-editor'
import { readPicks, storeDir, workspaceRoot, writePicks } from './store.mjs'

/** How many picks are kept; an older one goes with its screenshot. */
const KEEP = 20
const ID = /^[a-z0-9]{4,40}$/

// ---- Opening a line in the editor --------------------------------------------------------------------------------

/** Editors that take VS Code's `-r -g file:line:column`. */
const CODE_LIKE = /^(code|code-insiders|codium|cursor|windsurf)(\.cmd|\.exe)?$/

/** Runs the editor's command and says whether it took: exit 0, or still running after a while (it stayed open). */
function run(command, args, env) {
  return new Promise((done) => {
    let stderr = ''
    let child
    try {
      child = spawn(command, args, { env, stdio: ['ignore', 'ignore', 'pipe'], shell: process.platform === 'win32' })
    }
    catch (error) {
      return done({ ok: false, error: String(error?.message ?? error) })
    }
    const timer = setTimeout(() => {
      child.unref()
      done({ ok: true })
    }, 8000)
    child.stderr?.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => {
      clearTimeout(timer)
      done({ ok: false, error: error.message })
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      done(code === 0 ? { ok: true } : { ok: false, error: stderr.trim().split('\n').pop() || `${command} ended with code ${code}` })
    })
  })
}

/**
 * VS CODE'S COMMAND REACHES ITS WINDOW THROUGH THE SOCKET ITS TERMINAL GAVE IT (`VSCODE_IPC_HOOK_CLI`), and a dev server
 * started outside a VS Code terminal can hold one that is gone. Without it, and without the remote CLI first on the
 * PATH, `code` is the desktop's own launcher, which finds the window itself, a WSL one included.
 */
function withoutDeadSocket(env) {
  const socket = env.VSCODE_IPC_HOOK_CLI
  if (!socket || existsSync(socket)) return null
  const next = { ...env }
  delete next.VSCODE_IPC_HOOK_CLI
  next.PATH = (env.PATH ?? '').split(':').filter(dir => !dir.includes('/remote-cli')).join(':')
  return next
}

/** `LAUNCH_EDITOR`, VS Code by default: a VS Code-like editor directly (and once more past a dead socket), any other through launch-editor. */
async function openFile(full, line, column) {
  const editor = process.env.LAUNCH_EDITOR || 'code'
  if (!CODE_LIKE.test(editor.split(/[\\/]/).pop())) {
    return new Promise((done) => {
      launchEditor(`${full}:${line}:${column}`, editor, (_name, error) => done({ ok: false, error: error || `${editor} did not start` }))
      setTimeout(() => done({ ok: true }), 1500)
    })
  }
  const args = ['-r', '-g', `${full}:${line}:${column}`]
  const first = await run(editor, args, process.env)
  if (first.ok) return first
  const env = withoutDeadSocket(process.env)
  return env ? run(editor, args, env) : first
}

/** The same place as a `vscode://` address, for the browser to try when the server could not open it. */
function editorAddress(full, line, column) {
  const at = `${full}:${line}:${column}`
  return process.env.WSL_DISTRO_NAME ? `vscode://vscode-remote/wsl+${process.env.WSL_DISTRO_NAME}${at}` : `vscode://file${at.startsWith('/') ? '' : '/'}${at}`
}

function readBody(request, limit) {
  return new Promise((done, fail) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        fail(new Error('The body is too large.'))
        request.destroy()
      }
      else {
        chunks.push(chunk)
      }
    })
    request.on('end', () => done(Buffer.concat(chunks)))
    request.on('error', fail)
  })
}

function send(response, status, body) {
  response.statusCode = status
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify(body))
}

/**
 * ONLY THE APP'S OWN PAGES MAY WRITE: another site open in the same browser could otherwise post a pick (a plain-text
 * body needs no preflight) and so put its words in front of the agent that reads picks, or open files in the editor.
 * A browser says where a request comes from (`Sec-Fetch-Site`, else `Origin`); a request with neither is no
 * browser's, so it comes from this machine.
 */
function sameOrigin(request) {
  const site = request.headers['sec-fetch-site']
  if (site) return site === 'same-origin'
  const origin = request.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === request.headers.host
  }
  catch {
    return false
  }
}

const typed = (request, type) => (request.headers['content-type'] ?? '').split(';')[0].trim() === type
const PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47])

export function pinpointMiddleware({ root = workspaceRoot() } = {}) {
  const dir = storeDir(root)
  return async (request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    try {
      if (request.method !== 'POST') return next()
      if (!sameOrigin(request)) return send(response, 403, { error: 'Only the app\'s own pages may write here.' })

      if (url.pathname === '/pick') {
        if (!typed(request, 'application/json')) return send(response, 415, { error: 'A pick is JSON.' })
        const pick = JSON.parse(String(await readBody(request, 1e6)))
        if (!ID.test(pick.id ?? '') || typeof pick.text !== 'string') return send(response, 400, { error: 'A pick needs its id and its text.' })
        const picks = readPicks(dir)
        const before = picks.find(kept => kept.id === pick.id)
        const kept = [...picks.filter(row => row.id !== pick.id), {
          id: pick.id,
          page: String(pick.page ?? ''),
          text: pick.text,
          note: pick.note ? String(pick.note) : undefined,
          at: before?.at ?? new Date().toISOString(),
          shot: before?.shot,
        }]
        while (kept.length > KEEP) {
          const gone = kept.shift()
          if (gone.shot) rmSync(join(dir, gone.shot), { force: true })
        }
        writePicks(dir, kept)
        return send(response, 200, { ok: true })
      }

      if (url.pathname === '/shot') {
        const id = url.searchParams.get('id') ?? ''
        if (!ID.test(id)) return send(response, 400, { error: 'A screenshot needs its pick\'s id.' })
        if (!typed(request, 'image/png')) return send(response, 415, { error: 'A screenshot is a PNG.' })
        // ONLY FOR A PICK THAT IS KEPT, so a screenshot always goes when its pick does and the folder stays bounded.
        const picks = readPicks(dir)
        const pick = picks.find(row => row.id === id)
        if (!pick) return send(response, 404, { error: 'No pick with that id is kept.' })
        const png = await readBody(request, 25e6)
        if (!png.subarray(0, 4).equals(PNG)) return send(response, 415, { error: 'A screenshot is a PNG.' })
        mkdirSync(dir, { recursive: true })
        pick.shot = `shot-${id}.png`
        writeFileSync(join(dir, pick.shot), png)
        writePicks(dir, picks)
        return send(response, 200, { ok: true })
      }

      if (url.pathname === '/open') {
        if (!typed(request, 'application/json')) return send(response, 415, { error: 'Ask for a file as JSON.' })
        const { file } = JSON.parse(String(await readBody(request, 1e4)))
        const match = /^(.+?)(?::(\d+))?(?::(\d+))?$/.exec(String(file ?? ''))
        if (!match) return send(response, 400, { error: 'Name a file as path:line:column.' })
        let full
        try {
          // THROUGH ITS LINKS, so a link inside the workspace cannot point the editor outside it.
          full = realpathSync(resolve(root, match[1]))
        }
        catch {
          return send(response, 404, { error: 'No such file.' })
        }
        const inside = relative(realpathSync(root), full)
        if (!inside || inside.startsWith('..') || isAbsolute(inside)) return send(response, 403, { error: 'That file is outside the workspace.' })
        const opened = await openFile(full, match[2] ?? '1', match[3] ?? '1')
        if (!opened.ok) console.warn(`[pinpoint] Could not open ${full} in your editor: ${opened.error}`)
        return send(response, 200, opened.ok ? { ok: true } : { ok: false, error: `Could not open it: ${opened.error}`, url: editorAddress(full, match[2] ?? '1', match[3] ?? '1') })
      }

      return next()
    }
    catch (error) {
      return send(response, 500, { error: String(error?.message ?? error) })
    }
  }
}
