export interface PickerOptions {
  /** The keys held to pick. `mod` is Ctrl, or Cmd on a Mac. Default `['mod', 'shift']`. */
  modifiers?: Array<'mod' | 'shift' | 'alt'>
  /** The tag the copied block is wrapped in. Default `picked`. */
  tag?: string
  /** A source path holding any of these is not yours and never a line of the block. Default `['node_modules/']`. */
  skip?: string[]
  /** A regular expression's source: the trail of components stops at the first whose file matches. Default Nuxt's pages and layouts. */
  stopAt?: string
  /** The bar after a pick: its note box, Screenshot, Go to and Details. Default true. */
  bar?: boolean
  /** Milliseconds of nothing happening on the bar before it closes by itself. Default 0: never, it stays until you close it. */
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
