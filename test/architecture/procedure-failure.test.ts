import { describe, expect, it } from "vitest"

import { descendants, objectField, stringField } from "../../scripts/shared/ast-node.ts"
import { astNumber } from "./ast-node.ts"
import { listSourceFiles, parseSourceProgram, readSourceFile, SRC_ROOT } from "./source-file.ts"

// 手続きは port が畳んだ値の `kind` だけを見る。失敗を畳んで足跡を残すのは、port を呼ぶ最も外側（`src/wiring/`）の1か所。
const PROCEDURE_PATH = /^server\/[^/]+\/adapter\/[^/]+-procedure\.ts$/

describe("手続きの失敗の畳み", () => {
  it("src/server/*/adapter/*-procedure.ts に `.catch(` も `try` も書かない。失敗は port の側（`src/wiring/` の `foldPortFailure`）で畳んで足跡を残し、手続きは `kind` の分岐だけにする", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => PROCEDURE_PATH.test(relPath))
      .flatMap((relPath) =>
        failureHandlingLines(readSourceFile(relPath)).map((line) => `${relPath}:${String(line)}`),
      )

    expect(offenders).toEqual([])
  })

  it("`.catch(…)` の呼び出しと `try` 文（`catch` つき・`finally` だけ）を拾う", () => {
    expect(failureHandlingLines("p.catch(() => x)")).toEqual([1])
    expect(failureHandlingLines("p.then(f)\n  .catch(handler)")).toEqual([2])
    expect(failureHandlingLines("try {} catch (e) {}")).toEqual([1])
    expect(failureHandlingLines("const a = 1\ntry {} finally {}")).toEqual([2])
  })

  it("別の名前の呼び出しは拾わない", () => {
    expect(failureHandlingLines("p.then(f)")).toEqual([])
    expect(failureHandlingLines("catchAll()")).toEqual([])
    expect(failureHandlingLines("p.catchAll(f)")).toEqual([])
  })

  it("手続きの外のファイルは対象にしない", () => {
    expect(PROCEDURE_PATH.test("server/usage/adapter/plan-usage-procedure.ts")).toBe(true)
    expect(PROCEDURE_PATH.test("server/usage/adapter/plan-usage.ts")).toBe(false)
    expect(PROCEDURE_PATH.test("server/usage/core/plan-usage-procedure.ts")).toBe(false)
    expect(PROCEDURE_PATH.test("wiring/plan-usage-procedure.ts")).toBe(false)
  })
})

/** `.catch(` の呼び出しと `try` 文の行番号（1始まり）。 */
function failureHandlingLines(content: string): readonly number[] {
  return descendants(parseSourceProgram(content)).flatMap((node) => {
    const at = failureHandlingStart(node)
    return at === undefined ? [] : [content.slice(0, at).split("\n").length]
  })
}

/** `.catch` の名前の位置か `try` 文の位置。どちらでもなければ `undefined`。 */
function failureHandlingStart(node: object): number | undefined {
  if (stringField(node, "type") === "TryStatement") {
    return astNumber(node, "start")
  }
  if (stringField(node, "type") !== "CallExpression") {
    return undefined
  }
  const callee = objectField(node, "callee")
  const property = objectField(callee, "property")
  return stringField(callee, "type") === "MemberExpression" &&
    stringField(property, "name") === "catch"
    ? astNumber(property ?? {}, "start")
    : undefined
}
