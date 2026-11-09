#!/usr/bin/env node
// THE PICKS OVER MCP: an agent asks what the developer last pointed at, with no paste. A stdio server any MCP client
// starts in the project (newline-delimited JSON-RPC, the protocol's stdio transport), reading what the dev server
// kept (`store.mjs`). It only reads.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline'
import { readPicks, storeDir, workspaceRoot } from './store.mjs'

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const dir = storeDir(workspaceRoot(process.cwd()))

const TOOLS = [
  {
    name: 'latest_pick',
    description: 'What the developer last picked in their running app with pinpoint (holding Ctrl+Shift, or Cmd+Shift, and clicking elements in the page): each element with the source lines that draw it, innermost first, their note if they wrote one, and a screenshot if they took one. Call it when they say "this", "here", "the thing I picked" or "what I am looking at" without naming where it is in the code.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'recent_picks',
    description: 'The developer\'s recent pinpoint picks, newest first, as text: to look back past the latest one.',
    inputSchema: {
      type: 'object',
      properties: { count: { type: 'integer', minimum: 1, maximum: 20, description: 'How many picks, 5 when left out.' } },
      additionalProperties: false,
    },
  },
]

function ago(at) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 1000))
  if (seconds < 90) return `${seconds} seconds ago`
  if (seconds < 5400) return `${Math.round(seconds / 60)} minutes ago`
  return `${Math.round(seconds / 3600)} hours ago`
}

const NOTHING = 'Nothing picked yet. Ask them to hold Ctrl+Shift (Cmd+Shift on a Mac) in the running app and click the element.'

function call(name, args) {
  const picks = readPicks(dir)
  if (name === 'latest_pick') {
    const pick = picks.at(-1)
    if (!pick) return { content: [{ type: 'text', text: NOTHING }] }
    const content = [{ type: 'text', text: `${pick.text.trim()}\nPicked ${ago(pick.at)}.` }]
    if (pick.shot) {
      try {
        content.push({ type: 'image', data: readFileSync(join(dir, pick.shot)).toString('base64'), mimeType: 'image/png' })
      }
      catch {}
    }
    return { content }
  }
  if (name === 'recent_picks') {
    const count = Math.min(20, Math.max(1, Number(args.count) || 5))
    const recent = picks.slice(-count).reverse()
    if (!recent.length) return { content: [{ type: 'text', text: NOTHING }] }
    return { content: [{ type: 'text', text: recent.map(pick => `Picked ${ago(pick.at)}${pick.shot ? ' (with a screenshot)' : ''}:\n${pick.text.trim()}`).join('\n\n') }] }
  }
  throw new Error(`No tool named ${name}.`)
}

const write = message => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)

function handle(message) {
  // A NOTIFICATION (no id) WANTS NO ANSWER: `notifications/initialized`, a cancel.
  if (message.id === undefined || message.id === null) return
  const { id, method, params } = message
  switch (method) {
    case 'initialize':
      return write({ id, result: { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'pinpoint', version: VERSION } } })
    case 'ping':
      return write({ id, result: {} })
    case 'tools/list':
      return write({ id, result: { tools: TOOLS } })
    case 'tools/call':
      try {
        return write({ id, result: call(params?.name, params?.arguments ?? {}) })
      }
      catch (error) {
        return write({ id, result: { content: [{ type: 'text', text: String(error?.message ?? error) }], isError: true } })
      }
    default:
      return write({ id, error: { code: -32601, message: `No method ${method}.` } })
  }
}

createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return
  try {
    handle(JSON.parse(line))
  }
  catch {
    write({ id: null, error: { code: -32700, message: 'The message is not JSON.' } })
  }
})
