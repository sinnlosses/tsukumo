import { describe, expect, it } from "bun:test"

import { createDiaryIntake, type DiaryDay } from "../../../src/server/core/diary-tool.ts"
import { type SessionEvent } from "../../../src/shared/session-event.ts"

// 引数はすべて手で書いた架空の文面（docs/coding-standards.md「会話内容の扱い」）。保存の成否だけ
// 差し替えられる偽の `save` を使い、実際のファイル I/O は `test/server/adapter/diary.test.ts` で
// 確かめる。

const DAY: DiaryDay = {
  date: "2026-09-23",
  doneTasks: [
    { id: "T-1", summary: "架空のタスク1" },
    { id: "T-2", summary: "架空のタスク2" },
  ],
}

const NO_TASK_DAY: DiaryDay = { date: "2026-09-24", doneTasks: [] }

function intakeOf(saveResult = true) {
  const events: SessionEvent[] = []
  const saved: unknown[] = []
  const intake = createDiaryIntake(
    () => 1_700_000_000_000,
    async (params) => {
      saved.push(params)
      return saveResult
    },
    (event) => events.push(event),
  )
  return { intake, events, saved }
}

describe("createDiaryIntake", () => {
  it("いま書く日が無ければ断り、状態を変えない", async () => {
    const { intake, events } = intakeOf()

    const verdict = await intake.submit({
      body: "架空の本文。",
      expression: "default",
      bookmark: undefined,
    })

    expect(verdict.kind).toBe("rejected")
    expect(events).toEqual([])
  })

  it("正しい呼び出しは受け付けられ、diary-written が流れる", async () => {
    const { intake, events, saved } = intakeOf()
    intake.beginDay(DAY)

    const verdict = await intake.submit({
      body: "架空の本文。",
      expression: "proud",
      bookmark: { taskId: "T-1", reason: "架空の理由" },
    })

    expect(verdict).toEqual({ kind: "accepted" })
    expect(events).toEqual([{ kind: "diary-written", date: "2026-09-23" }])
    expect(saved).toEqual([
      {
        date: "2026-09-23",
        writtenAtEpochMilliseconds: 1_700_000_000_000,
        body: "架空の本文。",
        expression: "proud",
        bookmark: { kind: "placed", taskId: "T-1", summary: "架空のタスク1", reason: "架空の理由" },
      },
    ])
  })

  it("同じターンで2回目は断られる（1回目は変わらず受け付けたまま）", async () => {
    const { intake, events } = intakeOf()
    intake.beginDay(DAY)

    const first = await intake.submit({
      body: "架空の本文1。",
      expression: "default",
      bookmark: { taskId: "T-1", reason: "架空の理由" },
    })
    const second = await intake.submit({
      body: "架空の本文2。",
      expression: "default",
      bookmark: { taskId: "T-1", reason: "架空の理由" },
    })

    expect(first.kind).toBe("accepted")
    expect(second.kind).toBe("rejected")
    expect(events).toEqual([{ kind: "diary-written", date: "2026-09-23" }])
  })

  it("beginDay を呼び直すと、新しいターンとして再び受け付けられる", async () => {
    const { intake, events } = intakeOf()
    intake.beginDay(DAY)
    await intake.submit({
      body: "架空の本文1。",
      expression: "default",
      bookmark: { taskId: "T-1", reason: "架空の理由" },
    })

    intake.beginDay(DAY)
    const second = await intake.submit({
      body: "架空の本文2。",
      expression: "default",
      bookmark: { taskId: "T-1", reason: "架空の理由" },
    })

    expect(second.kind).toBe("accepted")
    expect(events).toHaveLength(2)
  })

  it("forgetDay を呼ぶと、いま書く日が無い扱いに戻る", async () => {
    const { intake, events } = intakeOf()
    intake.beginDay(DAY)
    intake.forgetDay()

    const verdict = await intake.submit({
      body: "架空の本文。",
      expression: "default",
      bookmark: { taskId: "T-1", reason: "架空の理由" },
    })

    expect(verdict.kind).toBe("rejected")
    expect(events).toEqual([])
  })

  it("body が空なら断る", async () => {
    const { intake } = intakeOf()
    intake.beginDay(DAY)

    const verdict = await intake.submit({
      body: "   ",
      expression: "default",
      bookmark: { taskId: "T-1", reason: "架空の理由" },
    })

    expect(verdict).toEqual({ kind: "rejected", text: expect.stringContaining("body") })
  })

  it("body が長すぎれば断る", async () => {
    const { intake } = intakeOf()
    intake.beginDay(DAY)

    const verdict = await intake.submit({
      body: "あ".repeat(601),
      expression: "default",
      bookmark: { taskId: "T-1", reason: "架空の理由" },
    })

    expect(verdict.kind).toBe("rejected")
  })

  it("終えたタスクがある日に bookmark が無ければ断る", async () => {
    const { intake } = intakeOf()
    intake.beginDay(DAY)

    const verdict = await intake.submit({
      body: "架空の本文。",
      expression: "default",
      bookmark: undefined,
    })

    expect(verdict.kind).toBe("rejected")
  })

  it("終えたタスクが無い日は bookmark を省いてよい", async () => {
    const { intake, events } = intakeOf()
    intake.beginDay(NO_TASK_DAY)

    const verdict = await intake.submit({
      body: "架空の本文。",
      expression: "default",
      bookmark: undefined,
    })

    expect(verdict).toEqual({ kind: "accepted" })
    expect(events).toEqual([{ kind: "diary-written", date: "2026-09-24" }])
  })

  it("bookmark.taskId がその日の終えたタスクに無ければ断る", async () => {
    const { intake } = intakeOf()
    intake.beginDay(DAY)

    const verdict = await intake.submit({
      body: "架空の本文。",
      expression: "default",
      bookmark: { taskId: "T-99", reason: "架空の理由" },
    })

    expect(verdict).toEqual({ kind: "rejected", text: expect.stringContaining("taskId") })
  })

  it("bookmark.reason が空なら断る", async () => {
    const { intake } = intakeOf()
    intake.beginDay(DAY)

    const verdict = await intake.submit({
      body: "架空の本文。",
      expression: "default",
      bookmark: { taskId: "T-1", reason: "  " },
    })

    expect(verdict.kind).toBe("rejected")
  })

  it("bookmark.reason が長すぎれば断る", async () => {
    const { intake } = intakeOf()
    intake.beginDay(DAY)

    const verdict = await intake.submit({
      body: "架空の本文。",
      expression: "default",
      bookmark: { taskId: "T-1", reason: "あ".repeat(121) },
    })

    expect(verdict.kind).toBe("rejected")
  })

  it("保存に失敗したら断り、次の呼び出しは受け付けられる（同じ枠を消費しない）", async () => {
    const events: SessionEvent[] = []
    let succeed = false
    const intake = createDiaryIntake(
      () => 1_700_000_000_000,
      async () => succeed,
      (event) => events.push(event),
    )
    intake.beginDay(DAY)

    const failed = await intake.submit({
      body: "架空の本文。",
      expression: "default",
      bookmark: { taskId: "T-1", reason: "架空の理由" },
    })
    succeed = true
    const retried = await intake.submit({
      body: "架空の本文。",
      expression: "default",
      bookmark: { taskId: "T-1", reason: "架空の理由" },
    })

    expect(failed.kind).toBe("rejected")
    expect(retried.kind).toBe("accepted")
    expect(events).toEqual([{ kind: "diary-written", date: "2026-09-23" }])
  })
})
