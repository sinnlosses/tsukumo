import { describe, expect, test } from "vitest"

import { parseBinaryPaths, parseNameStatus } from "../../../scripts/shared/git-diff-output.ts"

describe("parseNameStatus", () => {
  test("追加・変更・名前変更・コピーだけを拾い、名前変更は元のパスを持つ", () => {
    const output = [
      "A",
      "a.ts",
      "M",
      "b.ts",
      "R100",
      "old.ts",
      "new.ts",
      "D",
      "gone.ts",
      "C90",
      "src.ts",
      "copy.ts",
      "",
    ].join("\0")
    expect(parseNameStatus(output)).toEqual([
      { status: "A", path: "a.ts", previousPath: "a.ts" },
      { status: "M", path: "b.ts", previousPath: "b.ts" },
      { status: "R", path: "new.ts", previousPath: "old.ts" },
      { status: "C", path: "copy.ts", previousPath: "src.ts" },
    ])
  })

  test("空の出力は空", () => {
    expect(parseNameStatus("")).toEqual([])
  })
})

describe("parseBinaryPaths", () => {
  test("`-\\t-\\t` の行だけを集め、名前変更は新しいパスを使う", () => {
    const output = ["1\t2\ttext.ts", "-\t-\timage.png", "-\t-\t", "old.bin", "new.bin", ""].join(
      "\0",
    )
    expect([...parseBinaryPaths(output)]).toEqual(["image.png", "new.bin"])
  })
})
