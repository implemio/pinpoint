// THE VITE PLUGIN, for any Vue app on Vite (the Nuxt module uses it too): the endpoint the picker posts to, the
// source positions it reads (vite-plugin-vue-tracer, which Nuxt DevTools also adds; a second copy skips every file
// the first has traced, and both fill one store on `globalThis`), and, outside Nuxt, the picker itself in
// index.html. Serve only: a build holds none of it.
import VueTracer from 'vite-plugin-vue-tracer'
import { pinpointMiddleware } from './server.mjs'

export function pinpoint(options = {}) {
  const { inject = true, tracer = true, ...client } = options
  const endpoint = client.endpoint ?? '/__pinpoint'
  const plugin = {
    name: 'pinpoint',
    apply: 'serve',
    // THE SCREENSHOT LIBRARY IS IMPORTED ON ITS FIRST USE, so it is named here, or Vite would find it then and
    // reload the page.
    config: () => ({ optimizeDeps: { include: ['@implemio/pinpoint/client', '@implemio/pinpoint > modern-screenshot'] } }),
    configureServer(server) {
      server.middlewares.use(endpoint, pinpointMiddleware())
    },
  }
  if (inject) {
    plugin.transformIndexHtml = () => [{
      tag: 'script',
      attrs: { type: 'module' },
      children: `import { start } from '@implemio/pinpoint/client';start(${JSON.stringify(client)})`,
      injectTo: 'body',
    }]
  }
  return [tracer !== false && VueTracer(), plugin].filter(Boolean)
}

export default pinpoint
