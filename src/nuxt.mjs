// THE NUXT MODULE: the Vite plugin on the client build, and the picker started by a client plugin (Nuxt renders its
// HTML on the server, so index.html is not where it goes). Does nothing outside `nuxt dev`.
import { addPluginTemplate, addVitePlugin, defineNuxtModule } from '@nuxt/kit'
import { pinpoint } from './vite.mjs'

export default defineNuxtModule({
  meta: { name: '@implemio/pinpoint', configKey: 'pinpoint' },
  defaults: { enabled: true },
  setup(options, nuxt) {
    if (!nuxt.options.dev || options.enabled === false) return
    const { enabled: _enabled, tracer, ...client } = options
    addVitePlugin(() => pinpoint({ ...client, tracer, inject: false }), { server: false })
    addPluginTemplate({
      filename: 'pinpoint.client.mjs',
      mode: 'client',
      getContents: () => [
        `import { defineNuxtPlugin } from '#app'`,
        `import { start } from '@implemio/pinpoint/client'`,
        `export default defineNuxtPlugin(() => { start(${JSON.stringify(client)}) })`,
      ].join('\n'),
    })
  },
})
