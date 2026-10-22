import { readFileSync } from "node:fs"
import { posix } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { DOCUMENT_CHECK_TEST_FILES } from "../../scripts/dev/lib/check-stage.ts"
import { astChildren, astDescendants, astObject, astString, type AstNode } from "./ast-node.ts"
import { listSourceFiles, parseSourceProgram } from "./source-file.ts"

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "")

const CONFIG_FILES = ["vite.config.ts", "vitest.config.ts", "vitest.e2e.config.ts"] as const

const VITEST_CONFIG_FILES = ["vitest.config.ts", "vitest.e2e.config.ts"] as const

const ALLOWED_TEST_ONLY_EXPORTS = {
  "scripts/capture/lib/capture-page.ts#pressFocusNotice":
    "公開口 applyPreparations は実ブラウザの Page を要るので、--press の届き先の知らせの文面を値で確かめる",
  "scripts/capture/lib/capture-page.ts#settleRender":
    "公開口 settlePage は実ブラウザの Page を要るので、描き直しの待ちを evaluate だけの代役で確かめる",
  "scripts/capture/lib/capture-page.ts#waitUntilStable":
    "公開口 settlePage は本文の領域を撮って比べるので、連続2回の一致で止まる数えを値で確かめる",
  "scripts/capture/lib/capture-page.ts#collectMisses":
    "公開口 applyPreparations は実ブラウザの Page を要るので、外れた手の集め方と打ち切りを値で確かめる",
  "scripts/capture/lib/capture-page.ts#waitForRevealEnd":
    "公開口 settlePage は実ブラウザの Page を要るので、演出の終わりの待ちと上限を evaluate だけの代役で確かめる",
  "scripts/capture/lib/paper-hue.ts#srgbToOklch":
    "公開口 hueFamilies は画全体を色相の族へ畳むので、色の変換を既知の色の値で確かめる",
  "scripts/capture/lib/scene-end.ts#countEventKinds":
    "公開口 watchSceneEvents は WebSocket の受信を要るので、配られた本文のイベントの数えを値で確かめる",
  "scripts/dev/lib/submodule-drift.ts#classifySubmoduleStatus":
    "公開口 alignSubmodules は git を打つので、git submodule status の出力の分類を値で確かめる",
  "scripts/hook/lib/hook-input.ts#parseBashHookCall":
    "公開口 readBashHookCall は標準入力を読むので、hook の入力 JSON の読みを値で確かめる",
  "scripts/shared/instance-location.ts#readLiveInstanceLocations":
    "公開口 findRunningTsukumo はポートの待ち受けを調べるので、所在のファイルと pid の生死の突き合わせだけを確かめる",
  "scripts/shared/e2e-scenario.ts#ROOM_OPENER":
    "E2E の足場の名前の規約を、場面の読み取りと同じ正規表現で確かめる（写すと2つがずれる）",
} as const satisfies Record<string, string>

describe("scripts/ のテストからしか import されない export", () => {
  it("許可リストの外に無い", () => {
    const found = testOnlyExports(readRepositorySources(), productionReader())

    expect(found.filter((key) => !(key in ALLOWED_TEST_ONLY_EXPORTS))).toEqual([])
  })

  it("許可リストの項目は、いまもテストからしか import されない", () => {
    const found = new Set(testOnlyExports(readRepositorySources(), productionReader()))

    expect(Object.keys(ALLOWED_TEST_ONLY_EXPORTS).filter((key) => !found.has(key))).toEqual([])
  })

  it("本番の側の読み手・型注釈から名指される型・まとめて読む import を数え、テストだけが読む export を拾う", () => {
    const sources = new Map([
      [
        "scripts/lib/a.ts",
        [
          "export type Argument = { readonly inner: Inner }",
          "export type Inner = number",
          "export type Loose = string",
          "export function used(argument: Argument): void {}",
          "export function onlyTest(): void {}",
          "export const ONLY_TEST = 1",
          "export function setupOnly(): void {}",
          "export function reexported(): void {}",
        ].join("\n"),
      ],
      ["scripts/lib/spaced.ts", "export function spaced(): void {}"],
      ["scripts/lib/late.ts", "export function late(): void {}"],
      [
        "scripts/entry.ts",
        [
          'import { used } from "./lib/a.ts"',
          'import * as spacedModule from "./lib/spaced.ts"',
          'export { reexported } from "./lib/a.ts"',
          'await import("./lib/late.ts")',
        ].join("\n"),
      ],
      ["test/setup.ts", 'import { setupOnly } from "../scripts/lib/a.ts"'],
      [
        "test/a.test.ts",
        [
          'import { ONLY_TEST, onlyTest, used, type Argument, type Inner, type Loose } from "../scripts/lib/a.ts"',
          'import { spaced } from "../scripts/lib/spaced.ts"',
          'import { late } from "../scripts/lib/late.ts"',
        ].join("\n"),
      ],
    ])
    const isReader = (path: string): boolean =>
      path.startsWith("scripts/") || path === "test/setup.ts"

    expect(testOnlyExports(sources, isReader).toSorted()).toEqual([
      "scripts/lib/a.ts#Loose",
      "scripts/lib/a.ts#ONLY_TEST",
      "scripts/lib/a.ts#onlyTest",
    ])
  })

  it("vitest の設定から setup のファイルを読む", () => {
    expect(vitestSetupFiles().length).toBeGreaterThan(0)
  })
})

type ImportUse = { readonly target: string; readonly names: readonly string[] | "all" }

type ExportedSymbol = { readonly name: string; readonly local: string }

function readRepositorySources(): ReadonlyMap<string, string> {
  const paths = [
    ...listSourceFiles(`${REPOSITORY_ROOT}/scripts`, `${REPOSITORY_ROOT}/scripts`, [".ts"]).map(
      (path) => `scripts/${path}`,
    ),
    ...listSourceFiles(`${REPOSITORY_ROOT}/src`).map((path) => `src/${path}`),
    ...listSourceFiles(`${REPOSITORY_ROOT}/test`).map((path) => `test/${path}`),
    ...CONFIG_FILES,
  ]
  return new Map(paths.map((path) => [path, readFileSync(`${REPOSITORY_ROOT}/${path}`, "utf8")]))
}

function productionReader(): (path: string) => boolean {
  const readers = new Set<string>([
    ...CONFIG_FILES,
    ...vitestSetupFiles(),
    ...DOCUMENT_CHECK_TEST_FILES,
  ])
  return (path) => path.startsWith("scripts/") || path.startsWith("src/") || readers.has(path)
}

function vitestSetupFiles(): readonly string[] {
  return VITEST_CONFIG_FILES.flatMap((configPath) =>
    astDescendants(parseSourceProgram(readFileSync(`${REPOSITORY_ROOT}/${configPath}`, "utf8")))
      .filter(
        (node) =>
          astString(node, "type") === "Property" &&
          ["globalSetup", "setupFiles"].includes(astString(astObject(node, "key"), "name") ?? ""),
      )
      .flatMap((property) => astChildren(astObject(property, "value"), "elements"))
      .flatMap((element) => astString(element, "value") ?? [])
      .map((path) => posix.normalize(path)),
  )
}

/** `scripts/` の export のうち、テストの側からだけ import されるものを `<パス>#<名前>` で返す。 */
function testOnlyExports(
  sources: ReadonlyMap<string, string>,
  isReader: (path: string) => boolean,
): readonly string[] {
  const programs = new Map([...sources].map(([path, source]) => [path, parseSourceProgram(source)]))
  const exportsOf = new Map(
    [...programs]
      .filter(([path]) => path.startsWith("scripts/"))
      .map(([path, program]) => [path, exportedSymbols(program)]),
  )
  const productionUses = new Set<string>()
  const testUses = new Set<string>()
  for (const [reader, program] of programs) {
    for (const use of importUses(reader, program)) {
      const symbols = exportsOf.get(use.target)
      if (symbols === undefined) {
        continue
      }
      const names = use.names === "all" ? symbols.map(({ name }) => name) : use.names
      for (const name of names) {
        ;(isReader(reader) ? productionUses : testUses).add(`${use.target}#${name}`)
      }
    }
  }
  return [...exportsOf].flatMap(([path, symbols]) => {
    const used = symbols.filter(({ name }) => productionUses.has(`${path}#${name}`))
    const signatureTypes = typesNamedFrom(
      programs.get(path) ?? {},
      used.map(({ local }) => local),
    )
    return symbols
      .filter(
        ({ name, local }) =>
          testUses.has(`${path}#${name}`) &&
          !productionUses.has(`${path}#${name}`) &&
          !signatureTypes.has(local),
      )
      .map(({ name }) => `${path}#${name}`)
  })
}

function exportedSymbols(program: AstNode): readonly ExportedSymbol[] {
  return astChildren(program, "body").flatMap((statement): readonly ExportedSymbol[] => {
    switch (astString(statement, "type")) {
      case "ExportDefaultDeclaration":
        return [{ name: "default", local: "default" }]
      case "ExportNamedDeclaration": {
        const declared = declaredNames(astObject(statement, "declaration")).map((name) => ({
          name,
          local: name,
        }))
        const specified = astChildren(statement, "specifiers").map((specifier) => ({
          name: symbolName(astObject(specifier, "exported")),
          local: symbolName(astObject(specifier, "local")),
        }))
        return [...declared, ...specified]
      }
      default:
        return []
    }
  })
}

function declaredNames(declaration: AstNode | undefined): readonly string[] {
  if (astString(declaration, "type") === "VariableDeclaration") {
    return astChildren(declaration, "declarations").flatMap(
      (declarator) => astString(astObject(declarator, "id"), "name") ?? [],
    )
  }
  return [astString(astObject(declaration, "id"), "name") ?? []].flat()
}

function symbolName(node: AstNode | undefined): string {
  return astString(node, "name") ?? astString(node, "value") ?? ""
}

function importUses(reader: string, program: AstNode): readonly ImportUse[] {
  return astDescendants(program).flatMap((node): readonly ImportUse[] => {
    const specifier = astString(astObject(node, "source"), "value")
    if (specifier === undefined || !specifier.startsWith(".")) {
      return []
    }
    const target = posix.normalize(posix.join(posix.dirname(reader), specifier))
    switch (astString(node, "type")) {
      case "ImportDeclaration":
        return [{ target, names: importedNames(node) }]
      case "ExportNamedDeclaration":
        return [
          {
            target,
            names: astChildren(node, "specifiers").map((s) => symbolName(astObject(s, "local"))),
          },
        ]
      case "ExportAllDeclaration":
      case "ImportExpression":
        return [{ target, names: "all" }]
      default:
        return []
    }
  })
}

function importedNames(declaration: AstNode): readonly string[] | "all" {
  const specifiers = astChildren(declaration, "specifiers")
  if (specifiers.some((s) => astString(s, "type") === "ImportNamespaceSpecifier")) {
    return "all"
  }
  return specifiers.map((specifier) =>
    astString(specifier, "type") === "ImportDefaultSpecifier"
      ? "default"
      : symbolName(astObject(specifier, "imported")),
  )
}

// 本番が使う宣言の型注釈から、同じファイルの宣言をたどって名指される型の名前。
function typesNamedFrom(program: AstNode, roots: readonly string[]): ReadonlySet<string> {
  const declarations = topLevelDeclarations(program)
  const reached = new Set<string>()
  const pending = [...roots]
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    const referenced = (declarations.get(name) ?? [])
      .flatMap(astDescendants)
      .filter((node) => astString(node, "type") === "TSTypeReference")
      .flatMap((node) => astString(astObject(node, "typeName"), "name") ?? [])
    for (const typeName of referenced) {
      if (!reached.has(typeName)) {
        reached.add(typeName)
        pending.push(typeName)
      }
    }
  }
  return reached
}

function topLevelDeclarations(program: AstNode): ReadonlyMap<string, readonly AstNode[]> {
  const declarations = new Map<string, AstNode[]>()
  for (const statement of astChildren(program, "body")) {
    const type = astString(statement, "type")
    const declaration =
      type === "ExportNamedDeclaration" || type === "ExportDefaultDeclaration"
        ? astObject(statement, "declaration")
        : statement
    const names = type === "ExportDefaultDeclaration" ? ["default"] : declaredNames(declaration)
    for (const name of names) {
      declarations.set(name, [...(declarations.get(name) ?? []), declaration ?? statement])
    }
  }
  return declarations
}
