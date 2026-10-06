import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { bundledFakeSession } from "./fixture/bundled-fake-session.ts"

// E2E の期待値・`DOM_ROOT_SELECTORS` の口・疑似セッションの場面が、使い手のいないまま残らないことを見る。
// 使い手は名前の文字列で数える。E2E を走らせず、ソースと文書を読むだけで判定する。

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url))
const E2E_ROOT = join(REPOSITORY_ROOT, "test/e2e")
const EXPECTED_ROOT = join(E2E_ROOT, "expected")
const SCENARIO_RUN = join(E2E_ROOT, "scenario-run.ts")

function readText(path: string): string {
  return readFileSync(join(REPOSITORY_ROOT, path), "utf8")
}

function listFiles(directory: string, extensions: readonly string[]): readonly string[] {
  return readdirSync(join(REPOSITORY_ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) {
      return entry.name === "node_modules" || entry.name === "expected"
        ? []
        : listFiles(path, extensions)
    }
    return extensions.some((extension) => entry.name.endsWith(extension)) ? [path] : []
  })
}

/** 引用符・バッククォートで囲まれた文字列を、囲みを除いて全部拾う。 */
function quotedLiterals(source: string): readonly string[] {
  return [...source.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map((match) => match[2] ?? "")
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** テンプレートの `${…}` を任意の文字列に読み替えた正規表現。 */
function literalPattern(literal: string): RegExp {
  const source = literal
    .split(/\$\{[^}]*\}/)
    .map((part) => escapeRegExp(part))
    .join(".+")
  return new RegExp(`^${source}$`)
}

const e2eSources = listFiles("test/e2e", [".ts"]).map((path) => ({ path, text: readText(path) }))

describe("E2E の期待値", () => {
  const expectedNames = readdirSync(EXPECTED_ROOT)
  const scenarioNames = [
    ...new Set(expectedNames.map((name) => name.replace(/\.(dom|messages)\.json$/, ""))),
  ]
  const literals = e2eSources.flatMap((source) => quotedLiterals(source.text))

  it("期待値は .dom.json と .messages.json の組でそろっている", () => {
    const unpaired = scenarioNames.filter(
      (name) =>
        !expectedNames.includes(`${name}.dom.json`) ||
        !expectedNames.includes(`${name}.messages.json`),
    )
    expect(unpaired).toEqual([])
  })

  it("どのシナリオ名の文字列からも引かれない期待値は無い", () => {
    const patterns = literals.map(literalPattern)
    const orphans = scenarioNames.filter((name) => !patterns.some((pattern) => pattern.test(name)))
    expect(orphans).toEqual([])
  })
})

describe("DOM_ROOT_SELECTORS の口", () => {
  const table =
    readText("test/e2e/scenario-run.ts")
      .split("const DOM_ROOT_SELECTORS = {\n")[1]
      ?.split("\n} as const")[0] ?? ""
  const keys = table
    .split("\n")
    .map((line) => /^ {2}(?:"([^"]+)"|([A-Za-z]+)):/.exec(line))
    .flatMap((match) => (match === null ? [] : [match[1] ?? match[2] ?? ""]))

  it("表からキーを読める", () => {
    expect(keys.length).toBeGreaterThanOrEqual(2)
  })

  it("どの E2E も domRoots に渡さない口は無い", () => {
    const passed = new Set(
      e2eSources
        .filter((source) => join(REPOSITORY_ROOT, source.path) !== SCENARIO_RUN)
        .flatMap((source) => quotedLiterals(source.text)),
    )
    expect(keys.filter((key) => !passed.has(key))).toEqual([])
  })
})

describe("疑似セッションの場面", () => {
  const sceneNames = bundledFakeSession().turns.map((turn) => turn.name)

  const codeTexts = ["test", "scripts", "src"]
    .flatMap((directory) => listFiles(directory, [".ts", ".tsx"]))
    .map(readText)
  const codeLiterals = new Set([
    ...codeTexts.flatMap(quotedLiterals),
    ...codeTexts.flatMap((text) =>
      [...text.matchAll(/--scene ([a-z][a-z0-9-]*)/g)].map((match) => match[1] ?? ""),
    ),
  ])
  const documentedNames = new Set(
    [...listFiles("docs/architecture", [".md"]), "README.md", "docs/architecture.md"].flatMap(
      (path) =>
        [...readText(path).matchAll(/`(?:TSUKUMO_FAKE_SCENE=)?([a-z][a-z0-9-]*)[`)]/g)].map(
          (match) => match[1] ?? "",
        ),
    ),
  )

  it("どの使い手からも引かれない場面は無い", () => {
    const unused = sceneNames.filter(
      (name) => !codeLiterals.has(name) && !documentedNames.has(name),
    )
    expect(unused).toEqual([])
  })
})
