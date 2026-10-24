import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { commentLineIndexes } from "./comment-line.ts"
import { listSourceFiles, SRC_ROOT } from "./source-file.ts"

describe("font-size", () => {
  it("src/browser/ の *.css で、theme.css 以外のコメント行でない行の font-size が、トークンかそれに従う値だけ", () => {
    const offenders = listSourceFiles(SRC_ROOT, SRC_ROOT, [".css"])
      .filter((relPath) => relPath.startsWith("browser/") && relPath !== "browser/styles/theme.css")
      .flatMap((relPath) => {
        const lines = readFileSync(`${SRC_ROOT}/${relPath}`, "utf8").split("\n")
        const commentLines = new Set(commentLineIndexes(lines))
        return lines.flatMap((line, index) => {
          const value = commentLines.has(index) ? undefined : FONT_SIZE_DECLARATION.exec(line)?.[1]
          return value !== undefined && !isAllowedFontSize(value)
            ? [`src/${relPath}:${index + 1}`]
            : []
        })
      })

    expect(offenders.join("\n")).toBe("")
  })

  it("判定は、トークン・em・%・inherit・局所のつまみを通し、px・rem・clamp・calc の直書きを拒む", () => {
    const allowed = [
      "var(--font-label)",
      "var(--report-heading-2)",
      "0.86em",
      "85%",
      "inherit",
      "var(--balloon-past-scale)",
    ]
    const rejected = [
      "12px",
      "0.75rem",
      "11.5px",
      "clamp(12px, 1cqh, 14px)",
      "calc(1rem * 2)",
      "var(--other)",
    ]

    expect(allowed.filter((value) => !isAllowedFontSize(value))).toEqual([])
    expect(rejected.filter((value) => isAllowedFontSize(value))).toEqual([])
  })
})

const FONT_SIZE_DECLARATION = /(?<![\w-])font-size\s*:\s*([^;}]+)/

const LOCAL_FONT_SIZE_VARIABLES = [
  "--diary-text",
  "--diary-title",
  "--balloon-latest-scale",
  "--balloon-past-scale",
] as const

function isAllowedFontSize(value: string): boolean {
  const trimmed = value.trim()
  return (
    /^var\(--(font|report-heading)-[\w-]+\)$/.test(trimmed) ||
    /^[\d.]+(em|%)$/.test(trimmed) ||
    trimmed === "inherit" ||
    LOCAL_FONT_SIZE_VARIABLES.some((name) => trimmed === `var(${name})`)
  )
}
