// 同じ木で `pnpm run check` を打ち直すときの、段を飛ばす・E2E を絞る判定と次の控えの組み立てを検証する。

import { describe, expect, test } from "vitest"

import {
  type CheckRecord,
  EMPTY_CHECK_RECORD,
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
  return { name, status, stopped: false, failed: { files, failedTestCount: files.length } }
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
    }
    const first = recordAfter(EMPTY_CHECK_RECORD, [...ALL_PASSED.slice(0, 4), failed])
    expect(runStages(planRerun(STAGES, first, TREE)).at(-1)).toEqual(STAGES.at(-1))
  })
})
