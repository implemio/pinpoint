import type { Plugin } from 'vite'
import type { PickerOptions } from './client'

export interface PinpointViteOptions extends PickerOptions {
  /** Put the picker in index.html. Default true; the Nuxt module turns it off and starts it from a plugin. */
  inject?: boolean
  /** Add vite-plugin-vue-tracer, which records each element's source line. Default true. */
  tracer?: boolean
}

export declare function pinpoint(options?: PinpointViteOptions): Plugin[]
export default pinpoint
