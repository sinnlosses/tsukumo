// レポートの見出しの一覧（やり取りの列）の、見出しの並びと読んでいる位置を持つ store。
// 見出しの DOM の要素は持たない。移った先へ転がすのは `jump` の変化を受けた側の仕事。

import { isDeepEqual } from "remeda"
import { create } from "zustand"

export type ReadingSection =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly text: string }

/** 見出し1つ。`section` は `##`、`sub` は `###`。 */
export type ReportOutlineEntry = {
  readonly level: "section" | "sub"
  readonly text: string
}

export type HeadingStep = "older" | "newer"

/**
 * 見出しへ移れと頼まれた印。転がしたあとの位置の変化（読んだ位置の書き込み）では変わらないので、
 * 受けた側が転がしても頼み直しにはならない。
 */
export type HeadingJump =
  | { readonly kind: "none" }
  | { readonly kind: "requested"; readonly index: number; readonly serial: number }

type ReadingPosition = {
  readonly headings: readonly ReportOutlineEntry[]
  readonly activeIndex: number
  /** 見出しを1つでも通り過ぎたか。 */
  readonly reached: boolean
}

type ReadingSectionState = ReadingPosition & {
  /** 列を畳んでいるか。 */
  readonly outlineCollapsed: boolean
  readonly jump: HeadingJump
  /** 見出しの並びを置き換える。同じ並びなら何もしない。 */
  readonly showHeadings: (headings: readonly ReportOutlineEntry[]) => void
  /** 本文の転がりで決まった位置を書く。 */
  readonly readAt: (activeIndex: number, reached: boolean) => void
  /** 見出しへ移る。並びの外なら何もしない。 */
  readonly jumpTo: (index: number) => void
  /** いまの位置から見出しを1つ前後へ移る。まだ1つも通り過ぎていないときの「後ろ」は最初の見出し。 */
  readonly move: (step: HeadingStep) => void
  readonly setOutlineCollapsed: (outlineCollapsed: boolean) => void
  /** 列が外れたときに、見出しも位置も無い状態へ戻す。 */
  readonly clear: () => void
}

const INITIAL_POSITION = {
  headings: [],
  activeIndex: 0,
  reached: false,
  outlineCollapsed: false,
  jump: { kind: "none" },
} as const satisfies Omit<
  ReadingSectionState,
  "showHeadings" | "readAt" | "jumpTo" | "move" | "setOutlineCollapsed" | "clear"
>

export const useReadingSection = create<ReadingSectionState>()((set, get) => ({
  ...INITIAL_POSITION,
  showHeadings: (headings) => {
    set((state) => (isDeepEqual(state.headings, headings) ? state : { headings }))
  },
  readAt: (activeIndex, reached) => {
    set((state) =>
      state.activeIndex === activeIndex && state.reached === reached
        ? state
        : { activeIndex, reached },
    )
  },
  jumpTo: (index) => {
    set((state) =>
      index < 0 || index >= state.headings.length
        ? state
        : {
            activeIndex: index,
            reached: true,
            jump: { kind: "requested", index, serial: serialOf(state.jump) + 1 },
          },
    )
  },
  move: (step) => {
    const { reached, activeIndex, jumpTo } = get()
    const from = reached ? activeIndex : -1
    jumpTo(from + (step === "older" ? -1 : 1))
  },
  setOutlineCollapsed: (outlineCollapsed) => {
    set((state) => (state.outlineCollapsed === outlineCollapsed ? state : { outlineCollapsed }))
  },
  clear: () => {
    set(INITIAL_POSITION)
  },
}))

/**
 * 読んでいる節。節は `##` で、`###` の途中にいても親の `##` を返す。
 * 通った見出しの手前に `##` が無いとき（先頭が `###` など）も `none`。
 */
export function readingSectionOf(position: ReadingPosition): ReadingSection {
  if (!position.reached) {
    return { kind: "none" }
  }
  const found = position.headings.findLast(
    (heading, at) => at <= position.activeIndex && heading.level === "section",
  )
  return found === undefined ? { kind: "none" } : { kind: "shown", text: found.text }
}

/** 帯・頭に出す「いま: <節>」。出さないときは空。 */
export function readingLabelOf(section: ReadingSection): string {
  return section.kind === "shown" ? `いま: ${section.text}` : ""
}

function serialOf(jump: HeadingJump): number {
  return jump.kind === "requested" ? jump.serial : 0
}
