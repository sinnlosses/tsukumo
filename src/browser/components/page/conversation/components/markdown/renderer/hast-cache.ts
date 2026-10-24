import type { Root } from "hast"

const REPORT_HAST_LIMIT = 200

export type HastCache = {
  /** 引いたものは最近使った側へ寄せる。 */
  readonly get: (text: string) => Root | undefined
  readonly set: (text: string, tree: Root) => void
}

/**
 * Markdown の文字列から、描画の木（hast。サニタイズと色付けまで済んだもの）を引く LRU。
 * 会話の内容を持つのでメモリの中だけに置き、ディスクにもログにも出さない。
 */
export function createHastCache(limit: number): HastCache {
  const entries = new Map<string, Root>()
  return {
    get(text) {
      const tree = entries.get(text)
      if (tree !== undefined) {
        entries.delete(text)
        entries.set(text, tree)
      }
      return tree
    },
    set(text, tree) {
      entries.delete(text)
      entries.set(text, tree)
      const oldest = entries.keys().next()
      if (entries.size > limit && oldest.done !== true) {
        entries.delete(oldest.value)
      }
    },
  }
}

export const REPORT_HAST_CACHE = createHastCache(REPORT_HAST_LIMIT)
