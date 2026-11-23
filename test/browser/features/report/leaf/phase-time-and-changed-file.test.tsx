import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ChangedFilesFold } from "../../../../../src/browser/features/report/leaf/changed-files-fold.tsx"
import { PhaseTimes } from "../../../../../src/browser/features/report/leaf/phase-time-section.tsx"
import {
  MinimapProvider,
  type RenderMinimap,
} from "../../../../../src/browser/features/report/minimap-slot.tsx"
import { changedFilesView } from "../../../../../src/shared/report/changed-file-section.ts"
import type { ChangedFile } from "../../../../../src/shared/report/changed-file.ts"
import type { ReportMap } from "../../../../../src/shared/report/report-map.ts"
import {
  type PhaseTimeRow,
  phaseTimesView,
} from "../../../../../src/shared/report/report-phase-time.ts"

afterEach(() => {
  cleanup()
})

const at = (milliseconds: number) => ({ kind: "known", milliseconds }) as const
const UNKNOWN = { kind: "unknown" } as const

const phase = (
  label: string,
  start: ReturnType<typeof at> | typeof UNKNOWN,
  duration: ReturnType<typeof at> | typeof UNKNOWN,
  absence: "none" | "not-started" | "skipped" = "none",
) => ({ kind: "phase", label, start, duration, absence }) as const

const PHASE_CASES: readonly (readonly [string, readonly PhaseTimeRow[], readonly string[]])[] = [
  [
    "帯だけの回",
    [phase("1/2 架空の段A", at(0), at(20_000)), phase("2/2 架空の段B", at(20_000), at(10_000))],
    ["架空の段A", "架空の段B", "計 30秒"],
  ],
  [
    "並列のフェーズのある滝の回",
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
    ["架空の段A", "並列 2–3", "架空の段C"],
  ],
  [
    "測れない段と未着手・飛ばした段を含む回",
    [
      phase("1/4 架空の段A", at(0), at(20_000)),
      phase("2/4 架空の段B", UNKNOWN, UNKNOWN),
      phase("3/4 架空の段C", UNKNOWN, UNKNOWN, "skipped"),
      phase("架空の名前だけの段", UNKNOWN, UNKNOWN, "not-started"),
    ],
    ["架空の段A", "不明", "飛ばした", "未着手", "架空の名前だけの段"],
  ],
]

const counted = (changed: readonly ChangedFile[]) =>
  ({ kind: "counted", changed, files: changed.length, added: 0, removed: 0, mixed: false }) as const

const FILE_CASES: readonly (readonly [string, readonly ChangedFile[], readonly string[]])[] = [
  [
    "フォルダのある変更ファイル",
    [
      { path: "src/架空-例/a-b.ts", change: "modified" },
      { path: "src/架空-例/深い/c.ts", change: "added" },
      { path: "docs/架空.md", change: "deleted" },
    ],
    ["3 ファイル", "a-b.ts", "c.ts", "架空.md"],
  ],
  [
    "フォルダの無い変更ファイル",
    [
      { path: "架空-a.ts", change: "added" },
      { path: "架空b.md", change: "modified" },
    ],
    ["2 ファイル", "架空-a.ts", "架空b.md"],
  ],
  [
    "added/modified/deleted を含む札",
    [
      { path: "src/架空/a.ts", change: "added" },
      { path: "src/架空/b.ts", change: "modified" },
      { path: "src/架空/c.ts", change: "deleted" },
      { path: "src/架空/d.ts", change: "modified" },
    ],
    ["4 ファイル", "a.ts", "b.ts", "c.ts", "d.ts"],
  ],
]

describe("PhaseTimes（面の段ごとの所要時間）", () => {
  it.each(PHASE_CASES)("%s の字が部品の text に出る", (_, rows, texts) => {
    const view = phaseTimesView(rows)
    if (view.kind !== "times") throw new Error("所要時間が無い")

    const { container } = render(<PhaseTimes view={view} />)

    for (const text of texts) {
      expect(container.textContent).toContain(text)
    }
  })
})

describe("ChangedFilesFold（面の変更したファイル）", () => {
  it.each(FILE_CASES)("%s の字が部品の text に出る", (_, changed, texts) => {
    const view = changedFilesView(counted(changed))
    if (view.kind !== "files") throw new Error("変更したファイルが無い")

    const { container } = render(<ChangedFilesFold view={view} />)

    for (const text of texts) {
      expect(container.textContent).toContain(text)
    }
  })
})

describe("ChangedFilesFold のミニマップ", () => {
  const CHANGED: readonly ChangedFile[] = [
    { path: "src/ui/a.ts", change: "modified" },
    { path: "src/server/b.ts", change: "added" },
  ]
  const MAP: ReportMap = {
    view: { level: 1, boxes: [], edges: [], intendedEdges: [], closedCount: 0, findings: [] },
    files: [
      { path: "src/ui/a.ts", boxes: ["app"] },
      { path: "src/server/b.ts", boxes: ["server"] },
    ],
    drift: [],
  }
  // 代わりの描き手。箱の ID のボタンを並べる
  const renderMinimap: RenderMinimap = (props) => (
    <div>
      {["app", "server"].map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => {
            props.onSelect(id)
          }}
        >
          {`箱 ${id}`}
        </button>
      ))}
    </div>
  )

  function view() {
    const files = changedFilesView(counted(CHANGED))
    if (files.kind !== "files") throw new Error("変更したファイルが無い")
    return files
  }

  it("箱を押すとその箱の行だけになり、もう一度押すと全部に戻る", () => {
    const { container } = render(
      <MinimapProvider value={renderMinimap}>
        <ChangedFilesFold view={view()} map={MAP} />
      </MinimapProvider>,
    )

    fireEvent.click(screen.getByText("箱 app"))
    expect(container.textContent).toContain("a.ts")
    expect(container.textContent).not.toContain("b.ts")

    fireEvent.click(screen.getByText("箱 app"))
    expect(container.textContent).toContain("a.ts")
    expect(container.textContent).toContain("b.ts")
  })

  it("map が無いときはミニマップが出ない", () => {
    render(
      <MinimapProvider value={renderMinimap}>
        <ChangedFilesFold view={view()} />
      </MinimapProvider>,
    )

    expect(screen.queryByText("箱 app")).toBeNull()
  })
})
