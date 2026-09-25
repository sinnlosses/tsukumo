import { describe, expect, it } from "bun:test"

import {
  createDiaryIntake,
  createDiaryStageTracker,
  diaryArgumentHasBookmarkKey,
  type DiaryDay,
} from "../../../../src/server/diary/core/diary-tool.ts"
import { type SessionEvent } from "../../../../src/shared/session-event.ts"

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

describe("createDiaryStageTracker", () => {
  const DIARY_TOOL_FULL_NAME = "mcp__tsukumo__diary"

  function blockStart(name: string, index: number, parentToolUseId: string | null = null) {
    return {
      type: "stream_event",
      parent_tool_use_id: parentToolUseId,
      event: {
        type: "content_block_start",
        index,
        content_block: { type: "tool_use", id: "toolu_d1", name, input: {} },
      },
    }
  }

  function delta(index: number, partialJson: string, parentToolUseId: string | null = null) {
    return {
      type: "stream_event",
      parent_tool_use_id: parentToolUseId,
      event: {
        type: "content_block_delta",
        index,
        delta: { type: "input_json_delta", partial_json: partialJson },
      },
    }
  }

  function stop(index: number, parentToolUseId: string | null = null) {
    return {
      type: "stream_event",
      parent_tool_use_id: parentToolUseId,
      event: { type: "content_block_stop", index },
    }
  }

  it("関係ないメッセージは undefined", () => {
    const tracker = createDiaryStageTracker(DIARY_TOOL_FULL_NAME)
    expect(tracker.observe({ type: "assistant" })).toBeUndefined()
    expect(tracker.observe("壊れた形")).toBeUndefined()
  })

  it("diary の塊が開いて bookmark が現れたら pick を1回だけ返す", () => {
    const tracker = createDiaryStageTracker(DIARY_TOOL_FULL_NAME)
    expect(tracker.observe(blockStart(DIARY_TOOL_FULL_NAME, 2))).toBeUndefined()
    expect(tracker.observe(delta(2, '{"body":"架空","expression":"proud"'))).toBeUndefined()
    expect(tracker.observe(delta(2, ',"bookmark":{"taskId":"T-1"'))).toBe("pick")
    // 同じ塊で二度とは返さない。
    expect(tracker.observe(delta(2, '"}}'))).toBeUndefined()
    expect(tracker.observe(stop(2))).toBeUndefined()
  })

  it("しおりの無い日は塊が閉じるまで pick を返さない", () => {
    const tracker = createDiaryStageTracker(DIARY_TOOL_FULL_NAME)
    tracker.observe(blockStart(DIARY_TOOL_FULL_NAME, 1))
    expect(tracker.observe(delta(1, '{"body":"架空","expression":"proud"}'))).toBeUndefined()
    expect(tracker.observe(stop(1))).toBeUndefined()
  })

  it("ほかのツールの塊は追いかけない", () => {
    const tracker = createDiaryStageTracker(DIARY_TOOL_FULL_NAME)
    tracker.observe(blockStart("Bash", 1))
    expect(tracker.observe(delta(1, '{"bookmark":{'))).toBeUndefined()
  })

  it("サブエージェントの中の diary の塊は追いかけない", () => {
    const tracker = createDiaryStageTracker(DIARY_TOOL_FULL_NAME)
    tracker.observe(blockStart(DIARY_TOOL_FULL_NAME, 1, "toolu_agent"))
    expect(tracker.observe(delta(1, '{"bookmark":{', "toolu_agent"))).toBeUndefined()
  })

  it("index が合わない断片は追いかけない", () => {
    const tracker = createDiaryStageTracker(DIARY_TOOL_FULL_NAME)
    tracker.observe(blockStart(DIARY_TOOL_FULL_NAME, 1))
    expect(tracker.observe(delta(2, '{"bookmark":{'))).toBeUndefined()
  })
})
