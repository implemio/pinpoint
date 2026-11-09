// WHERE PICKS ARE KEPT, shared by the dev server's endpoint and the MCP server: a JSON file under the
// workspace's `node_modules/.cache/pinpoint`, so nothing is committed and every checkout (a git worktree
// included) keeps its own.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'

/**
 * The workspace root, found the way vite-plugin-vue-tracer finds it (Vite's `searchForWorkspaceRoot`), so a
 * source path it records ("apps/web/pages/index.vue") resolves against the same folder: the nearest folder up
 * with a workspace file, else the nearest package.
 */
export function workspaceRoot(from = process.cwd()) {
  let packageRoot
  for (let dir = from; ; dir = dirname(dir)) {
    if (['pnpm-workspace.yaml', 'lerna.json', 'bun.lock', 'bun.lockb'].some(file => existsSync(join(dir, file)))) return dir
    const manifest = join(dir, 'package.json')
    if (existsSync(manifest)) {
      packageRoot ??= dir
      try {
        if (JSON.parse(readFileSync(manifest, 'utf8')).workspaces) return dir
      }
      catch {}
    }
    if (dirname(dir) === dir) return packageRoot ?? from
  }
}

export const storeDir = root => join(root, 'node_modules', '.cache', 'pinpoint')

/** The kept picks, oldest first; none when nothing was picked yet or the file is unreadable. */
export function readPicks(dir) {
  try {
    const picks = JSON.parse(readFileSync(join(dir, 'picks.json'), 'utf8'))
    return Array.isArray(picks) ? picks : []
  }
  catch {
    return []
  }
}

/** Written whole through a temporary file, so a reader never meets half a file. */
export function writePicks(dir, picks) {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'picks.json')
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify(picks, null, 2))
  renameSync(temporary, file)
}
