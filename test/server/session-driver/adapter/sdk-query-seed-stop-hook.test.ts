import type { HookCallbackMatcher, HookEvent, StopHookInput } from "@anthropic-ai/claude-agent-sdk"
import { describe, expect, it } from "vitest"

import {
  createReportGate,
  REPORT_GATE_REASON,
} from "../../../../src/server/report/core/report-tool.ts"
import { stopHooks } from "../../../../src/server/session-driver/adapter/sdk-query-seed.ts"
import type {
  ChatSummary,
  SessionMode,
} from "../../../../src/server/session-driver/core/session-driver.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { fixedChatSummary } from "../../../fixture/chat.ts"
import { WORK_MODE } from "../../../fixture/sdk-tool.ts"

/**
 * 雑談モードの `SessionMode`（テスト用）。どの口も何もしない。
 */
function chatMode(chatSummary: ChatSummary): SessionMode {
  return {
    kind: "chat",
    personaMemory: { remember: () => "written", forget: () => "erased", finishTurn: () => {} },
    chatSummary,
    chatRecall: {
      recallList: () => ({ kind: "not-found" }),
      recallEpisode: () => ({ kind: "not-found" }),
      finishTurn: () => {},
    },
  }
}

/** `Stop` フックの入力（テスト用）。`last_assistant_message` は関所が見ないので載せない。 */
function stopInput(stopHookActive: boolean, effortLevel?: string): StopHookInput {
  return {
    session_id: "s-1",
    transcript_path: "/tmp/tsukumo-test/fake.jsonl",
    cwd: "/tmp/tsukumo-test",
    hook_event_name: "Stop",
    stop_hook_active: stopHookActive,
    ...(effortLevel === undefined ? {} : { effort: { level: effortLevel } }),
  }
}

/** 登録された `Stop` フックを1回呼び、戻り値を返す。 */
async function runStop(
  hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> | undefined,
  stopHookActive: boolean,
  effortLevel?: string,
): Promise<unknown> {
  const callback = hooks?.Stop?.[0]?.hooks[0]
  expect(callback).toBeDefined()
  return callback?.(stopInput(stopHookActive, effortLevel), undefined, {
    signal: new AbortController().signal,
  })
}

describe("stopHooks（report の関所と effort の読み取り）", () => {
  const LONG_BODY: SessionEvent = { kind: "utterance", text: "架空の本文の1行目\n架空の2行目" }

  it("仕事でも雑談でも Stop だけを登録し、SubagentStop には載せない", () => {
    expect(
      Object.keys(
        stopHooks(
          WORK_MODE,
          createReportGate(() => false),
          () => {},
        ),
      ),
    ).toEqual(["Stop"])
    expect(
      Object.keys(
        stopHooks(
          chatMode(fixedChatSummary(undefined)),
          createReportGate(() => false),
          () => {},
        ),
      ),
    ).toEqual(["Stop"])
  })

  it("1行を超える本文で止まろうとしたら、固定の理由文で block を返す（仕事のときだけ）", async () => {
    const gate = createReportGate(() => false)
    gate.observe(LONG_BODY)

    expect(
      await runStop(
        stopHooks(WORK_MODE, gate, () => {}),
        false,
      ),
    ).toEqual({
      decision: "block",
      reason: REPORT_GATE_REASON,
    })
  })

  it("1行以内なら何も返さない（止まってよい）", async () => {
    const gate = createReportGate(() => false)
    gate.observe({ kind: "utterance", text: "完了" })

    expect(
      await runStop(
        stopHooks(WORK_MODE, gate, () => {}),
        false,
      ),
    ).toEqual({})
  })

  it("stop_hook_active のときは長い本文でも block しない", async () => {
    const gate = createReportGate(() => false)
    gate.observe(LONG_BODY)

    expect(
      await runStop(
        stopHooks(WORK_MODE, gate, () => {}),
        true,
      ),
    ).toEqual({})
  })

  it("雑談のときは長い本文でも block しない（関所は仕事だけ）", async () => {
    const gate = createReportGate(() => false)
    gate.observe(LONG_BODY)

    expect(
      await runStop(
        stopHooks(chatMode(fixedChatSummary(undefined)), gate, () => {}),
        false,
      ),
    ).toEqual({})
  })

  it("effort.level が読めたら setting-confirmed（effort）を流す（仕事でも雑談でも）", async () => {
    const workEvents: SessionEvent[] = []
    await runStop(
      stopHooks(
        WORK_MODE,
        createReportGate(() => false),
        (event) => workEvents.push(event),
      ),
      false,
      "high",
    )
    expect(workEvents).toEqual([{ kind: "setting-confirmed", setting: "effort", value: "high" }])

    const chatEvents: SessionEvent[] = []
    await runStop(
      stopHooks(
        chatMode(fixedChatSummary(undefined)),
        createReportGate(() => false),
        (event) => chatEvents.push(event),
      ),
      false,
      "low",
    )
    expect(chatEvents).toEqual([{ kind: "setting-confirmed", setting: "effort", value: "low" }])
  })

  it("effort が無い・知らない段のときは setting-confirmed を流さない", async () => {
    const withoutEffort: SessionEvent[] = []
    await runStop(
      stopHooks(
        WORK_MODE,
        createReportGate(() => false),
        (event) => withoutEffort.push(event),
      ),
      false,
    )
    expect(withoutEffort).toEqual([])

    const unknownLevel: SessionEvent[] = []
    await runStop(
      stopHooks(
        WORK_MODE,
        createReportGate(() => false),
        (event) => unknownLevel.push(event),
      ),
      false,
      "未来の段",
    )
    expect(unknownLevel).toEqual([])
  })
})
