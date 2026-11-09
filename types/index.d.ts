import type { NuxtModule } from '@nuxt/schema'
import type { PickerOptions } from './client'

export interface PinpointOptions extends PickerOptions {
  /** Off turns the whole module off. It is only ever on under `nuxt dev`. */
  enabled?: boolean
  /** Add vite-plugin-vue-tracer, which records each element's source line. On by default; harmless beside Nuxt DevTools'. */
  tracer?: boolean
}

declare const pinpointModule: NuxtModule<PinpointOptions>
export default pinpointModule

declare module '@nuxt/schema' {
  interface NuxtConfig { pinpoint?: PinpointOptions }
  interface NuxtOptions { pinpoint?: PinpointOptions }
}
