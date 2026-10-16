import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, test } from "vitest"

import {
  descendants,
  objectField,
  parseProgram,
  stringField,
} from "../../../scripts/shared/ast-node.ts"
import {
  readScenarioNames,
  ROOM_OPENER,
  scenarioOwners,
  type ScenarioNames,
} from "../../../scripts/shared/e2e-scenario.ts"

describe("readScenarioNames", () => {
  test("文字列リテラルと式なしテンプレートを名前、式つきテンプレートの頭を prefixes に集める", () => {
    const found = readScenarioNames(
      [
        'run.open({ scenario: "chat-history" })',
        "run.open({ scenario: `page-${viewport}` })",
        "open(run, `plain-name`)",
      ].join("\n"),
    )

    expect([...found.names].toSorted()).toEqual(["chat-history", "plain-name"])
    expect(found.prefixes).toEqual(["page-"])
    expect(found.open).toBe(false)
  })

  test.each([
    [
      "無関係な空頭テンプレート",
      'run.open({ scenario: "a" })\nconst card = new RegExp(`${id} を始める`)',
    ],
    ["リテラルの const を辿れる識別子", 'const s = "a"\nrun.open({ scenario: s })'],
    [
      "表のコールバックの引数",
      'it.each(["a", "b"])("x", async (scenario) => { run.open({ scenario }) })',
    ],
    [
      "リテラルを渡す局所関数の引数",
      'async function openIt(scenario) { run.open({ scenario }) }\nopenIt("a")',
    ],
    ["頭のあるテンプレートを渡す位置引数", 'openTaskListRoom(run, `list-${k}`, ["x"])'],
    ["条件式の両側がリテラル", 'run.open({ scenario: ok ? "a" : "b" })'],
    [
      "入れ子の配列の表と const の表",
      'const T = [["a", "x"], ["b", "y"]] as const\nit.each(T)("x", async (scenario, scene) => { run.open({ scenario, scene }) })',
    ],
  ])("%s では open にならない", (_label, source) => {
    expect(readScenarioNames(source).open).toBe(false)
  })

  test.each([
    ["連結", 'run.open({ scenario: "a-" + name })'],
    ["呼び出し", "run.open({ scenario: nameOf(x) })"],
    ["空頭のテンプレート", "run.open({ scenario: `${name}-x` })"],
    ["構文エラー", "run.open({"],
    ["連結を入れた const を渡す", 'const s = "report-task-" + k\nrun.open({ scenario: s })'],
    ["空頭のテンプレートの const を渡す", "const s = `${k}-finished`\nrun.open({ scenario: s })"],
    ["連結を位置引数に渡す", 'openReportTaskRoom(run, "report-task-" + kind, ["main"])'],
    ["import した定数", 'import { NAME } from "./names.ts"\nrun.open({ scenario: NAME })'],
    [
      "連結を渡す局所関数の引数",
      'async function openIt(scenario) { run.open({ scenario }) }\nopenIt("a-" + k)',
    ],
    ["宣言の無い識別子", "run.open({ scenario: unknownName })"],
    ["条件式の片側が連結", 'run.open({ scenario: ok ? "a" : "b-" + k })'],
    [
      "import した表のコールバック",
      'import { TABLE } from "./table.ts"\ntest.each(TABLE)("x", async (scenario) => { run.open({ scenario }) })',
    ],
    [
      "連結で作った表のコールバック",
      'test.each(["a"].map((v) => "p-" + v))("x", async (scenario) => { run.open({ scenario }) })',
    ],
    [
      "map した配列の forEach",
      '["a"].map((v) => "p-" + v).forEach((s) => { run.open({ scenario: s }) })',
    ],
    ["let の再代入", 'let s = "a"\ns = "b-" + x\nrun.open({ scenario: s })'],
    ["let の宣言", 'let s = "a"\nrun.open({ scenario: s })'],
    [
      "名前に合わない局所関数の引数",
      'function start(s) { run.open({ scenario: s }) }\nstart("a-" + x)',
    ],
    ["メンバー呼び出し", 'h.openReportTaskRoom(run, "a-" + x, ["main"])'],
    [
      "局所関数の別名呼び出し",
      'async function openIt(scenario) { run.open({ scenario }) }\nconst f = openIt\nf("a-" + x)',
    ],
    [
      "局所関数を値として渡す",
      'async function openIt(scenario) { run.open({ scenario }) }\n["a"].forEach(openIt)',
    ],
  ])("場面の名前の位置に辿れない式（%s）があれば open", (_label, source) => {
    expect(readScenarioNames(source).open).toBe(true)
  })

  test("コメントの中の名前は拾わない", () => {
    expect(readScenarioNames('// "chat-history"\nconst x = 1').names.has("chat-history")).toBe(
      false,
    )
  })
})

describe("scenarioOwners", () => {
  const names = (found: Partial<ScenarioNames>): ScenarioNames => ({
    names: new Set(),
    prefixes: [],
    open: false,
    ...found,
  })
  const candidates = new Map([
    ["exact.test.ts", names({ names: new Set(["chat-history"]) })],
    ["prefixed.test.ts", names({ prefixes: ["page-"] })],
    ["open.test.ts", names({ open: true })],
    ["other.test.ts", names({ names: new Set(["unrelated"]) })],
  ])

  test("名前の一致・頭の一致・open のファイルを返し、無関係なファイルは返さない", () => {
    expect(scenarioOwners("chat-history", candidates)).toEqual(["exact.test.ts", "open.test.ts"])
    expect(scenarioOwners("page-wide", candidates)).toEqual(["prefixed.test.ts", "open.test.ts"])
    expect(scenarioOwners("nothing", candidates)).toEqual(["open.test.ts"])
  })

  test("open が無く一致も無ければ空", () => {
    const withoutOpen = new Map([...candidates].filter(([file]) => file !== "open.test.ts"))

    expect(scenarioOwners("nothing", withoutOpen)).toEqual([])
  })
})

describe("場面を開く入口", () => {
  const e2eRoot = fileURLToPath(new URL("../../e2e", import.meta.url))

  test("E2E の足場が export する `run.open` を包む関数は、どれも ROOM_OPENER の名前に合う", () => {
    const wrappers = readdirSync(e2eRoot)
      .filter(
        (name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && name !== "scenario-run.ts",
      )
      .flatMap((name) => {
        const program = parseProgram(name, readFileSync(`${e2eRoot}/${name}`, "utf8"))
        return descendants(program ?? {})
          .filter((node) => stringField(node, "type") === "ExportNamedDeclaration")
          .map((node) => objectField(node, "declaration"))
          .filter((declaration) => stringField(declaration, "type") === "FunctionDeclaration")
          .filter((declaration) =>
            descendants(declaration ?? {}).some(
              (node) =>
                stringField(node, "type") === "CallExpression" &&
                stringField(objectField(objectField(node, "callee"), "property"), "name") ===
                  "open",
            ),
          )
          .map((declaration) => stringField(objectField(declaration, "id"), "name") ?? "")
      })

    expect(wrappers.length).toBeGreaterThan(0)
    expect(wrappers.filter((name) => !ROOM_OPENER.test(name))).toEqual([])
  })
})
