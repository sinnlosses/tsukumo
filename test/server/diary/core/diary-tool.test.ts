import { describe, expect, it } from "bun:test"

import {
  createDiaryIntake,
  diaryArgumentHasBookmarkKey,
  type DiaryDay,
} from "../../../../src/server/diary/core/diary-tool.ts"
import { type SessionEvent } from "../../../../src/shared/session-event.ts"

// 引数はすべて手で書いた架空の文面（docs/coding-standards.md「会話内容の扱い」）。保存の成否だけ
// 差し替えられる偽の `save` を使い、実際のファイル I/O は `test/server/diary/adapter/diary.test.ts` で
// 確かめる。

const DAY: DiaryDay = {
  date: "2026-09-23",
  doneTasks: [
    { id: "T-1", summary: "架空のタスク1" },
    { id: "T-2", summary: "架空のタスク2" },
  ],
}

const NO_TASK_DAY: DiaryDay = { date: "2026-09-24", doneTasks: [] }

const WRITER = { pack: "tsukumo", name: "つくも" }

function intakeOf(day: DiaryDay = DAY, saveResult = true) {
  const events: SessionEvent[] = []
  const saved: unknown[] = []
  const intake = createDiaryIntake(
    day,
    WRITER,
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
  it("正しい呼び出しは受け付けられ、diary-written が流れる", async () => {
    const { intake, events, saved } = intakeOf()

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
        writer: WRITER,
        bookmark: { kind: "placed", taskId: "T-1", summary: "架空のタスク1", reason: "架空の理由" },
      },
    ])
  })

  it("同じ問い合わせで2回目は断られる（1回目は変わらず受け付けたまま）", async () => {
    const { intake, events } = intakeOf()

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

  it("問い合わせごとに窓口を作り直せば、別の窓口として受け付けられる", async () => {
    const first = intakeOf()
    await first.intake.submit({
      body: "架空の本文1。",
      expression: "default",
      bookmark: { taskId: "T-1", reason: "架空の理由" },
    })

    const second = intakeOf()
    const verdict = await second.intake.submit({
      body: "架空の本文2。",
      expression: "default",
      bookmark: { taskId: "T-1", reason: "架空の理由" },
    })

    expect(verdict.kind).toBe("accepted")
  })

  it("body が空なら断る", async () => {
    const { intake } = intakeOf()

    const verdict = await intake.submit({
      body: "   ",
      expression: "default",
      bookmark: { taskId: "T-1", reason: "架空の理由" },
    })

    expect(verdict).toEqual({ kind: "rejected", text: expect.stringContaining("body") })
  })

  it("body が長すぎれば断る", async () => {
    const { intake } = intakeOf()

    const verdict = await intake.submit({
      body: "あ".repeat(601),
      expression: "default",
      bookmark: { taskId: "T-1", reason: "架空の理由" },
    })

    expect(verdict.kind).toBe("rejected")
  })

  it("終えたタスクがある日に bookmark が無ければ断る", async () => {
    const { intake } = intakeOf()

    const verdict = await intake.submit({
      body: "架空の本文。",
      expression: "default",
      bookmark: undefined,
    })

    expect(verdict.kind).toBe("rejected")
  })

  it("終えたタスクが無い日は bookmark を省いてよい", async () => {
    const { intake, events } = intakeOf(NO_TASK_DAY)

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

    const verdict = await intake.submit({
      body: "架空の本文。",
      expression: "default",
      bookmark: { taskId: "T-99", reason: "架空の理由" },
    })

    expect(verdict).toEqual({ kind: "rejected", text: expect.stringContaining("taskId") })
  })

  it("bookmark.reason が空なら断る", async () => {
    const { intake } = intakeOf()

    const verdict = await intake.submit({
      body: "架空の本文。",
      expression: "default",
      bookmark: { taskId: "T-1", reason: "  " },
    })

    expect(verdict.kind).toBe("rejected")
  })

  it("bookmark.reason が長すぎれば断る", async () => {
    const { intake } = intakeOf()

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
      DAY,
      WRITER,
      () => 1_700_000_000_000,
      async () => succeed,
      (event) => events.push(event),
    )

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

describe("diaryArgumentHasBookmarkKey", () => {
  it("空の断片は false", () => {
    expect(diaryArgumentHasBookmarkKey("")).toBe(false)
  })

  it("bookmark が無い断片は false", () => {
    expect(diaryArgumentHasBookmarkKey('{"body":"架空の本文","expression":"proud"')).toBe(false)
  })

  it("値としての「bookmark」（鍵ではない）は拾わない", () => {
    expect(diaryArgumentHasBookmarkKey('{"body":"bookmark"')).toBe(false)
  })

  it("最上位の鍵 bookmark が現れたら true（値がまだ閉じていなくても）", () => {
    expect(diaryArgumentHasBookmarkKey('{"body":"架空","bookmark":{"taskId":"T-1"')).toBe(true)
  })

  it("鍵と `:` の間に空白があっても拾う", () => {
    expect(diaryArgumentHasBookmarkKey('{"bookmark" : {')).toBe(true)
  })

  it("入れ子の中の bookmark（最上位ではない）は拾わない", () => {
    expect(diaryArgumentHasBookmarkKey('{"body":{"bookmark":1}}')).toBe(false)
  })

  it("断片の切れ目をまたいでも、累積した文字列を渡し直せば拾える", () => {
    const fragments = ['{"bo', 'dy":"架空","book', 'mark":{"taskId"']
    let buffer = ""
    let found = false
    for (const fragment of fragments) {
      buffer += fragment
      found = diaryArgumentHasBookmarkKey(buffer)
    }
    expect(found).toBe(true)
  })
})
