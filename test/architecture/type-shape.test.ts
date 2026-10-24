import { describe, expect, it } from "vitest"

import {
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

const OPTIONAL_MEMBER_TYPES: ReadonlySet<string> = new Set([
  "TSPropertySignature",
  "TSMethodSignature",
  "PropertyDefinition",
  "MethodDefinition",
])
const OPTIONAL_PARAMETER_TYPES: ReadonlySet<string> = new Set([
  "Identifier",
  "ObjectPattern",
  "ArrayPattern",
])

const ALLOWED_OPTIONAL_PROPERTIES = {
  // 引数ごと `= {}` で省略できる中身で、既定値がある（例外5）
  "src/browser/components/page/achievement/components/bell/bell.tsx": ["size"],
  // react-markdown の `components.img` が受ける props の型（属性を持たないことがある）に合わせる。必須にすると代入できない
  "src/browser/components/page/conversation/components/markdown/renderer/report-image.tsx": [
    "data-change-region",
  ],
  // Chart.js のデータセットの形の再掲（外来の型）
  "src/browser/components/page/conversation/components/markdown/renderer/chart-palette.ts": [
    "type",
    "data",
    "backgroundColor",
    "borderColor",
  ],
} satisfies Readonly<Record<string, readonly string[]>>

// ui の部品の DOM 属性に素通しする props（例外6）
const ALLOWED_OPTIONAL_RULES = [
  {
    pathPrefix: "src/browser/components/ui/",
    name: /^(aria([A-Z]|-)|title$|ref$|placeholder$|maxLength$|style$)/,
  },
] as const satisfies readonly { readonly pathPrefix: string; readonly name: RegExp }[]

function isAllowedOptional(path: string, name: string): boolean {
  return (
    allowedOptionalProperties().includes(`${path}:${name}`) ||
    ALLOWED_OPTIONAL_RULES.some((rule) => path.startsWith(rule.pathPrefix) && rule.name.test(name))
  )
}

describe("オプショナルプロパティ", () => {
  it("src の *.ts / *.tsx（*.d.ts を除く）で、型のプロパティ（引用符つきのキーも）と引数を `名前?: 型` と書くのは許可の一覧と規則に当たる箇所だけ（docs/coding-standards.md「「無いかもしれない」値」）", () => {
    const offenders = optionalProperties().filter(
      (found) => !isAllowedOptional(pathOf(found), nameOf(found)),
    )

    expect(offenders.join("\n")).toBe("")
  })

  it("許可の一覧の項目と規則が、実物にまだ `名前?: 型` として残っている", () => {
    const found = optionalProperties()
    const foundSet = new Set(found)
    const staleEntries = allowedOptionalProperties().filter((entry) => !foundSet.has(entry))
    const staleRules = ALLOWED_OPTIONAL_RULES.filter(
      (rule) =>
        !found.some(
          (entry) => pathOf(entry).startsWith(rule.pathPrefix) && rule.name.test(nameOf(entry)),
        ),
    ).map((rule) => `${rule.pathPrefix}:${rule.name.source}`)

    expect([...staleEntries, ...staleRules].join("\n")).toBe("")
  })

  it("規則は ui の中の aria*・title・ref・placeholder・maxLength・style だけを許し、ui の外の同名と ui の中のそれ以外は許さない", () => {
    const ui = "src/browser/components/ui/button/button.tsx"
    const outside = "src/browser/components/page/x/x.tsx"
    expect([
      isAllowedOptional(ui, "ariaLabel"),
      isAllowedOptional(ui, "aria-label"),
      isAllowedOptional(ui, "title"),
      isAllowedOptional(ui, "ref"),
      isAllowedOptional(ui, "placeholder"),
      isAllowedOptional(ui, "maxLength"),
      isAllowedOptional(ui, "style"),
      isAllowedOptional(outside, "ariaLabel"),
      isAllowedOptional(outside, "placeholder"),
      isAllowedOptional(ui, "hint"),
      isAllowedOptional(ui, "titleText"),
    ]).toEqual([true, true, true, true, true, true, true, false, false, false, false])
  })
})

function pathOf(entry: string): string {
  return entry.slice(0, entry.lastIndexOf(":"))
}

function nameOf(entry: string): string {
  return entry.slice(entry.lastIndexOf(":") + 1)
}

function allowedOptionalProperties(): readonly string[] {
  return Object.entries<readonly string[]>(ALLOWED_OPTIONAL_PROPERTIES).flatMap(([path, names]) =>
    names.map((name) => `${path}:${name}`),
  )
}

function optionalProperties(): readonly string[] {
  return lintedFiles(TYPESCRIPT_EXTENSIONS)
    .filter(({ path }) => path.startsWith("src/") && !path.endsWith(".d.ts"))
    .flatMap(({ path, lines }) =>
      optionalNamesIn(parseSourceProgram(lines.join("\n"), path)).map((name) => `${path}:${name}`),
    )
}

function optionalNamesIn(program: AstNode): readonly string[] {
  return descendants(program).flatMap((node) => {
    if (Reflect.get(node, "optional") !== true) {
      return []
    }
    const type = stringField(node, "type")
    if (type !== undefined && OPTIONAL_MEMBER_TYPES.has(type)) {
      const key = objectField(node, "key")
      return stringField(key, "name") ?? stringField(key, "value") ?? []
    }
    if (type !== undefined && OPTIONAL_PARAMETER_TYPES.has(type)) {
      return objectField(node, "typeAnnotation") === undefined
        ? []
        : (stringField(node, "name") ?? "(分割代入)")
    }
    return []
  })
}
