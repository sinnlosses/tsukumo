// レポートの見出しの一覧（やり取りの列）が持つ「いま読んでいる節」と、見出しの前後へ移る口を持つ store。

import { isDeepEqual } from "remeda"
import { create } from "zustand"

export type ReadingSection =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly text: string }

/** 帯・頭に出す「いま: <節>」。出さないときは空。 */
export function readingLabelOf(section: ReadingSection): string {
  return section.kind === "shown" ? `いま: ${section.text}` : ""
}

export type HeadingStep = "older" | "newer"

type HeadingMover =
  | { readonly kind: "none" }
  | { readonly kind: "ready"; readonly move: (step: HeadingStep) => void }

type ReadingSectionState = {
  readonly section: ReadingSection
  /** 列を畳んでいるか。 */
  readonly outlineCollapsed: boolean
  readonly mover: HeadingMover
  readonly publish: (section: ReadingSection, outlineCollapsed: boolean) => void
  readonly setMover: (mover: HeadingMover) => void
}

export const useReadingSection = create<ReadingSectionState>()((set) => ({
  section: { kind: "none" },
  outlineCollapsed: false,
  mover: { kind: "none" },
  publish: (section, outlineCollapsed) => {
    set((state) =>
      isDeepEqual(state.section, section) && state.outlineCollapsed === outlineCollapsed
        ? state
        : { section, outlineCollapsed },
    )
  },
  setMover: (mover) => {
    set({ mover })
  },
}))
