import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { REPOSITORY_SCAN_TIMEOUT_MS } from "../fixture/repository-scan-timeout.ts"
import {
  hardcodedDeclarations,
  isAllowedRadius,
  isAllowedShadow,
  isAllowedSpace,
  isAllowedTransition,
} from "./design-token-declaration.ts"
import { listSourceFiles, SRC_ROOT } from "./source-file.ts"

describe("design-token", () => {
  it(
    "src/browser/ の *.css で、theme.css 以外の余白・角丸・影・transition の時間の直書きが、除外の一覧の件数を超えない",
    () => {
      const actual = Object.fromEntries(
        listSourceFiles(SRC_ROOT, SRC_ROOT, [".css"])
          .filter(
            (relPath) => relPath.startsWith("browser/") && relPath !== "browser/styles/theme.css",
          )
          .flatMap((relPath) => {
            const count = hardcodedDeclarations(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"))
            return count.length > 0 ? [[relPath, count.length] as const] : []
          }),
      )

      const increased = Object.entries(actual)
        .filter(([relPath, count]) => count > (EXCLUDED_DECLARATION_COUNTS[relPath] ?? 0))
        .map(
          ([relPath, count]) =>
            `${relPath}: ${count}（一覧 ${EXCLUDED_DECLARATION_COUNTS[relPath] ?? 0}）`,
        )
      const decreased = Object.entries(EXCLUDED_DECLARATION_COUNTS)
        .filter(([relPath, count]) => (actual[relPath] ?? 0) < count)
        .map(([relPath, count]) => `${relPath}: ${actual[relPath] ?? 0}（一覧 ${count}）`)

      expect(increased.join("\n"), "直書きを増やしている。トークン（theme.css）を使う").toBe("")
      expect(
        decreased.join("\n"),
        "直書きが減った。EXCLUDED_DECLARATION_COUNTS の件数を減らす（0 になったら行を消す）",
      ).toBe("")
    },
    REPOSITORY_SCAN_TIMEOUT_MS,
  )

  it("余白の判定は、0・auto・トークン・局所のつまみ・em・%・28px 以上・それらだけの calc を通し、小さな px・rem を拒む", () => {
    const allowed = [
      "0",
      "auto",
      "var(--space-md)",
      "var(--report-block-gap)",
      "0.5em",
      "50%",
      "28px",
      "2rem",
      "0 var(--space-sm)",
      "calc(-1 * var(--space-xs))",
      "calc(var(--space-sm) + 0.5em)",
      "var(--report-block-gap, var(--space-md)) 0",
    ]
    const rejected = [
      "6px",
      "0.5rem",
      "4px 8px",
      "calc(1rem + 2px)",
      "var(--space-sm) 6px",
      "10px",
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
  "browser/components/domain/protocol-mismatch.module.css": 1,
  "browser/components/page/character/character.module.css": 1,
  "browser/components/page/conversation/components/character-view/stage/speech-log.css": 1,
  "browser/components/page/conversation/components/dispatch/dispatch.module.css": 1,
  "browser/components/page/conversation/components/main-view/turn-card/mini-portrait.css": 2,
  "browser/components/page/conversation/components/markdown/renderer/report-notation-body.css": 23,
  "browser/components/page/conversation/components/markdown/renderer/report-notation-card-chain.css": 5,
  "browser/components/page/conversation/components/markdown/renderer/report-notation-figure.css": 39,
  "browser/components/page/conversation/components/markdown/renderer/report-notation-inline.css": 10,
  "browser/components/page/conversation/components/markdown/renderer/report-notation-prose.css": 25,
  "browser/components/page/conversation/components/markdown/renderer/report-notation-result.css": 46,
  "browser/components/page/conversation/components/markdown/renderer/report-notation-summary.css": 31,
  "browser/components/page/conversation/components/markdown/renderer/report-notation-timeline.css": 4,
}
