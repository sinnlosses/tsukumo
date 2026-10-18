// test/e2e/*.test.ts と testing.md「E2E のシナリオの一覧」の食い違いを落とす検査。

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { listSourceFiles } from "./source-file.ts"

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "")
const E2E_ROOT = `${REPO_ROOT}/test/e2e`
const TESTING_DOC = `${REPO_ROOT}/docs/architecture/testing.md`
const LIST_HEADING = "### E2E のシナリオの一覧"

describe("E2E のシナリオの一覧", () => {
  it("3列目のファイル名の集合は、test/e2e/*.test.ts と一致する", () => {
    const names = new Set(listedNames(readFileSync(TESTING_DOC, "utf8")))
    const actual = listSourceFiles(E2E_ROOT)
      .filter((relPath) => !relPath.includes("/") && relPath.endsWith(".test.ts"))
      .map((relPath) => relPath.slice(0, -".test.ts".length))
    expect({
      行の無いファイル: actual.filter((name) => !names.has(name)).sort(),
      ファイルの無い行: [...names].filter((name) => !actual.includes(name)).sort(),
    }).toEqual({ 行の無いファイル: [], ファイルの無い行: [] })
  })

  it("表の3列目から、注の括弧の中を除いてファイル名を拾う", () => {
    const table = [
      LIST_HEADING,
      "",
      "| a | b | ファイル | d |",
      "| - | - | - | - |",
      "| x | y | `one`（足場は `t.ts`） | r |",
      "| x | y | `two`・`three.test.ts`（足場は `t.ts`） | r |",
      "| x | y | 載せない（目視） | — |",
      "",
      "### 次",
      "| x | y | `ignored` | r |",
    ].join("\n")
    expect(listedNames(table)).toEqual(["one", "two", "three"])
  })
})

function listedNames(doc: string): readonly string[] {
  const section = doc.slice(doc.indexOf(`\n${LIST_HEADING}\n`) + 1).split(/\n#{2,3} /)[0] ?? ""
  return section
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(2)
    .flatMap((line) => {
      const withoutNotes = (line.split("|")[3] ?? "").replaceAll(/（[^）]*）/g, "")
      return [...withoutNotes.matchAll(/`([^`]+)`/g)]
    })
    .flatMap(([, name]) => (name === undefined ? [] : name.replace(/\.test\.ts$/, "")))
}
