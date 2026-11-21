import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createRouterClient, ORPCError } from "@orpc/server"
import { isPlainObject } from "remeda"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createReportExportFolder } from "../../../../src/server/report/adapter/report-export-file.ts"
import { reportExportProcedure } from "../../../../src/server/report/adapter/report-export-procedure.ts"
import { FRAME_ERROR_REASON } from "../../../../src/shared/frame-error-reason.ts"
import type { SessionRecord } from "../../../../src/shared/session/session-record.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../src/shared/session/session-state.ts"
import { detailRecord, reportRecord, requestRecord } from "../../../fixture/session-record.ts"
import { checkedTaskId } from "../../../fixture/task-id.ts"

// 内容はすべて架空（実物の会話を使わない）。保存先は一時ディレクトリで、`open` は起こさない。

let directory = ""

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "tsukumo-report-export-"))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

const FINISHED_TURN = {
  kind: "finished",
  startedAt: 0,
  finishedAt: 1,
  ending: { kind: "ended" },
} as const

function stateWith(
  records: readonly SessionRecord[],
  overrides: Partial<SessionState> = {},
): SessionState {
  return { ...INITIAL_SESSION_STATE, records, turn: FINISHED_TURN, ...overrides }
}

const TASK_TURN: readonly SessionRecord[] = [
  requestRecord({ turnId: 3, text: "架空の依頼の1行目\n2行目" }),
  reportRecord("架空の中間"),
  reportRecord("架空の結論", {
    task: { kind: "task", id: "PROJ-7", name: "架空の作業", outcome: "finished", genre: "work" },
  }),
]

function setUp(options: { readonly state?: SessionState; readonly directory?: string } = {}) {
  const launched: (readonly [string, string])[] = []
  const client = createRouterClient(
    reportExportProcedure({
      state: () => options.state ?? stateWith(TASK_TURN),
      findImage: () => undefined,
      now: () => 0,
      localTimeAt: () => Temporal.PlainDateTime.from("2026-01-02T03:04"),
      folder: createReportExportFolder({
        directory: options.directory ?? directory,
        launch: (path, mode) => {
          launched.push([path, mode])
          return Promise.resolve(true)
        },
      }),
    }),
    { context: { session: { generation: () => ({ emit: () => {} }) } } },
  )
  return { client, launched }
}

const SAVE_INPUT = { turnId: 3, bodyHtml: "<p>架空の本文</p>", css: "" }

async function refusalOf(pending: Promise<unknown>): Promise<unknown> {
  try {
    await pending
  } catch (error) {
    if (error instanceof ORPCError && error.code === "REFUSED" && isPlainObject(error.data)) {
      return error.data["reason"]
    }
    throw error
  }
  return "受け付けた"
}

describe("reportExport の手続き", () => {
  it("閉じたターンの最終レポートを保存先に1つの HTML で書き、パスとファイル名を返す", async () => {
    const { client } = setUp()

    const saved = await client.save(SAVE_INPUT)

    expect(saved).toEqual({
      path: join(directory, "tsukumo-report-PROJ-7-20260102-0304.html"),
      fileName: "tsukumo-report-PROJ-7-20260102-0304.html",
    })
    const written = await readFile(saved.path, "utf8")
    expect(written).toMatch(/^<!doctype html>/)
    expect(written).toContain("架空の作業")
    expect(written).toContain("架空の依頼の1行目")
  })

  it("同じ名前が既にあれば上書きせず、末尾に -2 を足した名前で書く", async () => {
    const { client } = setUp()

    const first = await client.save(SAVE_INPUT)
    const second = await client.save(SAVE_INPUT)

    expect(second.fileName).toBe("tsukumo-report-PROJ-7-20260102-0304-2.html")
    expect(new Set(await readdir(directory))).toEqual(new Set([first.fileName, second.fileName]))
  })

  it("最終レポートを持たないターン・動いているターン・雑談・無いターンは断る", async () => {
    const requestOnly = stateWith([requestRecord({ turnId: 3 })])
    const running = stateWith(TASK_TURN, { turn: { kind: "running", startedAt: 0 } })
    const chat = stateWith([requestRecord({ turnId: 3 }), detailRecord()], { chatMode: true })

    for (const state of [requestOnly, running, chat]) {
      expect(await refusalOf(setUp({ state }).client.save(SAVE_INPUT))).toBe(
        FRAME_ERROR_REASON.reportExportNotFinal,
      )
    }
    expect(await refusalOf(setUp().client.save({ ...SAVE_INPUT, turnId: 9 }))).toBe(
      FRAME_ERROR_REASON.reportExportNotFinal,
    )
    expect(await readdir(directory)).toEqual([])
  })

  it("ターン本体が終わっても、バックグラウンドタスクが残るいちばん新しいターンは断る", async () => {
    const state = stateWith(TASK_TURN, {
      backgroundTasks: [{ taskId: checkedTaskId("t1"), kind: "shell", description: "架空の背景" }],
    })

    expect(await refusalOf(setUp({ state }).client.save(SAVE_INPUT))).toBe(
      FRAME_ERROR_REASON.reportExportNotFinal,
    )
    expect(await readdir(directory)).toEqual([])
  })

  it("新しいターンが始まったあとの、閉じた前のターンは書ける", async () => {
    const state = stateWith([...TASK_TURN, requestRecord({ turnId: 4 })], {
      turn: { kind: "running", startedAt: 0 },
    })

    expect((await setUp({ state }).client.save(SAVE_INPUT)).fileName).toContain("PROJ-7")
  })

  it("書き込めない保存先では理由の語つきで断る", async () => {
    const { client } = setUp({ directory: join(directory, "無い保存先") })

    expect(await refusalOf(client.save(SAVE_INPUT))).toBe(
      FRAME_ERROR_REASON.reportExportWriteFailed,
    )
  })

  it("書いたパスだけを開き・表示し、書いていないパスは外へ渡さずに断る", async () => {
    const { client, launched } = setUp()
    const saved = await client.save(SAVE_INPUT)

    await client.openInBrowser({ path: saved.path })
    await client.revealInFinder({ path: saved.path })
    const unknown = join(directory, "書いていない.html")

    expect(await refusalOf(client.openInBrowser({ path: unknown }))).toBe(
      FRAME_ERROR_REASON.reportExportOpenFailed,
    )
    expect(await refusalOf(client.revealInFinder({ path: unknown }))).toBe(
      FRAME_ERROR_REASON.reportExportOpenFailed,
    )
    expect(launched).toEqual([
      [saved.path, "browser"],
      [saved.path, "finder"],
    ])
  })
})
