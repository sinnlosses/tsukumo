import { readFileSync } from "node:fs"

import { parseSync } from "vite"
import { describe, expect, it } from "vitest"

import {
  arrayField,
  descendants,
  objectField,
  stringField,
  type AstNode,
} from "../../scripts/shared/ast-node.ts"
import { astNumber } from "./ast-node.ts"
import { listSourceFiles, SRC_ROOT } from "./source-file.ts"

// 失敗を黙って握りつぶす `catch` を、足跡か理由のどちらかが無いまま置かない。
// 「正当な握りつぶしか」は文の意味で決まるので、機械が見るのは形だけにする。
// 意味の無いコメントによる水増しは人のレビューに残る。
const FOOTPRINT_CALLEES = ["reportFailure", "report"]

describe("足跡も理由も無い握りつぶし", () => {
  it("src に、足跡も `//` の理由も無い束縛なしの `catch {` と空引数の `.catch(() => {…})` を書かない。足跡は `reportFailure` を呼び場所の名前を `SWALLOWED_FAILURE_PLACES` へ足す。足跡を持たない層は、なぜ無視してよいかを `//` の1行で catch の本文の先頭に書く", () => {
    const offenders = listSourceFiles(SRC_ROOT).flatMap((relPath) =>
      silentCatchLines(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")).map(
        (line) => `${relPath}:${String(line)}`,
      ),
    )

    expect(offenders).toEqual([])
  })

  it("空の catch・値を捨てるだけの catch・空の `.catch(() => {})` を拾う", () => {
    expect(silentCatchLines("try { f() } catch {}")).toEqual([1])
    expect(silentCatchLines("try {\n  f()\n} catch {\n  g(undefined)\n}")).toEqual([3])
    expect(silentCatchLines("p.catch(() => {})")).toEqual([1])
    expect(silentCatchLines("p.then(f)\n  .catch(() => {\n    g()\n  })")).toEqual([2])
  })

  it("文字列・正規表現の中の `//` と、直前の別の文の行末コメントは理由と見なさない", () => {
    expect(silentCatchLines('try { f() } catch { g("http://x") }')).toEqual([1])
    expect(silentCatchLines("try { f() } catch {\n  g(/\\/\\//)\n}")).toEqual([1])
    expect(silentCatchLines("const a = 1 // 別の文\ntry { f() } catch {\n  g(1)\n}")).toEqual([2])
    expect(silentCatchLines('const u = "https://x"\ntry { f() } catch {\n  g(1)\n}')).toEqual([2])
  })

  it("足跡の呼び出し・catch の本文か直前の行の `//`・束縛つき・引数つき・値を返す形は拾わない", () => {
    expect(silentCatchLines("try { f() } catch { reportFailure(place, undefined) }")).toEqual([])
    expect(silentCatchLines("try { f() } catch {\n  // 無視してよい理由\n  g(1)\n}")).toEqual([])
    expect(silentCatchLines("// 無視してよい理由\ntry { f() } catch {\n  g(1)\n}")).toEqual([])
    expect(silentCatchLines("try { f() } catch (error) { g(1) }")).toEqual([])
    expect(silentCatchLines("p.catch((e) => {})")).toEqual([])
    expect(silentCatchLines("p.catch(() => UNAVAILABLE)")).toEqual([])
    expect(silentCatchLines("p.catch(() => {\n  // 理由\n})")).toEqual([])
  })
})

/** 足跡も理由コメントも無い握りつぶしの行番号（1始まり）。 */
function silentCatchLines(content: string): readonly number[] {
  const { program, comments } = parseWithComments(content)
  return descendants(program).flatMap((node) => {
    const target = swallowingBody(node)
    if (target === undefined || hasFootprint(target.body)) {
      return []
    }
    const bodyEnd = astNumber(target.body, "end") ?? 0
    return hasComment(content, comments, target.start, bodyEnd)
      ? []
      : [content.slice(0, target.start).split("\n").length]
  })
}

/** 束縛なしの `catch` か、引数なしの関数（本文がブロック）を渡す `.catch` なら、その本文と開始位置。 */
function swallowingBody(node: AstNode): { body: AstNode; start: number } | undefined {
  const type = stringField(node, "type")
  if (type === "CatchClause" && objectField(node, "param") === undefined) {
    const body = objectField(node, "body")
    return body === undefined ? undefined : { body, start: astNumber(node, "start") ?? 0 }
  }
  if (type !== "CallExpression" || calleeName(node) !== "catch") {
    return undefined
  }
  const args = arrayField(node, "arguments")
  const handler = args[0]
  const body = objectField(handler, "body")
  const isFunction =
    stringField(handler, "type") === "ArrowFunctionExpression" ||
    stringField(handler, "type") === "FunctionExpression"
  if (
    args.length !== 1 ||
    handler === undefined ||
    body === undefined ||
    !isFunction ||
    arrayField(handler, "params").length !== 0 ||
    stringField(body, "type") !== "BlockStatement"
  ) {
    return undefined
  }
  return { body, start: astNumber(handler, "start") ?? 0 }
}

function calleeName(call: AstNode): string | undefined {
  const callee = objectField(call, "callee")
  if (stringField(callee, "type") === "Identifier") {
    return stringField(callee, "name")
  }
  return stringField(callee, "type") === "MemberExpression"
    ? stringField(objectField(callee, "property"), "name")
    : undefined
}

function hasFootprint(body?: AstNode): boolean {
  return (
    body !== undefined &&
    descendants(body).some(
      (node) =>
        stringField(node, "type") === "CallExpression" &&
        FOOTPRINT_CALLEES.includes(calleeName(node) ?? ""),
    )
  )
}

/** `start` から `end` までにある行コメントか、`start` の行の1行前にそれだけで1行を占める行コメントがあるか。 */
function hasComment(
  content: string,
  comments: readonly LineComment[],
  start: number,
  end: number,
): boolean {
  const lineStart = content.lastIndexOf("\n", start - 1) + 1
  const previousLineStart = content.lastIndexOf("\n", Math.max(lineStart - 2, 0)) + 1
  return comments.some(
    (comment) =>
      (comment.start >= start && comment.end <= end) ||
      (comment.start >= previousLineStart &&
        comment.end <= lineStart &&
        content.slice(previousLineStart, comment.start).trim() === ""),
  )
}

type LineComment = {
  readonly start: number
  readonly end: number
}

/** 構文木と行コメントの範囲。JSX を含む読み方で読めなければ、型アサーション `<T>x` を含む読み方で読み直す。 */
function parseWithComments(content: string): {
  program: AstNode
  comments: readonly LineComment[]
} {
  for (const name of ["source.tsx", "source.ts"]) {
    const parsed = parseSync(name, content)
    if (parsed.errors.length === 0) {
      return {
        program: parsed.program,
        comments: parsed.comments.filter((comment) => comment.type === "Line"),
      }
    }
  }
  throw new Error("source を読めない")
}
