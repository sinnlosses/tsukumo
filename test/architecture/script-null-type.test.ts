import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  astChildren,
  astDescendants,
  astNumber,
  astObject,
  astString,
  parseProgram,
  type AstNode,
} from "./ast-node.ts"
import { listSourceFiles } from "./source-file.ts"

const SCRIPTS_ROOT = fileURLToPath(new URL("../../scripts", import.meta.url)).replace(/\/$/, "")

describe("scripts/ の export された型・関数の null", () => {
  it("export された型・関数・クラスのメンバの型に null を書かない", () => {
    const offenders = listSourceFiles(SCRIPTS_ROOT, SCRIPTS_ROOT, [".ts"]).flatMap((relPath) =>
      exportedNullTypeLines(relPath, readFileSync(`${SCRIPTS_ROOT}/${relPath}`, "utf8")).map(
        (line) => `${relPath}:${String(line)}`,
      ),
    )

    expect(offenders).toEqual([])
  })

  it("export された宣言の型の null を拾い、export されていない型と値の比較は拾わない", () => {
    const lines = (source: string): readonly number[] => exportedNullTypeLines("a.ts", source)

    expect(lines("export type A = string | null")).toEqual([1])
    expect(lines("export interface B {\n  readonly x: number | null\n}")).toEqual([2])
    expect(lines("export function f(): number | null {\n  return 1\n}")).toEqual([1])
    expect(lines("export function g(x: string | null): void {}")).toEqual([1])
    expect(lines("export declare function d(): string | null")).toEqual([1])
    expect(lines("export const a = (x: string | null): void => {}")).toEqual([1])
    expect(lines("export const b = (): number | null => 1")).toEqual([1])
    expect(lines("export const c = function (x: string | null): void {}")).toEqual([1])
    expect(lines("export const d: string | null = null")).toEqual([1])
    expect(lines("export class K {\n  readonly p: number | null = 1\n}")).toEqual([2])
    expect(lines("export class K {\n  m(x: string | null): void {}\n}")).toEqual([2])
    expect(lines("export class K {\n  m(): number | null {\n    return 1\n  }\n}")).toEqual([2])
    expect(lines("export default function (x: string | null): void {}")).toEqual([1])
    expect(lines("export default class {\n  readonly p: number | null = 1\n}")).toEqual([2])
    expect(lines("export default (x: string | null): void => {}")).toEqual([1])

    expect(lines("type A = string | null")).toEqual([])
    expect(lines("const a = (x: string | null): void => {}")).toEqual([])
    expect(lines("class K {\n  readonly p: number | null = 1\n}")).toEqual([])
    expect(lines("export const e = (x: string): boolean => {\n  return x === null\n}")).toEqual([])
    expect(
      lines("export const f = (x: string): void => {\n  const y: string | null = x\n}"),
    ).toEqual([])
    expect(
      lines("export class K {\n  m(): void {\n    const y: string | null = null\n  }\n}"),
    ).toEqual([])
    expect(lines("function f(): number | null {\n  return 1\n}")).toEqual([])
    expect(lines("export function g(x: string): boolean {\n  return x === null\n}")).toEqual([])
  })

  it("構文エラーのあるソースは throw する", () => {
    expect(() => exportedNullTypeLines("a.ts", "export type = (")).toThrow("a.ts を読めない")
  })
})

function exportedNullTypeLines(fileName: string, source: string): readonly number[] {
  const program = parseProgram(fileName, source)
  return astChildren(program, "body")
    .filter((statement) =>
      ["ExportNamedDeclaration", "ExportDefaultDeclaration"].includes(
        astString(statement, "type") ?? "",
      ),
    )
    .flatMap((statement) => astObject(statement, "declaration") ?? [])
    .flatMap(typedParts)
    .flatMap(astDescendants)
    .filter((node) => astString(node, "type") === "TSNullKeyword")
    .map((node) => source.slice(0, astNumber(node, "start") ?? 0).split("\n").length)
}

// 関数は本体の中のローカルの型を見ず、引数と戻り値の型だけを見る。
function typedParts(declaration: AstNode): readonly AstNode[] {
  switch (astString(declaration, "type")) {
    case "TSTypeAliasDeclaration":
    case "TSInterfaceDeclaration":
      return [declaration]
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression":
    case "TSDeclareFunction":
      return [
        ...astChildren(declaration, "params"),
        astObject(declaration, "returnType") ?? [],
      ].flat()
    case "VariableDeclaration":
      return astChildren(declaration, "declarations").flatMap((declarator) => [
        ...[astObject(astObject(declarator, "id"), "typeAnnotation") ?? []].flat(),
        ...typedParts(astObject(declarator, "init") ?? {}),
      ])
    case "ClassDeclaration":
    case "ClassExpression":
      return astChildren(astObject(declaration, "body"), "body").flatMap(memberTypedParts)
    default:
      return []
  }
}

function memberTypedParts(member: AstNode): readonly AstNode[] {
  switch (astString(member, "type")) {
    case "PropertyDefinition":
      return [astObject(member, "typeAnnotation") ?? []].flat()
    case "MethodDefinition":
      return typedParts(astObject(member, "value") ?? {})
    default:
      return []
  }
}
