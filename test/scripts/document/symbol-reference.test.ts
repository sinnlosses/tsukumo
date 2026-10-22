import { describe, expect, it } from "vitest"

import { collectStraySymbolReferences } from "../../../scripts/document/lib/repository-reference.ts"
import {
  findStraySymbolReferences,
  findSymbolReferences,
  formatStraySymbolReference,
  isSymbolCheckedDocument,
} from "../../../scripts/document/symbol-reference.ts"
import { REPOSITORY_ROOT } from "../../../scripts/shared/repository-root.ts"

// 文書が「`パス` の `シンボル`」で指している置き場所が、そのファイルに残っているかを0件に保つ。
// 関数や定数を別のファイルへ移したときに、文書に残った旧い置き場所をここで知る。
// 拾う形と照合の強さは `findSymbolReferences` の冒頭に書いてある。
// 一覧を見るだけなら `node scripts/document/find-stray-reference.ts`。

describe("文書が指すシンボルの置き場所", () => {
  it("`パス` の `シンボル` を行番号つきで拾う", () => {
    expect(findSymbolReferences("note.md", "前\n`src/a.ts` の `foo` を見る")).toEqual([
      { sourcePath: "note.md", line: 2, targetPath: "src/a.ts", symbol: "foo" },
    ])
  })

  it("間に他の語が挟まる形・パスだけの形・.ts 以外のパスは拾わない", () => {
    const text = "`src/a.ts` にある `foo`\n`src/a.ts`\n`src/a.css` の `foo`\n`lib/a.ts` の `foo`"
    expect(findSymbolReferences("note.md", text)).toEqual([])
  })

  it("`Foo.bar` と `foo()` は頭の識別子で照らす", () => {
    const sources = new Map([["src/a.ts", "class Foo {}\nfunction foo() {}"]])
    const references = findSymbolReferences(
      "note.md",
      "`src/a.ts` の `Foo.bar`、`src/a.ts` の `foo()`",
    )
    expect(references.map((reference) => reference.symbol)).toEqual(["Foo.bar", "foo()"])
    expect(findStraySymbolReferences(references, sources)).toEqual([])
  })

  it("ファイルが無いのとシンボルが無いのが違反になり、語の一部では当たりにならない", () => {
    const references = findSymbolReferences(
      "note.md",
      "`src/gone.ts` の `foo`\n`src/a.ts` の `foo`",
    )
    const strays = findStraySymbolReferences(
      references,
      new Map([["src/a.ts", "const fooBar = 1"]]),
    )
    expect(strays.map(formatStraySymbolReference)).toEqual([
      "note.md:1: src/gone.tsのfoo（ファイルが無い）",
      "note.md:2: src/a.tsのfoo（シンボルが無い）",
    ])
  })

  it("記録の置き場は対象外で、正典・README.md・AGENTS.md・規約は対象", () => {
    expect(
      [
        "docs/history/tasks.md",
        "docs/research/topic.md",
        "docs/architecture.md",
        "README.md",
        "AGENTS.md",
        ".claude/rules/typescript.md",
        "src/a.md",
      ].map(isSymbolCheckedDocument),
    ).toEqual([false, false, true, true, true, true, false])
  })

  it("文書が指すシンボルは、すべてそのファイルに実在する", () => {
    expect(collectStraySymbolReferences(REPOSITORY_ROOT).map(formatStraySymbolReference)).toEqual(
      [],
    )
  })
})
