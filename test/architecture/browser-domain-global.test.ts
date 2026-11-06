import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  arrayField,
  objectField,
  stringField,
  type AstNode,
} from "../../scripts/shared/ast-node.ts"
import { astAllChildren, astNumber } from "./ast-node.ts"
import { listSourceFiles, parseSourceProgram, SRC_ROOT } from "./source-file.ts"

const RESTRICTED_GLOBALS = new Set(["document", "window", "navigator", "localStorage"])
const FRAME_PREFIX = "browser/components/frame/"

// DOM の測定だけを目的とする、または保存の窓口を引数で受けられない関数。ファイルごとに1行の理由を付ける。
const EXEMPT_FILES = new Map<string, string>([
  [
    "browser/domain/reveal/start-pop.ts",
    "演出の本体。根の DOM を動かし、飛ばす合図を window で聞く",
  ],
  [
    "browser/domain/reveal/use-report-reveal.ts",
    "演出の hook。動きを減らす設定を window.matchMedia で読む",
  ],
  [
    "browser/components/page/conversation/domain/prompt-image-thumbnail.ts",
    "画像を canvas で縮める。DOM の描画が仕事の本体",
  ],
  [
    "browser/components/page/conversation/components/main-view/domain/outline-geometry.ts",
    "DOM の寸法を読むだけの関数を集めた場所",
  ],
]) satisfies ReadonlyMap<string, string>

describe("browser の domain/ が触るブラウザのグローバル", () => {
  it("domain/ のファイルは document・window・navigator・localStorage を参照しない（例外の一覧を除く）", () => {
    const offenders = domainFiles().flatMap((relPath) =>
      restrictedGlobalUses(relPath, readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")).map(
        (line) => `${relPath}:${String(line)}`,
      ),
    )

    expect(offenders).toEqual([])
  })

  it("例外の一覧は存在する domain/ のファイルだけで、どれも実際にグローバルを参照している", () => {
    const files = new Set(domainFiles(false))
    const stale = [...EXEMPT_FILES.keys()].filter(
      (relPath) =>
        !files.has(relPath) ||
        restrictedGlobalUses(relPath, readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")).length === 0,
    )

    expect(stale).toEqual([])
  })

  it("参照を拾い、コメント・文字列・プロパティ名・同名の束縛は拾わない", () => {
    const lines = (body: string): readonly number[] => restrictedGlobalUses("a.ts", body)

    expect(lines("export const x = () => {\n  return document.title\n}")).toEqual([2])
    expect(lines("void navigator.clipboard.writeText('a')")).toEqual([1])
    expect(lines("const w = typeof window")).toEqual([1])
    expect(lines("localStorage.setItem('a', 'b')")).toEqual([1])
    expect(lines("// document.title\nconst a = 'window'\nconst b = c.document")).toEqual([])
    expect(lines("const o = { navigator: 1 }")).toEqual([])
    expect(lines("function f(window: W) {\n  return window.utilization\n}")).toEqual([])
  })

  it("構文エラーのあるソースは throw する", () => {
    expect(() => restrictedGlobalUses("a.ts", "const = (")).toThrow("a.ts を読めない")
  })
})

function domainFiles(excludeExempt = true): readonly string[] {
  return listSourceFiles(SRC_ROOT)
    .filter((relPath) => relPath.startsWith("browser/"))
    .filter((relPath) => {
      const rest = relPath.startsWith(FRAME_PREFIX) ? relPath.slice(FRAME_PREFIX.length) : relPath
      return rest.split("/").slice(0, -1).includes("domain")
    })
    .filter((relPath) => !excludeExempt || !EXEMPT_FILES.has(relPath))
}

function restrictedGlobalUses(fileName: string, source: string): readonly number[] {
  const program = parseSourceProgram(source, fileName)
  const declared = new Set<string>()
  const references: { readonly name: string; readonly line: number }[] = []

  const collectPattern = (node?: AstNode): void => {
    if (node === undefined) {
      return
    }
    if (stringField(node, "type") === "Identifier") {
      declared.add(stringField(node, "name") ?? "")
      return
    }
    for (const child of astAllChildren(node)) {
      collectPattern(child)
    }
  }

  const visit = (node: AstNode, parent?: AstNode): void => {
    const type = stringField(node, "type")
    if (type === "VariableDeclarator") {
      collectPattern(objectField(node, "id"))
    }
    if (
      type === "FunctionDeclaration" ||
      type === "FunctionExpression" ||
      type === "ArrowFunctionExpression"
    ) {
      arrayField(node, "params").forEach(collectPattern)
    }
    const name = stringField(node, "name")
    if (type === "Identifier" && name !== undefined && RESTRICTED_GLOBALS.has(name)) {
      const parentType = stringField(parent, "type")
      const isMemberName =
        parentType === "MemberExpression" &&
        objectField(parent, "property") === node &&
        Reflect.get(parent ?? {}, "computed") !== true
      const isKey =
        parentType === "Property" &&
        objectField(parent, "key") === node &&
        Reflect.get(parent ?? {}, "computed") !== true &&
        Reflect.get(parent ?? {}, "shorthand") !== true
      if (!isMemberName && !isKey) {
        references.push({
          name,
          line: source.slice(0, astNumber(node, "start") ?? 0).split("\n").length,
        })
      }
    }
    for (const child of astAllChildren(node)) {
      visit(child, node)
    }
  }
  visit(program, undefined)
  return references.filter(({ name }) => !declared.has(name)).map(({ line }) => line)
}
