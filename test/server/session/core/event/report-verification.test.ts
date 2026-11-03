import { describe, expect, it } from "vitest"

import type {
  CheckRecordSource,
  CheckRecordText,
  WorktreeTree,
} from "../../../../../src/server/core/check-record-source.ts"
import { createReportVerifier } from "../../../../../src/server/session/core/event/report-verification.ts"
import type { SessionEvent } from "../../../../../src/shared/session/session-event.ts"
import { reportEvent } from "../../../../fixture/report-event.ts"

const TASK_REPORT = reportEvent({
  toolUseId: "fictional-task-report",
  task: { kind: "task", id: "t-001", name: "架空の作業", outcome: "finished", genre: "work" },
})

const TREE: WorktreeTree = { kind: "known", sha: "tree-aaaa" }

function recordText(tree: string, stages: readonly unknown[]): CheckRecordText {
  return { kind: "text", text: JSON.stringify({ tree, stages }) }
}

async function observe(
  record: CheckRecordText,
  tree: WorktreeTree,
  events: readonly SessionEvent[] = [TASK_REPORT],
): Promise<readonly SessionEvent[]> {
  const source: CheckRecordSource = {
    readRecordText: () => Promise.resolve(record),
    readWorktreeTree: () => Promise.resolve(tree),
  }
  const emitted: SessionEvent[] = []
  const verifier = createReportVerifier(source, (event) => {
    emitted.push(event)
  })
  for (const event of events) {
    verifier.observe(event)
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
  return emitted
}

const STAGES = [
  { name: "typecheck", args: [], result: "passed", retryFiles: [] },
  { name: "test", args: [], result: "carried", retryFiles: [], count: 120 },
  { name: "test:e2e", args: [], result: "failed", retryFiles: [], count: "x" },
]

describe("createReportVerifier", () => {
  it("控えの木が作業ツリーの木と一致すると、段と件数を流す", async () => {
    expect(await observe(recordText("tree-aaaa", STAGES), TREE)).toEqual([
      {
        kind: "report-verification",
        toolUseId: "fictional-task-report",
        stages: [
          { name: "typecheck", result: "passed", count: { kind: "none" } },
          { name: "test", result: "carried", count: { kind: "counted", tests: 120 } },
          { name: "test:e2e", result: "failed", count: { kind: "none" } },
        ],
      },
    ])
  })

  it("木が一致しなければ何も流さない", async () => {
    expect(await observe(recordText("tree-bbbb", STAGES), TREE)).toEqual([])
  })

  it("控えが無い・木が取れないときは何も流さない", async () => {
    expect(await observe({ kind: "unavailable" }, TREE)).toEqual([])
    expect(await observe(recordText("tree-aaaa", STAGES), { kind: "unknown" })).toEqual([])
  })

  it.each([
    ["JSON でない", { kind: "text", text: "架空の文字列" } as const],
    ["stages が配列でない", { kind: "text", text: '{"tree":"tree-aaaa","stages":1}' } as const],
    ["成否が知らない値", recordText("tree-aaaa", [{ name: "test", result: "unknown" }])],
    ["段名が無い", recordText("tree-aaaa", [{ result: "passed" }])],
    ["段が空", recordText("tree-aaaa", [])],
  ])("形が違う控え（%s）では何も流さない", async (_name, record) => {
    expect(await observe(record, TREE)).toEqual([])
  })

  it("task の無い report では読まない", async () => {
    expect(await observe(recordText("tree-aaaa", STAGES), TREE, [reportEvent()])).toEqual([])
  })
})
