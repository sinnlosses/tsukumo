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

describe("オプショナルプロパティ", () => {
  it("src の *.ts / *.tsx（*.d.ts を除く）で、型のプロパティ（引用符つきのキーも）と引数を `名前?: 型` と書くのは許可の一覧にある箇所だけ（docs/coding-standards.md「「無いかもしれない」値」）", () => {
    const allowed = new Set(allowedOptionalProperties())
    const offenders = optionalProperties().filter((found) => !allowed.has(found))

    expect(offenders.join("\n")).toBe("")
  })

  it("許可の一覧の項目が、実物にまだ `名前?: 型` として残っている", () => {
    const found = new Set(optionalProperties())
    const stale = allowedOptionalProperties().filter((entry) => !found.has(entry))

    expect(stale.join("\n")).toBe("")
  })
})

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
