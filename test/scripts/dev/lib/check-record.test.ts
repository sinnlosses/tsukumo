// 同じ木で `pnpm run check` を打ち直すときの、段を飛ばす・E2E を絞る判定と次の控えの組み立てを検証する。

import { describe, expect, test } from "vitest"

import {
  type CheckRecord,
  EMPTY_CHECK_RECORD,
  findFlakyTests,
  formatLedgerLine,
  isBailed,
  nextRecord,
  planRerun,
  type RerunPlan,
  type StageRunResult,
} from "../../../../scripts/dev/lib/check-record.ts"
import { e2eStage, type Stage } from "../../../../scripts/dev/lib/check-stage.ts"

const TREE = "tree-a"

const STAGES: readonly Stage[] = [
  { name: "typecheck", args: [], heavy: false },
  { name: "lint", args: [], heavy: false },
  { name: "format:check", args: [], heavy: false },
  { name: "test", args: ["--related", "src/cli.ts"], heavy: true },
  e2eStage(["test/e2e/a.test.ts", "test/e2e/b.test.ts"]),
]

function result(name: string, status = 0, files: readonly string[] = []): StageRunResult {
  return {
    name,
    status,
    stopped: false,
    failed: { files, failedTestCount: files.length },
    failedTests: [],
    passedTests: [],
  }
}

const ALL_PASSED = STAGES.map((stage) => result(stage.name))

/** 計画のうち実際に流す段（`results` を返す相手）だけを、流したとおりに並べる。 */
function runStages(plan: RerunPlan): readonly Stage[] {
  return plan.stages.flatMap((entry) =>
    entry.kind === "skip" ? [] : [entry.kind === "narrowed" ? entry.run : entry.planned],
  )
}

function recordAfter(
  record: CheckRecord,
  results: readonly StageRunResult[],
  stages = STAGES,
): CheckRecord {
  return nextRecord(TREE, planRerun(stages, record, TREE).stages, results)
}

describe("planRerun と nextRecord", () => {
  test("同じ木で全段が通った控えなら、2回目は全段を飛ばし、知らせの行に段の名前が出る", () => {
    const first = recordAfter(EMPTY_CHECK_RECORD, ALL_PASSED)
    const second = planRerun(STAGES, first, TREE)
    expect(runStages(second)).toEqual([])
    expect(second.notices).toEqual([
      "同じ木で前回通った段を飛ばす（次の回は流す）: typecheck, lint, format:check, test, test:e2e",
    ])
  })

  test("木が変われば控えがあっても飛ばさない", () => {
    const first = recordAfter(EMPTY_CHECK_RECORD, ALL_PASSED)
    const other = planRerun(STAGES, first, "tree-b")
    expect(runStages(other)).toEqual(STAGES)
    expect(other.notices).toEqual([])
  })

  test("E2E だけが1ファイル落ちた控えなら、軽い段と単体を飛ばし、E2E はそのファイルと bail だけ", () => {
    const first = recordAfter(EMPTY_CHECK_RECORD, [
      ...ALL_PASSED.slice(0, 4),
      result("test:e2e", 1, ["test/e2e/b.test.ts"]),
    ])
    const second = planRerun(STAGES, first, TREE)
    expect(runStages(second)).toEqual([
      { name: "test:e2e", args: ["test/e2e/b.test.ts", "--bail=3"], heavy: true },
    ])
    expect(second.notices).toEqual([
      "同じ木で前回通った段を飛ばす（次の回は流す）: typecheck, lint, format:check, test",
      "E2E は同じ木で前回落ちたファイルだけ流す: test/e2e/b.test.ts",
    ])
  })

  test("3回目は、2回目に飛ばした段と絞って通した E2E をまた流す（2回続けて飛ばさない）", () => {
    const first = recordAfter(EMPTY_CHECK_RECORD, [
      ...ALL_PASSED.slice(0, 4),
      result("test:e2e", 1, ["test/e2e/b.test.ts"]),
    ])
    const second = recordAfter(first, [result("test:e2e")])
    const third = planRerun(STAGES, second, TREE)
    expect(runStages(third)).toEqual(STAGES)
    expect(third.notices).toEqual([])
  })

  test("計画の引数が違う段（関連の対象が変わった単体・--full の E2E）は飛ばさない", () => {
    const first = recordAfter(EMPTY_CHECK_RECORD, ALL_PASSED)
    const changed: readonly Stage[] = [
      ...STAGES.slice(0, 3),
      { name: "test", args: ["--related", "src/cli.ts", "src/server.ts"], heavy: true },
      e2eStage([]),
    ]
    expect(runStages(planRerun(changed, first, TREE)).map((stage) => stage.name)).toEqual([
      "test",
      "test:e2e",
    ])
  })

  test("落ちたテストの数が bail の数に届いた E2E は絞らず、計画どおり流す", () => {
    const failed: StageRunResult = {
      name: "test:e2e",
      status: 1,
      stopped: false,
      failed: { files: ["test/e2e/b.test.ts"], failedTestCount: 3 },
      failedTests: [],
      passedTests: [],
    }
    const first = recordAfter(EMPTY_CHECK_RECORD, [...ALL_PASSED.slice(0, 4), failed])
    expect(runStages(planRerun(STAGES, first, TREE)).at(-1)).toEqual(STAGES.at(-1))
  })
})

describe("findFlakyTests と isBailed", () => {
  const FAILED: StageRunResult = {
    ...result("test", 1),
    failedTests: ["test/a.test.ts > a ng", "test/a.test.ts > b ng"],
  }

  function flakyOn(tree: string, passedTests: readonly string[]) {
    const first = recordAfter(EMPTY_CHECK_RECORD, [FAILED])
    const plan = planRerun(STAGES, first, tree)
    return findFlakyTests(first, tree, plan.stages, [{ ...result("test"), passedTests }])
  }

  test("同じ木で前回落ちて今回通ったテストだけが flaky になる", () => {
    expect(flakyOn(TREE, ["test/a.test.ts > a ng"])).toEqual([
      { stage: "test", test: "test/a.test.ts > a ng" },
    ])
  })

  test("木が変われば、通っても flaky にしない", () => {
    expect(flakyOn("tree-b", ["test/a.test.ts > a ng"])).toEqual([])
  })

  test("前回落ちていないテストは flaky にしない", () => {
    expect(flakyOn(TREE, ["test/a.test.ts > c"])).toEqual([])
  })

  test("台帳の1行は時刻・木・段・テスト名の JSON", () => {
    const line = formatLedgerLine(
      { stage: "test", test: "t" },
      TREE,
      Temporal.Instant.from("2026-10-27T00:00:00Z"),
    )
    expect(JSON.parse(line)).toEqual({
      at: "2026-10-27T00:00:00Z",
      tree: TREE,
      stage: "test",
      test: "t",
    })
  })

  test("E2E は落ちたテストの数が bail の数に届いたときだけ bailed", () => {
    const e2e = (count: number): StageRunResult => ({
      ...result("test:e2e", 1),
      failed: { files: [], failedTestCount: count },
    })
    expect([isBailed(e2e(2)), isBailed(e2e(3)), isBailed({ ...e2e(3), name: "test" })]).toEqual([
      false,
      true,
      false,
    ])
  })
})
