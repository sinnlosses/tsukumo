import { describe, expect, it } from "vitest"

import { fileTreeRows } from "../../../src/shared/report/report-file-tree.ts"

const rowsOf = (paths: readonly string[]): readonly string[] =>
  fileTreeRows(paths, (path) => path).map((row) => `${row.guide}${row.name}`)

describe("fileTreeRows", () => {
  it("全部に共通の親は枝のつかない先頭の1行にし、子が1つのフォルダは「/」で連ねる", () => {
    expect(rowsOf(["a/b/c/x.ts", "a/b/c/d/e/y.ts"])).toEqual([
      "a/b/c/",
      "├── x.ts",
      "└── d/e/",
      "    └── y.ts",
    ])
  })

  it("木が分かれる場所で枝を分け、同じ階層は書き手の順のまま、同じフォルダの複数ファイルは1つのフォルダにまとまる", () => {
    expect(rowsOf(["r/z/1.ts", "r/a/2.ts", "r/z/3.ts", "r/top.ts"])).toEqual([
      "r/",
      "├── z/",
      "│   ├── 1.ts",
      "│   └── 3.ts",
      "├── a/",
      "│   └── 2.ts",
      "└── top.ts",
    ])
  })

  it("共通の親が無いときは先頭の行を置かない", () => {
    expect(rowsOf(["notes/a.md", "src/b.ts"])).toEqual([
      "├── notes/",
      "│   └── a.md",
      "└── src/",
      "    └── b.ts",
    ])
  })

  it("フォルダの無いパスだけなら木にせず、罫のない平らな行にする", () => {
    expect(rowsOf(["a.md", "b.md"])).toEqual(["a.md", "b.md"])
  })

  it("頭の「/」は先頭のフォルダ名に残る", () => {
    expect(rowsOf(["/架空/a.md"])).toEqual(["/架空/", "└── a.md"])
  })
})
