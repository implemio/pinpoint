// THE DEV SERVER'S HALF: a connect middleware the Vite plugin mounts at `/__pinpoint`. It keeps each pick for the
// MCP server, keeps a pick's screenshot beside it, and opens a source line in the editor. Dev only: nothing here
// is reachable from a build.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import launchEditor from 'launch-editor'
import { readPicks, storeDir, workspaceRoot, writePicks } from './store.mjs'

/** How many picks are kept; an older one goes with its screenshot. */
const KEEP = 20
const ID = /^[a-z0-9]{4,40}$/

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

export function pinpointMiddleware({ root = workspaceRoot() } = {}) {
  const dir = storeDir(root)
  return async (request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    try {
      if (request.method === 'GET' && url.pathname === '/picks') return send(response, 200, readPicks(dir))
      if (request.method !== 'POST') return next()

      if (url.pathname === '/pick') {
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
        const png = await readBody(request, 25e6)
        mkdirSync(dir, { recursive: true })
        const name = `shot-${id}.png`
        writeFileSync(join(dir, name), png)
        const picks = readPicks(dir)
        const pick = picks.find(row => row.id === id)
        if (pick) {
          pick.shot = name
          writePicks(dir, picks)
        }
        return send(response, 200, { ok: true })
      }

      if (url.pathname === '/open') {
        const { file } = JSON.parse(String(await readBody(request, 1e4)))
        const match = /^(.+?)(?::(\d+))?(?::(\d+))?$/.exec(String(file ?? ''))
        if (!match) return send(response, 400, { error: 'Name a file as path:line:column.' })
        const full = resolve(root, match[1])
        const inside = relative(root, full)
        if (!inside || inside.startsWith('..') || isAbsolute(inside)) return send(response, 403, { error: 'That file is outside the workspace.' })
        const at = `${full}${match[2] ? `:${match[2]}` : ''}${match[3] ? `:${match[3]}` : ''}`
        launchEditor(at, undefined, (name, error) => {
          console.warn(`[pinpoint] Could not open ${name} in your editor${error ? `: ${error}` : ''}. Set LAUNCH_EDITOR, for example to "code".`)
        })
        return send(response, 200, { ok: true })
      }

      return next()
    }
    catch (error) {
      return send(response, 500, { error: String(error?.message ?? error) })
    }
  }
}
