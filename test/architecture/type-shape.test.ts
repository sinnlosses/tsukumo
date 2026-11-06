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

function explicitUndefinedSites(): readonly string[] {
  return lintedFiles(TYPESCRIPT_EXTENSIONS)
    .filter(({ path }) => !path.endsWith(".d.ts"))
    .flatMap(({ path, lines }) => {
      const source = lines.join("\n")
      return explicitUndefinedIn(parseSourceProgram(source, path)).map(
        ({ name, start }) => `${path}:${source.slice(0, start).split("\n").length}: ${name}`,
      )
    })
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
