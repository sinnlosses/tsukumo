import { describe, expect, it } from "bun:test"

import { createDiaryStreamObserver } from "../../../../src/server/diary/adapter/sdk-diary.ts"

// `queryDiary` 自体（本物の `query()` を起こす部分）は claude を子プロセスで起こすので、ここでは
// テストしない（`docs/requirements.md` 4.6・訪問の台本の `sdk-visit-script.ts` と同じ扱い）。
// ここで確かめるのは、`includePartialMessages` の断片を3段の合図に変える純粋な観測だけ。
// メッセージはすべて手で書いた架空の形（docs/coding-standards.md「会話内容の扱い」）。

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

describe("createDiaryStreamObserver", () => {
  it("関係ないメッセージは空の並び", () => {
    const observer = createDiaryStreamObserver()
    expect(observer.observe({ type: "assistant" })).toEqual([])
    expect(observer.observe("壊れた形")).toEqual([])
  })

  it("diary の塊が開いたら diary-drafting を1回だけ返す", () => {
    const observer = createDiaryStreamObserver()
    expect(observer.observe(blockStart(DIARY_TOOL_FULL_NAME, 2))).toEqual([
      { kind: "diary-drafting", toolUseId: "toolu_d1" },
    ])
  })

  it("bookmark が現れたら diary-stage pick を1回だけ返す", () => {
    const observer = createDiaryStreamObserver()
    observer.observe(blockStart(DIARY_TOOL_FULL_NAME, 2))
    expect(observer.observe(delta(2, '{"body":"架空","expression":"proud"'))).toEqual([])
    expect(observer.observe(delta(2, ',"bookmark":{"taskId":"T-1"'))).toEqual([
      { kind: "diary-stage", stage: "pick" },
    ])
    // 同じ塊で二度とは返さない。
    expect(observer.observe(delta(2, '"}}'))).toEqual([])
    expect(observer.observe(stop(2))).toEqual([])
  })

  it("しおりの無い日は塊が閉じるまで pick を返さない", () => {
    const observer = createDiaryStreamObserver()
    observer.observe(blockStart(DIARY_TOOL_FULL_NAME, 1))
    expect(observer.observe(delta(1, '{"body":"架空","expression":"proud"}'))).toEqual([])
    expect(observer.observe(stop(1))).toEqual([])
  })

  it("ほかのツールの塊は追いかけない", () => {
    const observer = createDiaryStreamObserver()
    observer.observe(blockStart("Bash", 1))
    expect(observer.observe(delta(1, '{"bookmark":{'))).toEqual([])
  })

  it("サブエージェントの中の diary の塊は追いかけない", () => {
    const observer = createDiaryStreamObserver()
    observer.observe(blockStart(DIARY_TOOL_FULL_NAME, 1, "toolu_agent"))
    expect(observer.observe(delta(1, '{"bookmark":{', "toolu_agent"))).toEqual([])
  })

  it("index が合わない断片は追いかけない", () => {
    const observer = createDiaryStreamObserver()
    observer.observe(blockStart(DIARY_TOOL_FULL_NAME, 1))
    expect(observer.observe(delta(2, '{"bookmark":{'))).toEqual([])
  })
})
