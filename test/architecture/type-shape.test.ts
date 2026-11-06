import { describe, expect, it } from "vitest"

import {
  arrayField,
  descendants,
  objectField,
  stringField,
  type AstNode,
} from "../../scripts/shared/ast-node.ts"
import { commentLineIndexes } from "./comment-line.ts"
import { lintedFiles } from "./linted-file.ts"
import { parseSourceProgram } from "./source-file.ts"

const TYPESCRIPT_EXTENSIONS = [".ts", ".tsx"] as const satisfies readonly string[]

const ANNOTATED_RECORD_CONSTANT =
  /^[ \t]*(?:export[ \t]+)?const[ \t]+(\w+)[ \t]*:[ \t]*(?:(?:Readonly|Partial)<\s*)*Record<\s*(?!string\b|number\b)[^,<>]+,(?!\s*(?:Readonly(?:Set|Array|Map)<|readonly\s))/gm

describe("定数の Record の型注釈", () => {
  it("src / test / scripts の *.ts / *.tsx で、キーが string・number でなく値が読み取り専用の入れ物でない Record を定数の型注釈に書かない（docs/coding-standards.md「型注釈より `satisfies`」）", () => {
    const offenders = lintedFiles(TYPESCRIPT_EXTENSIONS)
      .filter(({ path }) => !path.endsWith(".d.ts"))
      .flatMap(({ path, lines }) => {
        const commentLines = new Set(commentLineIndexes(lines))
        const code = lines.map((line, index) => (commentLines.has(index) ? "" : line)).join("\n")
        return [...code.matchAll(ANNOTATED_RECORD_CONSTANT)].map(
          (match) => `${path}:${code.slice(0, match.index).split("\n").length}: ${match[1]}`,
        )
      })

    expect(offenders.join("\n")).toBe("")
  })
})

const PROPERTY_TYPES: ReadonlySet<string> = new Set(["TSPropertySignature", "PropertyDefinition"])
const FUNCTION_TYPES: ReadonlySet<string> = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "TSDeclareFunction",
  "TSEmptyBodyFunctionExpression",
  "TSFunctionType",
  "TSConstructorType",
  "TSMethodSignature",
  "TSCallSignatureDeclaration",
  "TSConstructSignatureDeclaration",
])

describe("プロパティと引数の `| undefined`", () => {
  it("src / test / scripts の *.ts / *.tsx（*.d.ts を除く）で、プロパティと引数の型の最上位の合併に `undefined` を書かない（`名前?: 型` で書く。docs/coding-standards.md「「無いかもしれない」値」）", () => {
    expect(explicitUndefinedSites().join("\n")).toBe("")
  })

  it("プロパティと引数の最上位の `undefined` だけを拾い、後ろに必須の引数が続く引数と、戻り値・変数・型引数・入れ子の `undefined` は拾わない", () => {
    const source = [
      "type Shape = {",
      "  readonly flagged: string | undefined",
      "  readonly alsoFlagged?: string | undefined",
      "  readonly parenthesized: (string | number) | (undefined)",
      "  readonly optional?: string",
      "  readonly nested: Record<string, string | undefined>",
      "}",
      "class Holder {",
      "  private field: number | undefined",
      "}",
      "function first(flaggedParam: string | undefined): string | undefined {",
      "  const local: string | undefined = flaggedParam",
      "  return local",
      "}",
      "function second(keptParam: string | undefined, required: string, defaulted: number | undefined = undefined): void {}",
      "const third = (arrowParam: string | undefined, tail?: number, ...rest: string[]) => [arrowParam, tail, rest]",
      "function fourth(chained: string | undefined, next: number | undefined): void {}",
      "type Callback = (typedParam: number | undefined) => void",
      "const state = useState<string | undefined>(undefined)",
    ].join("\n")

    expect(explicitUndefinedNamesIn(parseSourceProgram(source, "source.ts"))).toEqual(
      [
        "flagged",
        "alsoFlagged",
        "parenthesized",
        "field",
        "flaggedParam",
        "defaulted",
        "arrowParam",
        "chained",
        "next",
        "typedParam",
      ].toSorted(),
    )
  })
})

const UNDEFINED_UNION_CEILING = {
  "src/browser/components": 208,
  "src/server/session-driver": 49,
  "scripts/hook": 39,
  "src/shared/report": 34,
  "src/shared/character-pack": 33,
  "src/server/report": 30,
  "scripts/capture": 30,
  "src/server/character-pack": 26,
  "scripts/shared": 20,
  "src/server/session": 18,
  "src/server/chat": 17,
  "src/server/item": 16,
  "src/server/repository": 16,
  "src/server/view-server": 16,
  "scripts/dev": 15,
  "src/browser/features": 13,
  "src/server/adapter": 11,
  "src/server/diary": 11,
  "src/wiring/(root)": 11,
  "src/server/core": 10,
  "src/server/usage": 10,
  "src/shared/session": 10,
  "scripts/document": 10,
  "src/browser/domain": 8,
  "src/server/work-plan": 7,
  "src/browser/stores": 7,
  "src/server/achievement": 6,
  "src/shared/session-driver": 6,
  "scripts/runtime": 6,
  "src/shared/item": 5,
  "src/server/recommendation": 4,
  "src/shared/utils": 4,
  "src/browser/lib": 3,
  "src/server/host": 3,
  "src/server/welcome-greeting": 3,
  "src/shared/diary": 3,
  "src/browser/utils": 2,
  "src/browser/hooks": 1,
  "src/(root)": 1,
  "src/server/checkout": 1,
  "src/server/diagnostic": 1,
  "src/server/workflow-setting": 1,
  "src/shared/(root)": 1,
  "src/shared/repository": 1,
} as const satisfies Readonly<Record<string, number>>

const HOW_TO_FIX =
  "docs/coding-standards.md「「無いかもしれない」値」: 判別可能な合併型にするか、入口で畳んで「ある」ときだけ内側を呼ぶ。減らしたら UNDEFINED_UNION_CEILING を下げる"

describe("`| undefined` の合併型の領域ごとの上限", () => {
  it("src / scripts の `| undefined` の合併型の実数が領域ごとの上限を超えない（表にない領域も落とす）", () => {
    const { over } = ceilingViolations(undefinedUnionCounts(), UNDEFINED_UNION_CEILING)
    expect(over.length === 0 ? "" : `${over.join("\n")}\n${HOW_TO_FIX}`).toBe("")
  })

  it("上限が実数より大きくない（減らしたら表を下げる）", () => {
    const { slack } = ceilingViolations(undefinedUnionCounts(), UNDEFINED_UNION_CEILING)
    expect(slack.length === 0 ? "" : `${slack.join("\n")}\n${HOW_TO_FIX}`).toBe("")
  })

  it("戻り値・変数・型引数・入れ子・括弧つき・TS1016 の引数の `| undefined` を数え、`?:`・`Promise<undefined>`・`T | null` は数えない", () => {
    const source = [
      "function a(x: string | undefined, y: string): string | undefined {",
      "  const v: number | undefined = undefined",
      "  return v === undefined ? undefined : String(x) + y",
      "}",
      "const b = useState<string | undefined>(undefined)",
      "type C = Record<string, (number | undefined)[]>",
      "type D = (string | number) | (undefined)",
      "type E = { f?: string; g: Promise<undefined>; h: string | null }",
    ].join("\n")

    expect(undefinedUnionCountsIn(parseSourceProgram(source, "source.ts"))).toBe(6)
  })

  it("上限を超えた・表にない・下げ忘れの領域を見分け、上限ちょうどは空にする", () => {
    expect(ceilingViolations({ a: 3, b: 1 }, { a: 2 })).toEqual({
      over: ["a: 実数 3 / 上限 2", "b: 実数 1 / 上限 0（表にない領域）"],
      slack: [],
    })
    expect(ceilingViolations({ a: 1 }, { a: 2, z: 1 })).toEqual({
      over: [],
      slack: ["a: 実数 1 / 上限 2", "z: 実数 0 / 上限 1"],
    })
    expect(ceilingViolations({ a: 2 }, { a: 2 })).toEqual({ over: [], slack: [] })
  })
})

// 全ファイルの構文解析は重いので、テスト間で1回だけ行って使い回す（常駐でないキャッシュ）
let parsedFiles:
  | readonly { readonly path: string; readonly source: string; readonly program: AstNode }[]
  | undefined

function parsedSourceFiles(): NonNullable<typeof parsedFiles> {
  parsedFiles ??= lintedFiles(TYPESCRIPT_EXTENSIONS)
    .filter(({ path }) => !path.endsWith(".d.ts"))
    .map(({ path, lines }) => {
      const source = lines.join("\n")
      return { path, source, program: parseSourceProgram(source, path) }
    })
  return parsedFiles
}

function explicitUndefinedSites(): readonly string[] {
  return parsedSourceFiles().flatMap(({ path, source, program }) =>
    explicitUndefinedIn(program).map(
      ({ name, start }) => `${path}:${source.slice(0, start).split("\n").length}: ${name}`,
    ),
  )
}

function undefinedUnionCountsIn(program: AstNode): number {
  return descendants(program).filter(
    (node) =>
      stringField(node, "type") === "TSUnionType" &&
      arrayField(node, "types").some(
        (member) => stringField(unparenthesized(member), "type") === "TSUndefinedKeyword",
      ),
  ).length
}

function regionOf(path: string): string {
  const parts = path.split("/")
  if (parts[0] === "scripts") return parts.length > 2 ? `scripts/${parts[1]}` : "scripts/(root)"
  if (parts.length > 3) return `src/${parts[1]}/${parts[2]}`
  return parts.length > 2 ? `src/${parts[1]}/(root)` : "src/(root)"
}

function undefinedUnionCounts(): Readonly<Record<string, number>> {
  return parsedSourceFiles()
    .filter(({ path }) => path.startsWith("src/") || path.startsWith("scripts/"))
    .reduce<Readonly<Record<string, number>>>((counts, { path, program }) => {
      const count = undefinedUnionCountsIn(program)
      const region = regionOf(path)
      return count === 0 ? counts : { ...counts, [region]: (counts[region] ?? 0) + count }
    }, {})
}

function ceilingViolations(
  counts: Readonly<Record<string, number>>,
  ceilings: Readonly<Record<string, number>>,
): { readonly over: readonly string[]; readonly slack: readonly string[] } {
  const regions = [...new Set([...Object.keys(counts), ...Object.keys(ceilings)])].toSorted()
  const line = (region: string, actual: number, ceiling: number): string =>
    `${region}: 実数 ${actual} / 上限 ${ceiling}`
  const rows = regions.map((region) => ({
    region,
    actual: counts[region] ?? 0,
    ceiling: ceilings[region] ?? 0,
  }))
  return {
    over: rows
      .filter(({ actual, ceiling }) => actual > ceiling)
      .map(
        ({ region, actual, ceiling }) =>
          line(region, actual, ceiling) + (region in ceilings ? "" : "（表にない領域）"),
      ),
    slack: rows
      .filter(({ actual, ceiling }) => actual < ceiling)
      .map(({ region, actual, ceiling }) => line(region, actual, ceiling)),
  }
}

function explicitUndefinedNamesIn(program: AstNode): readonly string[] {
  return explicitUndefinedIn(program)
    .map(({ name }) => name)
    .toSorted()
}

function explicitUndefinedIn(
  program: AstNode,
): readonly { readonly name: string; readonly start: number }[] {
  return descendants(program).flatMap((node) => {
    const type = stringField(node, "type")
    if (type !== undefined && PROPERTY_TYPES.has(type)) {
      return hasTopLevelUndefined(annotationOf(node))
        ? [{ name: propertyNameOf(node), start: startOf(node) }]
        : []
    }
    if (type !== undefined && FUNCTION_TYPES.has(type)) {
      return replaceableParameters(arrayField(node, "params")).map((parameter) => ({
        name: stringField(parameter, "name") ?? "(分割代入)",
        start: startOf(parameter),
      }))
    }
    return []
  })
}

// 後ろに必須の引数が続く引数は `?:` にすると TS1016 になるので、`T | undefined` のまま通す。
// 後ろの `T | undefined` の引数も一緒に `?:` にできるなら、それは必須に数えない。
function replaceableParameters(params: readonly AstNode[]): readonly AstNode[] {
  return params.reduceRight<{
    readonly replaceable: readonly AstNode[]
    readonly tailIsOptional: boolean
  }>(
    ({ replaceable, tailIsOptional }, raw) => {
      const parameter = objectField(raw, "parameter") ?? raw
      const kind = stringField(parameter, "type")
      const target =
        kind === "AssignmentPattern" ? (objectField(parameter, "left") ?? parameter) : parameter
      const skippable =
        kind === "AssignmentPattern" ||
        kind === "RestElement" ||
        Reflect.get(target, "optional") === true
      if (hasTopLevelUndefined(annotationOf(target)) && (skippable || tailIsOptional)) {
        return { replaceable: [...replaceable, target], tailIsOptional }
      }
      return { replaceable, tailIsOptional: tailIsOptional && skippable }
    },
    { replaceable: [], tailIsOptional: true },
  ).replaceable
}

function hasTopLevelUndefined(typeNode?: AstNode): boolean {
  const type = stringField(typeNode, "type")
  if (type === "TSParenthesizedType") {
    return hasTopLevelUndefined(objectField(typeNode, "typeAnnotation"))
  }
  return (
    type === "TSUnionType" &&
    arrayField(typeNode, "types").some(
      (member) => stringField(unparenthesized(member), "type") === "TSUndefinedKeyword",
    )
  )
}

function unparenthesized(typeNode: AstNode): AstNode {
  const inner = objectField(typeNode, "typeAnnotation")
  return stringField(typeNode, "type") === "TSParenthesizedType" && inner !== undefined
    ? unparenthesized(inner)
    : typeNode
}

function annotationOf(node: AstNode): AstNode | undefined {
  return objectField(objectField(node, "typeAnnotation"), "typeAnnotation")
}

function propertyNameOf(node: AstNode): string {
  const key = objectField(node, "key")
  return stringField(key, "name") ?? stringField(key, "value") ?? "(計算されたキー)"
}

function startOf(node: AstNode): number {
  const start: unknown = Reflect.get(node, "start")
  return typeof start === "number" ? start : 0
}
