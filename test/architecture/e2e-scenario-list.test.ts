// test/e2e/*.test.ts と testing.md「E2E のシナリオの一覧」の食い違いを落とす検査。

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { astDescendants, astObject, astString, parseProgram, type AstNode } from "./ast-node.ts"
import { listSourceFiles } from "./source-file.ts"

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "")
const E2E_ROOT = `${REPO_ROOT}/test/e2e`
const TESTING_DOC = `${REPO_ROOT}/docs/architecture/testing.md`
const LIST_HEADING = "### E2E のシナリオの一覧"

interface ListedFile {
  readonly name: string
  /** 名前の直後の `（N本）` の N。印が無ければ undefined。 */
  readonly count: number | undefined
}

describe("E2E のシナリオの一覧", () => {
  const listed = listedFiles(readFileSync(TESTING_DOC, "utf8"))
  const actual = new Map(
    listSourceFiles(E2E_ROOT)
      .filter((relPath) => !relPath.includes("/") && relPath.endsWith(".test.ts"))
      .map((relPath) => [
        relPath.slice(0, -".test.ts".length),
        countTests(readFileSync(`${E2E_ROOT}/${relPath}`, "utf8")),
      ]),
  )

  it("3列目のファイル名の集合は、test/e2e/*.test.ts と一致する", () => {
    const names = new Set(listed.map(({ name }) => name))
    expect({
      行の無いファイル: [...actual.keys()].filter((name) => !names.has(name)).sort(),
      ファイルの無い行: [...names].filter((name) => !actual.has(name)).sort(),
    }).toEqual({ 行の無いファイル: [], ファイルの無い行: [] })
  })

  it("it が2以上のファイルは名前の直後に `（N本）` が数と同じで置かれ、1のファイルには置かれない", () => {
    const offenders = listed.flatMap(({ name, count }) => {
      const tests = actual.get(name)
      if (tests === undefined) return []
      const expected = tests >= 2 ? tests : undefined
      return count === expected
        ? []
        : `${name}: it は ${tests} 本、一覧の印は ${count === undefined ? "なし" : `${count}本`}`
    })
    expect(offenders).toEqual([])
  })

  it("表から名前と印を拾い、数は it・it.each・test の呼び出しを1つずつ数える", () => {
    const table = [
      LIST_HEADING,
      "",
      "| a | b | ファイル | d |",
      "| - | - | - | - |",
      "| x | y | `one`（足場は `t.ts`） | r |",
      "| x | y | `two`（2本）・`three.test.ts`（3本）（足場は `t.ts`） | r |",
      "| x | y | 載せない（目視） | — |",
      "",
      "### 次",
      "| x | y | `ignored` | r |",
    ].join("\n")
    expect(listedFiles(table)).toEqual([
      { name: "one", count: undefined },
      { name: "two", count: 2 },
      { name: "three", count: 3 },
    ])
    expect(
      countTests('  it("a", () => {})\n  it.each([1])("b", () => {})\n  test("c", () => {})'),
    ).toBe(3)
    expect(countTests('// it("x")\nconst it2 = 1\nfoo.it("y")')).toBe(0)
    expect(countTests('const s = `\nit("x")\n`')).toBe(0)
    expect(countTests('it("a", () => {}); it("b", () => {})')).toBe(2)
    expect(countTests('it.each`\na\n${1}\n`("n", () => {})')).toBe(1)
  })
})

function listedFiles(doc: string): readonly ListedFile[] {
  const section = doc.slice(doc.indexOf(`\n${LIST_HEADING}\n`) + 1).split(/\n#{2,3} /)[0] ?? ""
  return section
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(2)
    .flatMap((line) => {
      const withoutNotes = (line.split("|")[3] ?? "").replaceAll(/（(?!\d+本）)[^）]*）/g, "")
      return [...withoutNotes.matchAll(/`([^`]+)`(?:（(\d+)本）)?/g)]
    })
    .flatMap(([, name, count]) => {
      if (name === undefined) return []
      return {
        name: name.replace(/\.test\.ts$/, ""),
        count: count === undefined ? undefined : Number(count),
      }
    })
}

function countTests(content: string): number {
  return astDescendants(parseProgram("count.test.ts", content)).filter(isTestRegistration).length
}

function isTestRegistration(node: AstNode): boolean {
  const type = astString(node, "type")
  if (type === "CallExpression") {
    const callee = astObject(node, "callee")
    return isTestIdentifier(callee) || isEachMember(callee)
  }
  return type === "TaggedTemplateExpression" && isEachMember(astObject(node, "tag"))
}

function isTestIdentifier(node: AstNode | undefined): boolean {
  const name = astString(node, "name")
  return astString(node, "type") === "Identifier" && (name === "it" || name === "test")
}

function isEachMember(node: AstNode | undefined): boolean {
  return (
    astString(node, "type") === "MemberExpression" &&
    isTestIdentifier(astObject(node, "object")) &&
    astString(astObject(node, "property"), "name") === "each"
  )
}
