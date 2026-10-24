import { describe, expect, test } from "vitest"

import { parseProgram } from "../../../scripts/shared/ast-node.ts"
import { DYNAMIC, readReferences } from "../../../scripts/shared/module-reference.ts"

function references(source: string): readonly string[] {
  const program = parseProgram("source.ts", source)
  if (program === undefined) {
    throw new Error("読めない")
  }
  return readReferences(program)
}

describe("readReferences", () => {
  test("相対かどうかを問わず、import・型 import・export from・動的 import・require・new URL の指定を拾う", () => {
    const source = [
      'import fs from "node:fs"',
      'import type { Frame } from "../shared/frame.ts"',
      'export { State } from "./state.ts"',
      'const lazy = () => import("./lazy.ts")',
      'const a = require("./legacy.cjs")',
      'const url = new URL("./fixture.json", import.meta.url)',
    ].join("\n")

    expect(references(source).toSorted()).toEqual(
      [
        "node:fs",
        "../shared/frame.ts",
        "./state.ts",
        "./lazy.ts",
        "./legacy.cjs",
        "./fixture.json",
      ].toSorted(),
    )
  })

  test('"imports" は new URL を除く', () => {
    const program = parseProgram(
      "source.ts",
      'import a from "./a.ts"\nconst u = new URL("./b.json", import.meta.url)',
    )

    expect(program === undefined ? [] : readReferences(program, "imports")).toEqual(["./a.ts"])
  })

  test.each([
    ["変数の動的 import", "const m = import(name)"],
    ["式つきのテンプレートの動的 import", "const m = import(`./${name}.ts`)"],
    ["式の require", "const m = require(name)"],
    ["式の new URL", "const u = new URL(`./${name}`, import.meta.url)"],
    ["import.meta.glob", 'const all = import.meta.glob("./*.tsx")'],
  ])("%s は DYNAMIC", (_label, source) => {
    expect(references(source)).toEqual([DYNAMIC])
  })

  test("import.meta.url を基準にしない new URL とコメントの中の import は拾わない", () => {
    const source = ['// import "./a.ts"', 'const u = new URL("./b", base)'].join("\n")

    expect(references(source)).toEqual([])
  })
})
