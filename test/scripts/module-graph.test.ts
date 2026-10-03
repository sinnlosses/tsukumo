import { describe, expect, test } from "vitest"

import { importedPaths, reachableFrom } from "../../scripts/lib/module-graph.ts"

const KNOWN = new Set([
  "src/browser/main-view.tsx",
  "src/browser/main-view.module.css",
  "src/shared/frame.ts",
  "src/shared/session/state.ts",
  "test/fixture/session.json",
])

describe("importedPaths", () => {
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

describe("reachableFrom", () => {
  test("根自身と、import を辿って届くファイルを返し、循環しても止まる", () => {
    const graph = new Map([
      ["a.ts", ["b.ts"]],
      ["b.ts", ["c.ts", "a.ts"]],
      ["d.ts", ["a.ts"]],
    ])

    expect([...reachableFrom(graph, ["a.ts"])].toSorted()).toEqual(["a.ts", "b.ts", "c.ts"])
  })
})
