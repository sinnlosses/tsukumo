import { describe, expect, it } from "vitest"

import type {
  CheckRecordSource,
  WorktreeTree,
} from "../../../../../src/server/repository/core/check-record-source.ts"
import {
  createReportMapper,
  type ReportMapReader,
} from "../../../../../src/server/session/core/event/report-map.ts"
import type { ChangedFile } from "../../../../../src/shared/report/changed-file.ts"
import type { ReportMap } from "../../../../../src/shared/report/report-map.ts"
import type { SessionEvent } from "../../../../../src/shared/session/session-event.ts"

const TREE: WorktreeTree = { kind: "known", sha: "tree-aaaa" }
const CHANGED: readonly ChangedFile[] = [{ path: "src/a.ts", change: "modified" }]
const MAP: ReportMap = {
  view: { level: 1, boxes: [], edges: [], intendedEdges: [], closedCount: 0, findings: [] },
  files: [],
  drift: [],
}

const SUMMARY: SessionEvent = {
  kind: "report-change-summary",
  toolUseId: "fictional-task-report",
  changed: CHANGED,
  files: 1,
  added: 1,
  removed: 0,
  mixed: false,
}

async function observe(read: ReportMapReader): Promise<readonly SessionEvent[]> {
  const source: CheckRecordSource = {
    readRecordText: () => Promise.resolve({ kind: "unavailable" }),
    readWorktreeTree: () => Promise.resolve(TREE),
  }
  const emitted: SessionEvent[] = []
  createReportMapper(source, read, (event) => {
    emitted.push(event)
  }).observe(SUMMARY)
  await new Promise((resolve) => setTimeout(resolve, 0))
  return emitted
}

describe("createReportMapper", () => {
  it("report-change-summary を受けて mapped なら report-map を1件流し、木と変えたファイルを口へそのまま渡す", async () => {
    const calls: unknown[] = []
    const emitted = await observe((changed, tree) => {
      calls.push({ changed, tree })
      return Promise.resolve({ kind: "mapped", map: MAP })
    })

    expect(emitted).toEqual([{ kind: "report-map", toolUseId: "fictional-task-report", map: MAP }])
    expect(calls).toEqual([{ changed: CHANGED, tree: TREE }])
  })

  it("none のときと、読みが投げたときは何も流さない", async () => {
    expect(await observe(() => Promise.resolve({ kind: "none" }))).toEqual([])
    expect(await observe(() => Promise.reject(new Error("読めない")))).toEqual([])
  })
})
