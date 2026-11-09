export interface PickerOptions {
  /** The keys held to pick. `mod` is Ctrl, or Cmd on a Mac. Default `['mod', 'shift']`. */
  modifiers?: Array<'mod' | 'shift' | 'alt'>
  /** The tag the copied block is wrapped in. Default `picked`. */
  tag?: string
  /** A source path holding any of these is not yours and never a line of the block. Default `['node_modules/']`. */
  skip?: string[]
  /** A regular expression's source: the trail of components stops at the first whose file matches. Default Nuxt's pages and layouts. */
  stopAt?: string
  /** The bar after a pick (Note, Screenshot, Open in editor). Default true. */
  bar?: boolean
  /** How long the bar stays while nothing happens on it, in milliseconds. Default 8000. */
  barTimeout?: number
  /** Where the dev server's half listens. Default `/__pinpoint`. */
  endpoint?: string
}

export interface Pick {
  id: string
  text: string
  note: string | null
  page: string
  at: number
}

export type PickContext = (pick: { elements: Element[], page: string }) => string | Array<string | null | undefined> | null | undefined

export declare const defaults: Readonly<Required<PickerOptions>>
export declare function start(options?: PickerOptions): void
export declare function addPickContext(fn: PickContext): () => void
export declare function lastPick(): Pick | null
