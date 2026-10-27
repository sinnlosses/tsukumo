import { readdirSync, readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { commentLineIndexes } from "./comment-line.ts"
import { SRC_ROOT } from "./source-file.ts"

// レポートの字の色が、字の4段と印の色の名前だけであること
// （docs/architecture/screen-design/color.md「レポートの字の色」）。生の色と `color-mix` で字を作る書き方を落とす。

const RENDERER_DIRECTORY = `${SRC_ROOT}/browser/components/page/conversation/components/markdown/renderer`
const REPORT_CSS_FILES = [
  "report-notation.module.css",
  ...readdirSync(RENDERER_DIRECTORY).filter(
    (file) => file.startsWith("report-notation-") && file.endsWith(".css"),
  ),
]

const TEXT_COLOR_DECLARATION = /^\s*(?:color|text-decoration-color)\s*:\s*(?<value>[^;]+);/

/** 字の4段と、印の色（状態・差し色・レポート専用のトークン・色見本の上の字）の変数。 */
const ALLOWED_TEXT_COLOR =
  /^var\(--(?:ink-bright|ink|ink-soft|ink-quiet|state-[a-z]+|accent|report-[a-z-]+|ground)\)$/

function isAllowedTextColor(value: string): boolean {
  return ALLOWED_TEXT_COLOR.test(value.trim())
}

describe("レポートの字の色", () => {
  it("report-notation.module.css の color は、字の4段と印の色の変数だけ", () => {
    expect(REPORT_CSS_FILES).toHaveLength(11)
    const offenders = REPORT_CSS_FILES.flatMap((file) => {
      const lines = readFileSync(`${RENDERER_DIRECTORY}/${file}`, "utf8").split("\n")
      const commentLines = new Set(commentLineIndexes(lines))
      return lines.flatMap((line, index) => {
        const value = TEXT_COLOR_DECLARATION.exec(line)?.groups?.["value"]
        return !commentLines.has(index) && value !== undefined && !isAllowedTextColor(value)
          ? [`${file}:${index + 1}: ${line.trim()}`]
          : []
      })
    })

    expect(offenders.join("\n")).toBe("")
  })

  it("生の色・color-mix・字の段の外の変数は許さない", () => {
    expect(
      [
        "#fff",
        "rgb(0 0 0)",
        "color-mix(in srgb, var(--ink) 90%, transparent)",
        "var(--font-secondary)",
        "var(--surface)",
      ].filter(isAllowedTextColor),
    ).toStrictEqual([])
    expect(
      ["var(--ink-quiet)", "var(--state-ok)", "var(--accent)", "var(--report-task-id)"].every(
        isAllowedTextColor,
      ),
    ).toBe(true)
  })
})
