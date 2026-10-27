import { readFileSync } from "node:fs"

import { describe, expect, test } from "vitest"

import {
  buildFeatureEdgeTable,
  readFeatureEdgeTable,
  rewriteFeatureEdgeTable,
  type EdgeRule,
} from "../../../scripts/document/feature-edge-table.ts"
import { readMarkedRows } from "../../../scripts/document/figure-decision-table.ts"
import { REPOSITORY_ROOT } from "../../../scripts/shared/repository-root.ts"

const SERVER_FEATURE = readFileSync(
  `${REPOSITORY_ROOT}/docs/architecture/server-feature.md`,
  "utf8",
)

function rule(feature: string, allowed: readonly string[]): EdgeRule {
  return {
    name: `server-feature-edge:${feature}`,
    to: { pathNot: `^src/server/(?:${[feature, ...allowed].join("|")})/` },
  }
}

describe("buildFeatureEdgeTable", () => {
  const rules = [rule("a", ["b", "c"]), rule("b", []), rule("c", ["b"]), rule("d", [])]

  test("規則の機能と許す先が、行に全部残る", () => {
    const text = buildFeatureEdgeTable(rules)
      .rows.map((cells) => cells.join(" "))
      .join("\n")

    for (const name of ["a", "b", "c", "d"]) {
      expect(text).toContain(`\`${name}\``)
    }
    expect(buildFeatureEdgeTable(rules).rows).toEqual([
      ["`a`", "`b` `c`"],
      ["`c`", "`b`"],
      ["そのほか", "—（葉。`b` `d`）"],
    ])
  })

  test("許す先を1つ落とした入力は、出力から欠ける", () => {
    const dropped = buildFeatureEdgeTable([rule("a", ["b"]), ...rules.slice(1)])

    expect(dropped.rows).not.toEqual(buildFeatureEdgeTable(rules).rows)
  })

  test("機能の規則が1本も無いと throw する", () => {
    expect(() => buildFeatureEdgeTable([{ name: "other", to: {} }])).toThrow("規則が無い")
  })

  test("to.pathNot を読めない規則は throw する", () => {
    expect(() => buildFeatureEdgeTable([{ name: "server-feature-edge:a", to: {} }])).toThrow(
      "to.pathNot を読めない",
    )
  })
})

describe("rewriteFeatureEdgeTable", () => {
  test("印に挟まれた範囲を表に書き直し、印が無い文書は変えない", () => {
    const table = readFeatureEdgeTable()
    const rewritten = rewriteFeatureEdgeTable(`前\n${table.start}\n古い\n${table.end}\n後\n`)

    expect(readMarkedRows(rewritten, table)).toEqual(table.rows)
    expect(rewriteFeatureEdgeTable("本文\n")).toBe("本文\n")
  })
})

describe("server-feature.md の機能どうしの辺の表", () => {
  test("規則から書き直した行と同じ（pnpm run format で直す）", () => {
    const table = readFeatureEdgeTable()

    expect(readMarkedRows(SERVER_FEATURE, table)).toEqual(table.rows)
  })

  test("手で1セル直した表は、規則の行と食い違う", () => {
    const table = readFeatureEdgeTable()
    const edited = SERVER_FEATURE.replace("| `view-server`", "| `view-servers`")

    expect(edited).not.toBe(SERVER_FEATURE)
    expect(readMarkedRows(edited, table)).not.toEqual(table.rows)
  })
})
