import { describe, expect, it } from "vitest"

import { REPOSITORY_SCAN_TIMEOUT_MS } from "../fixture/repository-scan-timeout.ts"
import {
  compareWithLimits,
  countByBrowserCss,
  hardcodedDeclarations,
  isAllowedRadius,
  isAllowedShadow,
  isAllowedSpace,
  isAllowedTransition,
} from "./design-token-declaration.ts"

describe("design-token", () => {
  it(
    "src/browser/ の *.css で、theme.css 以外の余白・角丸・影・transition の時間の直書きが、除外の一覧の件数を超えない",
    () => {
      const { increased, decreased } = compareWithLimits(
        countByBrowserCss((css) => hardcodedDeclarations(css).length),
        EXCLUDED_DECLARATION_COUNTS,
      )

      expect(increased, "直書きを増やしている。トークン（theme.css）を使う").toBe("")
      expect(
        decreased,
        "直書きが減った。EXCLUDED_DECLARATION_COUNTS の件数を減らす（0 になったら行を消す）",
      ).toBe("")
    },
    REPOSITORY_SCAN_TIMEOUT_MS,
  )

  it("余白の判定は、0・auto・トークン・局所のつまみ・em・%・尺度に乗る calc・env() を含む値を通し、px・rem の直書きと尺度の外の calc を拒む", () => {
    const allowed = [
      "0",
      "auto",
      "var(--space-md)",
      "var(--report-block-gap)",
      "0.5em",
      "50%",
      "0 var(--space-sm)",
      "calc(-1 * var(--space-xs))",
      "calc(var(--space-sm) + 0.5em)",
      "calc(var(--space-sm) * 2)",
      "calc(var(--space-sm) + var(--space-md))",
      "calc(var(--space-sm) + env(safe-area-inset-top))",
      "calc(env(safe-area-inset-top) + var(--space-lg))",
      "calc(var(--turn-card-head-height, 0px) + var(--space-sm))",
      "var(--report-block-gap, var(--space-md)) 0",
    ]
    const rejected = [
      "6px",
      "0.5rem",
      "4px 8px",
      "28px",
      "2rem",
      "calc(1rem + 2px)",
      "calc(var(--space-2xs) / 2)",
      "calc(1.5 * var(--space-2xs))",
      "calc(var(--space-sm) + var(--space-2xs))",
      "var(--space-sm) 6px",
      "10px",
      "calc(env(safe-area-inset-top) + 30px)",
      "calc(env(safe-area-inset-top) + 13px)",
      "calc(var(--space-sm) + env(safe-area-inset-top) + 30px)",
      "calc(var(--space-5xl) * 3)",
      "var(--report-block-gap, 12px) 0",
    ]

    expect(allowed.filter((value) => !isAllowedSpace(value))).toEqual([])
    expect(rejected.filter((value) => isAllowedSpace(value))).toEqual([])
  })

  it("角丸の判定は、0・トークン・%・999px 以上を通し、小さな px・rem を拒む", () => {
    const allowed = [
      "0",
      "var(--radius-md)",
      "50%",
      "999px",
      "var(--radius-sm) var(--radius-sm) 0 0",
    ]
    const rejected = ["8px", "0.5rem", "4px 4px 0 0"]

    expect(allowed.filter((value) => !isAllowedRadius(value))).toEqual([])
    expect(rejected.filter((value) => isAllowedRadius(value))).toEqual([])
  })

  it("影の判定は、none・トークン・inset・ぼかし 0 の輪・向きのある影を通し、ぼかしのある向きの無い影を拒む", () => {
    const allowed = [
      "none",
      "var(--shadow-raised)",
      "inset 0 0 0 1px var(--accent)",
      "0 0 0 1px var(--state-warn) inset",
      "0 0 0 2px var(--accent)",
      "0 0 0 2px var(--ground), 0 0 0 3.5px var(--accent)",
      "-20px 0 50px rgb(0 0 0 / 0.5)",
      "0 -20px 50px rgb(0 0 0 / 0.5)",
    ]
    const rejected = [
      "0 8px 24px rgb(0 0 0 / 0.3)",
      "0 20px 50px color-mix(in srgb, var(--ground) 80%, transparent)",
      "0 0 0 2px var(--accent), 0 8px 24px rgb(0 0 0 / 0.3)",
    ]

    expect(allowed.filter((value) => !isAllowedShadow(value))).toEqual([])
    expect(rejected.filter((value) => isAllowedShadow(value))).toEqual([])
  })

  it("transition の判定は、時間がトークンのものを通し、秒の直書きを拒む", () => {
    const allowed = [
      "none",
      "opacity var(--motion-fast) ease-out",
      "opacity var(--motion-base) ease-out, transform var(--motion-base) ease-out",
    ]
    const rejected = ["opacity 0.12s ease-out", "opacity var(--motion-fast) ease-out, color 0.2s"]

    expect(allowed.filter((value) => !isAllowedTransition(value))).toEqual([])
    expect(rejected.filter((value) => isAllowedTransition(value))).toEqual([])
  })

  it("宣言は、コメントを除き、複数行に渡る値も 1 つの宣言として読む", () => {
    const css = [
      "/* padding: 6px; */",
      ".a { padding: 6px; margin: var(--space-sm); }",
      ".b {",
      "  box-shadow:",
      "    0 0 0 2px var(--ground),",
      "    0 8px 24px rgb(0 0 0 / 0.3);",
      "  transition: opacity 0.12s ease-out;",
      "  border-radius: 0.5rem;",
      "}",
    ].join("\n")

    expect(hardcodedDeclarations(css)).toEqual([
      "padding: 6px",
      "box-shadow: 0 0 0 2px var(--ground),\n    0 8px 24px rgb(0 0 0 / 0.3)",
      "transition: opacity 0.12s ease-out",
      "border-radius: 0.5rem",
    ])
  })

  it("同じ直書きは、どの書き方の宣言でも数える（長手形・論理プロパティ・角ごとの角丸）", () => {
    const space = [
      "padding",
      "padding-top",
      "padding-inline",
      "padding-inline-start",
      "padding-block-end",
      "margin",
      "margin-left",
      "margin-block",
      "margin-inline-end",
      "gap",
      "row-gap",
      "column-gap",
    ].map((property) => `.a { ${property}: 6px; }`)
    const radius = [
      "border-radius",
      "border-top-left-radius",
      "border-bottom-right-radius",
      "border-start-end-radius",
      "border-end-start-radius",
    ].map((property) => `.a { ${property}: 6px; }`)
    const others = [".a { box-shadow: 0 8px 24px red; }", ".a { transition-duration: 0.2s; }"]

    const uncounted = [...space, ...radius, ...others].filter(
      (css) => hardcodedDeclarations(css).length !== 1,
    )

    expect(uncounted).toEqual([])
  })
})

/** 置き換えの課題が済むまで通す、ファイルごとの直書きの宣言の件数。減る向きにだけ動かす。 */
const EXCLUDED_DECLARATION_COUNTS: Readonly<Record<string, number>> = {
  "browser/components/app/screen-boundary.module.css": 1,
  "browser/components/frame/protocol-mismatch.module.css": 1,
  "browser/components/frame/screen-nav/components/session-switcher.module.css": 1,
  "browser/components/frame/sidebar/components/plan-usage-row.module.css": 1,
  "browser/components/page/achievement/components/diary-book/diary-book.module.css": 3,
  "browser/components/page/conversation/components/character-view/stage/speech-log.css": 2,
  "browser/components/page/conversation/components/dispatch/dispatch.module.css": 1,
  "browser/components/page/conversation/components/main-view/turn-card/report-outline.css": 1,
  "browser/components/page/conversation/components/main-view/turn-card/work-strip.css": 1,
  "browser/components/page/token-usage/components/period-choice-list/period-choice-list.module.css": 1,
  "browser/components/page/token-usage/components/period-usage-card/period-usage-card.module.css": 1,
  "browser/features/report/renderer/report-notation-prose.css": 1,
  "browser/features/task-board/components/task-detail.module.css": 1,
  "browser/features/task-board/task-board.module.css": 2,
}
