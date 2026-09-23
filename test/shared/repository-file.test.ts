import { describe, expect, it } from "bun:test"

import { readRepositoryFileList } from "../../src/shared/repository-file.ts"

// `/repository-file` が返した JSON を読む側。表示できないものがあっても残りを表示して動作を
// 続ける方針（docs/display.md 4.2）の、配列でないときの既定を確かめる。

describe("readRepositoryFileList", () => {
  it("届いた値が配列でないときは空を返す", () => {
    expect(readRepositoryFileList(undefined)).toEqual([])
    expect(readRepositoryFileList(null)).toEqual([])
    expect(readRepositoryFileList("src/cli.ts")).toEqual([])
    expect(readRepositoryFileList({ path: "src/cli.ts" })).toEqual([])
  })
})
