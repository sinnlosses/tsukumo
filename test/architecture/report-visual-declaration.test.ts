import { describe, expect, it } from "vitest"

import {
  compareWithLimits,
  countByBrowserCss,
  visualDeclarationCount,
} from "./design-token-declaration.ts"

const REPORT_DIRECTORIES = [
  "browser/features/report/leaf/",
  "browser/features/report/renderer/",
] as const

describe("report-visual-declaration", () => {
  it("レポートの CSS が見た目を宣言する数が、ファイルごとの上限を超えない", () => {
    const actual = Object.fromEntries(
      Object.entries(countByBrowserCss(visualDeclarationCount)).filter(([relPath]) =>
        REPORT_DIRECTORIES.some((directory) => relPath.startsWith(directory)),
      ),
    )
    const { increased, decreased } = compareWithLimits(actual, VISUAL_DECLARATION_LIMITS)

    expect(increased, "見た目は ui/ の部品へ寄せる。自前の CSS で宣言を増やさない").toBe("")
    expect(
      decreased,
      "見た目の宣言が減った。VISUAL_DECLARATION_LIMITS の件数を減らす（0 になったら行を消す）",
    ).toBe("")
  })
})

describe("visualDeclarationCount", () => {
  it.each([
    "color: red",
    "background: var(--surface)",
    "background-color: red",
    "border: 1px solid red",
    "border-left: 0",
    "border-color: red",
    "border-radius: 4px",
    "font-size: 12px",
  ])("数える: %s", (declaration) => {
    expect(visualDeclarationCount(`.a { ${declaration}; }`)).toBe(1)
  })

  it.each([
    "text-decoration-color: red",
    "scrollbar-color: red",
    "background-image: none",
    "padding: 4px",
  ])("数えない: %s", (declaration) => {
    expect(visualDeclarationCount(`.a { ${declaration}; }`)).toBe(0)
  })

  it("コメントの中の宣言は数えない", () => {
    expect(visualDeclarationCount("/* color: red; */ .a { margin: 0; }")).toBe(0)
  })
})

/** レポートの CSS が見た目を宣言する数の、ファイルごとの上限。ui/ へ寄せて減らす向きにだけ動かす。 */
const VISUAL_DECLARATION_LIMITS: Readonly<Record<string, number>> = {
  "browser/features/report/leaf/chart-grid-leaf.css": 2,
  "browser/features/report/leaf/favor-option.module.css": 17,
  "browser/features/report/leaf/interactive-view.css": 3,
  "browser/features/report/leaf/leaf.module.css": 5,
  "browser/features/report/leaf/pending-part.css": 4,
  "browser/features/report/leaf/proof-band.module.css": 7,
  "browser/features/report/leaf/selection-port.css": 3,
  "browser/features/report/leaf/table-badge.css": 1,
  "browser/features/report/leaf/table-detail.css": 2,
  "browser/features/report/leaf/work-record-stages.css": 8,
  "browser/features/report/renderer/compare-zoom.module.css": 13,
  "browser/features/report/renderer/gauge-block.module.css": 2,
  "browser/features/report/renderer/mermaid-block.module.css": 3,
  "browser/features/report/renderer/plot-figure.module.css": 2,
  "browser/features/report/renderer/region-frame.module.css": 2,
  "browser/features/report/renderer/report-notation-body.css": 62,
  "browser/features/report/renderer/report-notation-card-chain.css": 14,
  "browser/features/report/renderer/report-notation-compare-code.css": 11,
  "browser/features/report/renderer/report-notation-figure.css": 30,
  "browser/features/report/renderer/report-notation-figure-captioned.css": 26,
  "browser/features/report/renderer/report-notation-inline.css": 20,
  "browser/features/report/renderer/report-notation-list.css": 2,
  "browser/features/report/renderer/report-notation-mark.css": 25,
  "browser/features/report/renderer/report-notation-overlay.css": 1,
  "browser/features/report/renderer/report-notation-pair-view.css": 10,
  "browser/features/report/renderer/report-notation-prose.css": 53,
  "browser/features/report/renderer/report-notation-result.css": 80,
  "browser/features/report/renderer/report-notation-result-phase.css": 30,
  "browser/features/report/renderer/report-notation-stat.css": 28,
  "browser/features/report/renderer/report-notation-summary.css": 64,
  "browser/features/report/renderer/report-notation-table.css": 10,
  "browser/features/report/renderer/report-notation-term.css": 13,
  "browser/features/report/renderer/report-notation-timeline.css": 36,
}
