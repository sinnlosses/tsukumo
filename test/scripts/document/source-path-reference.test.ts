import { describe, expect, it } from "vitest"

import { findSourcePathReferences } from "../../../scripts/document/source-path-reference.ts"

const find = (text: string, sourcePath = "note.md") =>
  findSourcePathReferences(sourcePath, text).map(({ line, targetPath }) => `${line}:${targetPath}`)

describe("文書が指す test/・scripts/・src/ のパス", () => {
  it("バッククォートで囲んだパスを行つきで拾う", () => {
    expect(find("a\n旧い `test/scripts/hook/old-name.test.ts` と `src/x/y.tsx`")).toEqual([
      "2:test/scripts/hook/old-name.test.ts",
      "2:src/x/y.tsx",
    ])
  })

  it(":行・:行-行・# の付いた後ろは落として拾う", () => {
    expect(find("`scripts/a.ts:12` `scripts/b.ts:3-9` `src/c.md#節`")).toEqual([
      "1:scripts/a.ts",
      "1:scripts/b.ts",
      "1:src/c.md",
    ])
  })

  it("見本の記号つき・ファイル名だけ・リンク・囲まれていないパス・別の拡張子は拾わない", () => {
    const text = [
      "`test/**/*.test.ts` `src/<機能>/a.ts` `src/{a,b}.ts` `scripts/$X/a.ts` `src/….ts`",
      "`background-verify.test.ts` [x](src/a.ts) src/b.ts `src/c.txt` `docs/src/d.ts`",
    ].join("\n")
    expect(find(text)).toEqual([])
  })

  it("md 以外のファイルと、照らさない文書・見本のパスは拾わない", () => {
    expect(find("`src/a.ts`", "src/a.ts")).toEqual([])
    expect(find("`src/a.ts`", "docs/architecture/adr/0016-html-instead-of-terminal.md")).toEqual([])
    expect(find("`src/foo.ts`")).toEqual([])
  })
})
