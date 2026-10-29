import { cleanup, render } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { ChangedFilesFold } from "../../../../../../../src/browser/components/page/conversation/components/main-view/changed-files-fold.tsx"
import { PhaseTimes } from "../../../../../../../src/browser/components/page/conversation/components/main-view/phase-time-section.tsx"
import {
  loadMarkdown,
  Markdown,
} from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import {
  changedFilesMarkdown,
  changedFilesView,
} from "../../../../../../../src/shared/report/changed-file-section.ts"
import type { ChangedFile } from "../../../../../../../src/shared/report/changed-file.ts"
import {
  type PhaseTimeRow,
  phaseTimesMarkdown,
  phaseTimesView,
} from "../../../../../../../src/shared/report/report-phase-time.ts"
import { normalized, textNodesOf } from "../../../../../../fixture/direct-leaf-compare.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

function rendered(element: ReactElement) {
  const { container } = render(<div data-report-region="head">{element}</div>)
  const result = { html: normalized(container.innerHTML), textNodes: textNodesOf(container) }
  cleanup()
  return result
}

const at = (milliseconds: number) => ({ kind: "known", milliseconds }) as const
const UNKNOWN = { kind: "unknown" } as const

const phase = (
  label: string,
  start: ReturnType<typeof at> | typeof UNKNOWN,
  duration: ReturnType<typeof at> | typeof UNKNOWN,
  absence: "none" | "not-started" | "skipped" = "none",
) => ({ kind: "phase", label, start, duration, absence }) as const

const PHASE_CASES: readonly (readonly [string, readonly PhaseTimeRow[]])[] = [
  [
    "帯だけの回",
    [phase("1/2 架空の段A", at(0), at(20_000)), phase("2/2 架空の段B", at(20_000), at(10_000))],
  ],
  [
    "並列の段のある滝の回",
    [
      phase("1/3 架空の段A", at(0), at(5_000)),
      {
        kind: "parallel",
        label: "並列 2–3",
        start: at(5_000),
        wall: at(20_000),
        absence: "none",
        phases: [
          { label: "2/3 架空の段B", start: at(5_000), duration: at(10_000), absence: "none" },
          { label: "3/3 架空の段C", start: UNKNOWN, duration: UNKNOWN, absence: "none" },
        ],
      },
    ],
  ],
  [
    "測れない段と未着手・飛ばした段を含む回",
    [
      phase("1/4 架空の段A", at(0), at(20_000)),
      phase("2/4 架空の段B", UNKNOWN, UNKNOWN),
      phase("3/4 架空の段C", UNKNOWN, UNKNOWN, "skipped"),
      phase("架空の名前だけの段", UNKNOWN, UNKNOWN, "not-started"),
    ],
  ],
]

const counted = (changed: readonly ChangedFile[]) =>
  ({ kind: "counted", changed, files: changed.length, added: 0, removed: 0, mixed: false }) as const

const FILE_CASES: readonly (readonly [string, readonly ChangedFile[]])[] = [
  [
    "フォルダのある変更ファイル",
    [
      { path: "src/架空-例/a-b.ts", change: "modified" },
      { path: "src/架空-例/深い/c.ts", change: "added" },
      { path: "docs/架空.md", change: "deleted" },
    ],
  ],
  [
    "フォルダの無い変更ファイル",
    [
      { path: "架空-a.ts", change: "added" },
      { path: "架空b.md", change: "modified" },
    ],
  ],
  [
    "added/modified/deleted を含む札",
    [
      { path: "src/架空/a.ts", change: "added" },
      { path: "src/架空/b.ts", change: "modified" },
      { path: "src/架空/c.ts", change: "deleted" },
      { path: "src/架空/d.ts", change: "modified" },
    ],
  ],
]

describe("PhaseTimes（面の段ごとの所要時間）", () => {
  it.each(PHASE_CASES)(
    "%s は、旧い文字列を Markdown で描いたときと DOM と text ノードの割れ方が同じ",
    (_, rows) => {
      const view = phaseTimesView(rows)
      if (view.kind !== "times") throw new Error("所要時間が無い")

      const fresh = rendered(<PhaseTimes view={view} />)
      const old = rendered(<Markdown text={phaseTimesMarkdown(rows)} />)

      expect(fresh.html).toBe(old.html)
      expect(fresh.textNodes).toEqual(old.textNodes)
      expect(fresh.html).toContain("架空の段A")
    },
  )
})

describe("ChangedFilesFold（面の変更したファイル）", () => {
  it.each(FILE_CASES)(
    "%s は、旧い文字列を Markdown で描いたときと DOM と text ノードの割れ方が同じ",
    (_, changed) => {
      const view = changedFilesView(counted(changed))
      if (view.kind !== "files") throw new Error("変更したファイルが無い")

      const fresh = rendered(<ChangedFilesFold view={view} />)
      const old = rendered(<Markdown text={changedFilesMarkdown(counted(changed))} />)

      expect(fresh.html).toBe(old.html)
      expect(fresh.textNodes).toEqual(old.textNodes)
      expect(fresh.html).toContain("架空")
    },
  )
})
