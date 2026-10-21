import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { astChildren, astDescendants, astNumber, astObject, astString } from "./ast-node.ts"
import { listSourceFiles, parseSourceProgram, SRC_ROOT } from "./source-file.ts"

// 書く口は reject しない約束を、人の注意だけに頼らない。`void p.then(f)` は p が reject すると
// 受け手がおらず unhandledRejection になる（`docs/architecture/core-and-adapter.md`）。
// 型情報を使う no-floating-promises は `void` の付いた形を見逃すので、構文木で見る。
describe("rejection の手を持たない then", () => {
  it("src に `void <式>.then(<引数1つ>)` を書かない。reject の手は2つ目の引数に渡すか、async の関数で try に入れる", () => {
    const offenders = listSourceFiles(SRC_ROOT).flatMap((relPath) =>
      voidThenLines(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")).map(
        (line) => `${relPath}:${String(line)}`,
      ),
    )

    expect(offenders).toEqual([])
  })

  it("引数1つの `void x.then(f)` を拾い、引数2つの then・void の無い then・catch で終わる鎖は拾わない", () => {
    expect(voidThenLines("void p.then(f)")).toEqual([1])
    expect(voidThenLines("\nvoid a.b(c).then((x) => {\n  x\n})")).toEqual([2])
    expect(voidThenLines("void p.catch(g).then(f)")).toEqual([1])
    expect(voidThenLines("void p.then(f, g)")).toEqual([])
    expect(voidThenLines("p.then(f)")).toEqual([])
    expect(voidThenLines("void p.then(f).catch(g)")).toEqual([])
    expect(voidThenLines("void p.catch(g)")).toEqual([])
  })
})

/** `void <式>.then(<引数1つ>)` の行番号（1始まり）。 */
function voidThenLines(content: string): readonly number[] {
  return astDescendants(parseSourceProgram(content)).flatMap((node) => {
    if (astString(node, "type") !== "UnaryExpression" || astString(node, "operator") !== "void") {
      return []
    }
    const call = astObject(node, "argument")
    const callee = astObject(call, "callee")
    const isThen =
      astString(call, "type") === "CallExpression" &&
      astString(callee, "type") === "MemberExpression" &&
      astString(astObject(callee, "property"), "name") === "then"
    if (!isThen || astChildren(call, "arguments").length !== 1) {
      return []
    }
    const start = astNumber(node, "start") ?? 0
    return [content.slice(0, start).split("\n").length]
  })
}
