import { describe, expect, test } from "vitest"

import { analyzeImports, reachableFrom } from "../../../scripts/shared/module-graph.ts"

const KNOWN = new Set([
  "src/browser/main-view.tsx",
  "src/browser/main-view.module.css",
  "src/shared/frame.ts",
  "src/shared/session/state.ts",
  "test/fixture/session.json",
])

describe("analyzeImports の paths", () => {
  const importedPaths = (fromPath: string, source: string, known: ReadonlySet<string>) =>
    analyzeImports(fromPath, source, known).paths

  test("複数行・型だけ・副作用だけ・動的な import と new URL の相対指定を、実在するパスへ解決する", () => {
    const source = [
      "import {",
      "  type Frame,",
      '} from "../shared/frame.ts"',
      'import type { State } from "../shared/session/state.ts"',
      'import "./main-view.module.css"',
      'const lazy = () => import("./main-view.tsx")',
      'const fixture = new URL("../../test/fixture/session.json", import.meta.url)',
    ].join("\n")

    expect(importedPaths("src/browser/app.tsx", source, KNOWN).toSorted()).toEqual([
      "src/browser/main-view.module.css",
      "src/browser/main-view.tsx",
      "src/shared/frame.ts",
      "src/shared/session/state.ts",
      "test/fixture/session.json",
    ])
  })

  test("パッケージの指定と、実在しないパスは捨てる", () => {
    const source = ['import { useState } from "react"', 'import { gone } from "./gone.ts"'].join(
      "\n",
    )

    expect(importedPaths("src/browser/app.tsx", source, KNOWN)).toEqual([])
  })
})

describe("analyzeImports", () => {
  const analyze = (source: string) => analyzeImports("src/browser/app.tsx", source, KNOWN)

  test("旧実装が拾っていた4形を、open にせず拾う", () => {
    const result = analyze(
      [
        'import type { Frame } from "../shared/frame.ts"',
        'export { State } from "../shared/session/state.ts"',
        'const lazy = () => import("./main-view.tsx")',
        'const url = new URL("../../test/fixture/session.json", import.meta.url)',
      ].join("\n"),
    )

    expect(result.open).toBe(false)
    expect(result.paths.toSorted()).toEqual([
      "src/browser/main-view.tsx",
      "src/shared/frame.ts",
      "src/shared/session/state.ts",
      "test/fixture/session.json",
    ])
  })

  test("require の文字列と、式を含まないテンプレートの動的 import を拾う", () => {
    const result = analyze(
      ['const a = require("../shared/frame.ts")', "const b = import(`./main-view.tsx`)"].join("\n"),
    )

    expect(result.open).toBe(false)
    expect(result.paths.toSorted()).toEqual(["src/browser/main-view.tsx", "src/shared/frame.ts"])
  })

  test("?raw・?url はクエリを落として実ファイルへ解決し、open にしない", () => {
    const result = analyze(
      [
        'import css from "./main-view.module.css?raw"',
        'import json from "../../test/fixture/session.json?url"',
      ].join("\n"),
    )

    expect(result.open).toBe(false)
    expect(result.paths.toSorted()).toEqual([
      "src/browser/main-view.module.css",
      "test/fixture/session.json",
    ])
  })

  test.each([
    ["クエリを落としても実在しない指定", 'import raw from "./gone.txt?raw"'],
    ["式つきの動的 import", "const m = import(`./${name}.ts`)"],
    ["変数の動的 import", "const m = import(name)"],
    ["式の require", "const m = require(name)"],
    ["import.meta.glob", 'const all = import.meta.glob("./*.tsx")'],
    ["式の new URL", "const u = new URL(`./${name}`, import.meta.url)"],
    ["構文エラー", "import {"],
  ])("%s は open", (_label, source) => {
    expect(analyze(source).open).toBe(true)
  })

  test("コメントと文字列の中の import は拾わない", () => {
    const result = analyze(
      ['// import "./main-view.tsx"', "const text = 'from \"../shared/frame.ts\"'"].join("\n"),
    )

    expect(result).toEqual({ paths: [], open: false })
  })
})

describe("reachableFrom", () => {
  test("open のファイルに届いたら allPaths の全部に届く", () => {
    const graph = new Map([
      ["a.ts", ["b.ts"]],
      ["b.ts", []],
    ])
    const allPaths = new Set(["a.ts", "b.ts", "c.ts", "d.json"])

    expect([...reachableFrom(graph, ["a.ts"], new Set(["b.ts"]), allPaths)].toSorted()).toEqual([
      "a.ts",
      "b.ts",
      "c.ts",
      "d.json",
    ])
    expect([...reachableFrom(graph, ["a.ts"], new Set(["c.ts"]), allPaths)].toSorted()).toEqual([
      "a.ts",
      "b.ts",
    ])
  })

  test("根自身と、import を辿って届くファイルを返し、循環しても止まる", () => {
    const graph = new Map([
      ["a.ts", ["b.ts"]],
      ["b.ts", ["c.ts", "a.ts"]],
      ["d.ts", ["a.ts"]],
    ])

    expect([...reachableFrom(graph, ["a.ts"])].toSorted()).toEqual(["a.ts", "b.ts", "c.ts"])
  })
})
