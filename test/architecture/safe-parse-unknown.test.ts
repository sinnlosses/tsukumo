import { isPlainObject } from "remeda"
import { describe, expect, it } from "vitest"

import {
  arrayField,
  objectField,
  stringField,
  type AstNode,
} from "../../scripts/shared/ast-node.ts"
import { listSourceFiles, parseSourceProgram, readSourceFile, SRC_ROOT } from "./source-file.ts"

// core と shared の `safeParse` は、形の分からない値（`unknown` の引数）を畳む口でだけ呼ぶ。
// 呼び出しを囲む関数（直近か外側のどれか）に型注釈 `unknown` の引数があれば数えない。
// キーは src からの相対パス、値は数える呼び出しの件数。
const ALLOWED: Readonly<Record<string, { readonly count: number; readonly reason: string }>> = {
  "server/report/core/body/body-figure-fence.ts": {
    count: 1,
    reason: "plot の塊の superRefine と question の refine を読み手に写すことになる",
  },
  "server/item/core/items-file.ts": {
    count: 1,
    reason: "parseJson の直後（JSON の中身は unknown）",
  },
  "server/report/core/body/a2ui-component-splitter.ts": {
    count: 1,
    reason: "parseJson の直後（JSON の中身は unknown）",
  },
  "shared/utils/parse-json.ts": { count: 1, reason: "parseJson の直後（JSON の中身は unknown）" },
  "shared/report/report-image.ts": { count: 1, reason: "URL から切り出した文字列の鍵を読む" },
  "server/report/core/review/tool-error-field.ts": {
    count: 2,
    reason: "JSON.parse した unknown の変数と、その配列の要素を読む",
  },
  "server/report/core/body/legacy-report-component-list.ts": {
    count: 1,
    reason: "Record<string, unknown> の欄の値を読む",
  },
}

const MAX_ALLOWED_TOTAL = 20

const CHECKED_PATH = /^(shared\/|server\/core\/|server\/[^/]+\/core\/)/

const FUNCTION_TYPES: ReadonlySet<string> = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
])

describe("core・shared の safeParse は unknown を受ける関数の中だけ", () => {
  it("unknown を受ける関数の外で呼ぶ件数が、許可の一覧と同じ", () => {
    const counts = Object.fromEntries(
      listSourceFiles(SRC_ROOT)
        .filter((relPath) => CHECKED_PATH.test(relPath) && !relPath.endsWith(".d.ts"))
        .flatMap((relPath) => {
          const count = safeParseOutsideUnknownCount(readSourceFile(relPath), relPath)
          return count > 0 ? [[relPath, count] as const] : []
        }),
    )

    expect(
      safeParseProblems(counts, ALLOWED),
      "引数を unknown で受ける小さな関数に切り出す。形の分かった値は schema を通さず型どおりに組む。どちらも無理なら ALLOWED に理由つきで足し、減ったら件数を下げる",
    ).toEqual([])
  })

  it(`許可の一覧の件数の和は ${String(MAX_ALLOWED_TOTAL)} 以下`, () => {
    const total = Object.values(ALLOWED).reduce((sum, { count }) => sum + count, 0)

    expect(total).toBeLessThanOrEqual(MAX_ALLOWED_TOTAL)
  })

  it.each([
    ["引数が unknown の関数の中", "function f(raw: unknown) { return s.safeParse(raw) }"],
    ["引数が unknown のアロー関数の中", "const f = (raw: unknown) => s.safeParse(raw)"],
    ["既定値つきの unknown の引数", "function f(raw: unknown = 1) { return s.safeParse(raw) }"],
    [
      "外側の関数の引数が unknown",
      "function f(raw: unknown) { return [1].map(() => s.safeParse(raw)) }",
    ],
  ])("数えない: %s", (_name, source) => {
    expect(safeParseOutsideUnknownCount(source, "sample.ts")).toBe(0)
  })

  it.each([
    ["object literal を渡す", 'function f(a: string) { return s.safeParse({ kind: "x", a }) }', 1],
    ["関数の外", "s.safeParse(1)", 1],
    [
      "unknown を返す関数の結果を渡す",
      "const f = (items: readonly string[]) => items.map((item) => s.safeParse(g(item)))",
      1,
    ],
    [
      "unknown を受ける関数の隣の関数",
      "function f(raw: unknown) {}\nfunction g(a: string) { s.safeParse(a); s.safeParse(a) }",
      2,
    ],
  ])("数える: %s", (_name, source, count) => {
    expect(safeParseOutsideUnknownCount(source, "sample.ts")).toBe(count)
  })

  it("構文が読めないファイルは空として扱わず落とす", () => {
    expect(() => safeParseOutsideUnknownCount("const = (", "a.ts")).toThrow("a.ts を読めない")
  })

  it("一覧の超過・一覧に無い・下げ忘れを見分ける", () => {
    const allowed = {
      "shared/a.ts": { count: 1, reason: "架空" },
      "shared/b.ts": { count: 2, reason: "架空" },
      "shared/c.ts": { count: 1, reason: "架空" },
    }

    expect(
      safeParseProblems({ "shared/a.ts": 2, "shared/b.ts": 1, "shared/d.ts": 1 }, allowed),
    ).toEqual([
      { path: "shared/a.ts", problem: "許可の件数を超えた", count: 2, allowed: 1 },
      { path: "shared/b.ts", problem: "許可の件数の下げ忘れ", count: 1, allowed: 2 },
      { path: "shared/d.ts", problem: "許可の一覧に無い", count: 1, allowed: 0 },
      { path: "shared/c.ts", problem: "許可の件数の下げ忘れ", count: 0, allowed: 1 },
    ])
    expect(
      safeParseProblems({ "shared/a.ts": 1, "shared/b.ts": 2, "shared/c.ts": 1 }, allowed),
    ).toEqual([])
  })
})

type SafeParseProblem = {
  readonly path: string
  readonly problem: "許可の件数を超えた" | "許可の一覧に無い" | "許可の件数の下げ忘れ"
  readonly count: number
  readonly allowed: number
}

function safeParseProblems(
  counts: Readonly<Record<string, number>>,
  allowed: Readonly<Record<string, { readonly count: number }>>,
): readonly SafeParseProblem[] {
  const paths = [...new Set([...Object.keys(counts), ...Object.keys(allowed)])]
  return paths.flatMap((path): readonly SafeParseProblem[] => {
    const count = counts[path] ?? 0
    const allowedCount = allowed[path]?.count ?? 0
    if (count === allowedCount) {
      return []
    }
    const problem =
      count < allowedCount
        ? "許可の件数の下げ忘れ"
        : allowedCount === 0
          ? "許可の一覧に無い"
          : "許可の件数を超えた"
    return [{ path, problem, count, allowed: allowedCount }]
  })
}

function safeParseOutsideUnknownCount(source: string, fileName: string): number {
  return outsideUnknownCount(parseSourceProgram(source, fileName), false)
}

function outsideUnknownCount(node: AstNode, insideUnknown: boolean): number {
  const inside =
    insideUnknown ||
    (FUNCTION_TYPES.has(stringField(node, "type") ?? "") && hasUnknownParameter(node))
  const own = !inside && isSafeParseCall(node) ? 1 : 0
  return childNodes(node).reduce((sum, child) => sum + outsideUnknownCount(child, inside), own)
}

function hasUnknownParameter(fn: AstNode): boolean {
  return arrayField(fn, "params").some((parameter) => {
    const annotated =
      stringField(parameter, "type") === "AssignmentPattern"
        ? objectField(parameter, "left")
        : parameter
    const annotation = objectField(objectField(annotated, "typeAnnotation"), "typeAnnotation")
    return stringField(annotation, "type") === "TSUnknownKeyword"
  })
}

function isSafeParseCall(node: AstNode): boolean {
  if (stringField(node, "type") !== "CallExpression") {
    return false
  }
  const callee = objectField(node, "callee")
  return (
    stringField(callee, "type") === "MemberExpression" &&
    stringField(objectField(callee, "property"), "name") === "safeParse"
  )
}

function childNodes(node: AstNode): readonly AstNode[] {
  return Object.values(node)
    .flatMap((value: unknown) => (Array.isArray(value) ? value : [value]))
    .filter((item): item is AstNode => isPlainObject(item) && "type" in item)
}
