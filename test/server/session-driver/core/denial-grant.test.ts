import { describe, expect, it } from "vitest"

import {
  createDenialGrants,
  type DeniedCall,
  isDenialNoticePrompt,
} from "../../../../src/server/session-driver/core/denial-grant.ts"
import { createPendingAnswerQueue } from "../../../../src/server/session-driver/core/pending-answer.ts"
import type { PendingAsk } from "../../../../src/shared/session-driver/pending-ask.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"

const DENIED_INPUT = { file_path: "/tmp/tsukumo-test/outside.txt", content: "架空の中身" }

function deniedCall(overrides: Partial<DeniedCall> = {}): DeniedCall {
  return {
    toolUseId: "toolu_denied",
    toolName: "Write",
    input: DENIED_INPUT,
    reason: "Classifier unavailable",
    ...overrides,
  }
}

/** 拒否と印、`canUseTool` の側の列をつないだもの（駆動と同じつなぎ方）。 */
function setup() {
  const events: SessionEvent[] = []
  const notices: string[] = []
  const asked: (readonly PendingAsk[])[] = []
  const grants = createDenialGrants({
    onEvent: (event) => events.push(event),
    sendNotice: (text) => {
      notices.push(text)
      return `notice-${String(notices.length)}`
    },
  })
  const queue = createPendingAnswerQueue({
    granted: grants.takeArmed,
    onChange: (pending) => asked.push(pending),
    onAnswered: () => {},
  })
  /** PreToolUse の照合を通してから `canUseTool` へ回す（`ask` を返したときだけ `canUseTool` が呼ばれる）。 */
  const call = (id: string, input: Readonly<Record<string, unknown>>) => ({
    review: grants.review("Write", [input], id),
    result: queue.ask({ id, toolName: "Write", input }),
  })
  return { events, notices, asked, grants, queue, call }
}

describe("createDenialGrants", () => {
  it("拒否はツール名・理由・id だけをイベントに載せ、入力を載せない", () => {
    const { events, grants } = setup()

    grants.deny(deniedCall())

    expect(events).toEqual([
      {
        kind: "permission-denied",
        denial: {
          toolUseId: "toolu_denied",
          toolName: "Write",
          reason: "Classifier unavailable",
        },
      },
    ])
    expect(JSON.stringify(events)).not.toContain("架空の中身")
  })

  it("サブエージェントの中の拒否はお願いに積まず、主の拒否だけを積む", () => {
    const { events, grants } = setup()

    grants.deny(deniedCall({ toolUseId: "toolu_sub", input: { n: 1 }, agentId: "agent-1" }))
    grants.deny(deniedCall({ toolUseId: "toolu_main", input: { n: 2 } }))

    expect(
      events.map((event) => event.kind === "permission-denied" && event.denial.toolUseId),
    ).toEqual(["toolu_main"])
  })

  it("一度だけ許可すると、同じ入力の次の1回だけを利用者に聞かずに許可し、2回目は列に積む", async () => {
    const { grants, notices, asked, call } = setup()
    grants.deny(deniedCall())

    expect(grants.answer("toolu_denied", { kind: "allow" })).toBe(true)
    expect(notices).toHaveLength(1)
    expect(isDenialNoticePrompt(notices[0] ?? "")).toBe(true)
    expect(notices[0]).toContain("Write")
    expect(notices[0]).not.toContain("架空の中身")

    const first = call("toolu_retry_1", { ...DENIED_INPUT })
    expect(first.review).toBe("ask")
    await expect(first.result).resolves.toEqual({
      behavior: "allow",
      updatedInput: DENIED_INPUT,
    })
    expect(asked).toEqual([])

    const second = call("toolu_retry_2", { ...DENIED_INPUT })
    expect(second.review).toBe("pass")
    expect(asked.at(-1)?.map((ask) => ask.id)).toEqual(["toolu_retry_2"])
  })

  it("一度だけの許可は入力が違う呼び出しには効かない", () => {
    const { grants, asked, call } = setup()
    grants.deny(deniedCall())
    grants.answer("toolu_denied", { kind: "allow" })

    const other = call("toolu_other", { ...DENIED_INPUT, content: "別の架空の中身" })

    expect(other.review).toBe("pass")
    expect(asked.at(-1)?.map((ask) => ask.id)).toEqual(["toolu_other"])
  })

  it("入力のキーの並びが違っても同じ入力として照らす", () => {
    const { grants } = setup()
    grants.deny(deniedCall())
    grants.answer("toolu_denied", { kind: "allow" })

    expect(
      grants.review("Write", [{ content: "架空の中身", file_path: DENIED_INPUT.file_path }], "t-2"),
    ).toBe("ask")
  })

  it("候補の入力のどれかが印と一致すれば当たる（Bash の書き換えの前と後）", () => {
    const { grants } = setup()
    const rewritten = { command: "rtk git status" }
    grants.deny(deniedCall({ toolName: "Bash", input: rewritten }))
    grants.answer("toolu_denied", { kind: "allow" })

    expect(grants.review("Bash", [{ command: "git status" }, rewritten], "t-2")).toBe("ask")
    expect(grants.takeArmed("t-2")).toBe(true)
  })

  it("断ると印を立てず、断ったことだけを知らせる", () => {
    const { grants, notices, events } = setup()
    grants.deny(deniedCall())

    expect(grants.answer("toolu_denied", { kind: "deny" })).toBe(true)

    expect(events.at(-1)).toEqual({ kind: "permission-denial-settled", toolUseId: "toolu_denied" })
    expect(notices[0]).toContain("許可しなかった")
    expect(grants.review("Write", [DENIED_INPUT], "t-2")).toBe("pass")
  })

  it("知らない id と、質問の答えの形には答えない", () => {
    const { grants } = setup()
    grants.deny(deniedCall())

    expect(grants.answer("toolu_unknown", { kind: "allow" })).toBe(false)
    expect(grants.answer("toolu_denied", { kind: "answers", answers: [] })).toBe(false)
  })

  it("許可の知らせを受け取ったターンが終わったら、使われなかった印を捨てる", () => {
    const { grants } = setup()
    grants.deny(deniedCall())
    grants.answer("toolu_denied", { kind: "allow" })

    grants.finishTurn(["notice-0"])
    expect(grants.review("Write", [DENIED_INPUT], "t-2")).toBe("ask")

    grants.deny(deniedCall({ toolUseId: "toolu_denied_again" }))
    grants.answer("toolu_denied_again", { kind: "allow" })
    grants.finishTurn(["notice-2"])
    expect(grants.review("Write", [DENIED_INPUT], "t-3")).toBe("pass")
  })

  it("許可より先に同じ呼び出しが打ち直されたら、答えていない拒否を下げる", () => {
    const { grants, events } = setup()
    grants.deny(deniedCall())

    expect(grants.review("Write", [DENIED_INPUT], "toolu_retry")).toBe("pass")

    expect(events.at(-1)).toEqual({ kind: "permission-denial-settled", toolUseId: "toolu_denied" })
    expect(grants.answer("toolu_denied", { kind: "allow" })).toBe(false)
  })

  it("同じ呼び出しがまた拒否されたら、前の拒否を下げて新しい拒否だけを残す", () => {
    const { grants, events } = setup()
    grants.deny(deniedCall())
    grants.deny(deniedCall({ toolUseId: "toolu_denied_again" }))

    expect(events.map((event) => event.kind)).toEqual([
      "permission-denied",
      "permission-denial-settled",
      "permission-denied",
    ])
  })
})
