// JSDoc のリンクの指す先が、そのファイルで宣言も import もされていないものを落とす検査。

import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { REPOSITORY_ROOT } from "../../scripts/shared/repository-root.ts"
import { withoutComments } from "../comment-line.ts"
import { listSourceFiles } from "./source-file.ts"

describe("{@link} の指す先", () => {
  it("`{@link 名前}` の名前の頭の識別子は、同じファイルの本文に現れる", () => {
    const offenders = ["src", "scripts", "test"].flatMap((dir) => {
      const root = `${REPOSITORY_ROOT}/${dir}`
      return listSourceFiles(root).flatMap((relPath) =>
        unresolvedLinkNames(readFileSync(`${root}/${relPath}`, "utf8")).map(
          (name) => `${dir}/${relPath}: ${name}`,
        ),
      )
    })

    expect(offenders).toEqual([])
  })

  it("本文に現れない名前を拾い、頭の識別子だけを見て、import() の形は見ない", () => {
    expect(unresolvedLinkNames("/** {@link Missing} */\nconst a = 1")).toEqual(["Missing"])
    expect(unresolvedLinkNames("/** {@link Foo.bar} */\nconst Foo = 1")).toEqual([])
    expect(unresolvedLinkNames("/** {@link Foo.bar} */\nconst a = 1")).toEqual(["Foo"])
    expect(unresolvedLinkNames('/** {@link import("./a.ts").B} */\nconst a = 1')).toEqual([])
    expect(unresolvedLinkNames("/** {@link Only} */\n// Only\nconst a = 1")).toEqual(["Only"])
    expect(unresolvedLinkNames("/** {@link expanded} */\nconst expanded = true")).toEqual([])
  })
})

function unresolvedLinkNames(content: string): readonly string[] {
  const body = withoutComments(content)
  const heads = [...content.matchAll(/\{@link\s+([^}\s|]+)/g)]
    .flatMap(([, name]) => (name === undefined || name.startsWith("import(") ? [] : name))
    .map((name) => name.split(".")[0] ?? name)
  return [...new Set(heads)].filter((head) => !appearsAsWord(body, head))
}

function appearsAsWord(body: string, word: string): boolean {
  return new RegExp(`(?<![\\w$])${word.replaceAll("$", "\\$")}(?![\\w$])`).test(body)
}
