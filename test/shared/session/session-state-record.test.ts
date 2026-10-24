import { describe, expect, it } from "vitest"

import { mainViewEntries } from "../../../src/shared/session/main-view-entry.ts"
import { advanceSessionState } from "../../../src/shared/session/session-advance.ts"
import type { SessionEvent, StampedEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../src/shared/session/session-state.ts"
import { apply } from "../../fixture/session-state.ts"

describe("applySessionEvent（最近の話題）", () => {
  it("chat-topics-changed で丸ごと置き換わる（継ぎ足さない）", () => {
    const view = apply(
      { kind: "chat-topics-changed", topics: ["架空の古い話題"] },
      { kind: "chat-topics-changed", topics: ["架空の新しい話題", "架空の二番目の話題"] },
    )

    expect(view.chatTopics).toEqual(["架空の新しい話題", "架空の二番目の話題"])
  })
})

describe("applySessionEvent（覚えていること）", () => {
  it("remembered-lines-changed で丸ごと置き換わる（継ぎ足さない）", () => {
    const view = apply(
      { kind: "remembered-lines-changed", lines: ["架空の古い1行"] },
      { kind: "remembered-lines-changed", lines: ["架空の新しい1行", "架空の二番目の1行"] },
    )

    expect(view.rememberedLines).toEqual(["架空の新しい1行", "架空の二番目の1行"])
  })
})

describe("applySessionEvent（質問の記録）", () => {
  const singleQuestion = {
    header: "確認",
    text: "どちらの案で進める？",
    multiSelect: false,
    options: [
      { label: "案A", description: "架空の説明A", preview: undefined },
      { label: "案B", description: "架空の説明B", preview: undefined },
    ],
  }

  const multiQuestion = {
    header: "確認",
    text: "どれを試す？",
    multiSelect: true,
    options: [
      { label: "案A", description: "架空の説明A", preview: undefined },
      { label: "案B", description: "架空の説明B", preview: undefined },
      { label: "案C", description: "架空の説明C", preview: undefined },
    ],
  }

  function questionEntries(...events: readonly SessionEvent[]) {
    return mainViewEntries(apply(...events)).filter((entry) => entry.kind === "question")
  }

  it("質問に答えると、そのやり取りの記録に質問1件が残る", () => {
    const entries = questionEntries(
      { kind: "request", text: "架空の依頼", images: [] },
      {
        kind: "question-answered",
        toolUseId: "toolu_q",
        questions: [singleQuestion],
        answers: [["案B"]],
        briefed: [false],
        sentBack: 0,
      },
    )

    expect(entries).toEqual([
      { kind: "question", toolUseId: "toolu_q", questions: [singleQuestion], answers: [["案B"]] },
    ])
  })

  it("複数選択の答えは1つの文字列に畳まれず、選んだぶんだけ並ぶ", () => {
    const entries = questionEntries(
      { kind: "request", text: "架空の依頼", images: [] },
      {
        kind: "question-answered",
        toolUseId: "toolu_q",
        questions: [multiQuestion],
        answers: [["案A", "案C"]],
        briefed: [false],
        sentBack: 0,
      },
    )

    expect(entries).toEqual([
      {
        kind: "question",
        toolUseId: "toolu_q",
        questions: [multiQuestion],
        answers: [["案A", "案C"]],
      },
    ])
  })

  it("答えていない質問（pending-changed だけ）は記録に残らない", () => {
    const entries = questionEntries(
      { kind: "request", text: "架空の依頼", images: [] },
      {
        kind: "pending-changed",
        pending: [{ kind: "question", id: "toolu_q", questions: [singleQuestion], briefs: [] }],
      },
    )

    expect(entries).toEqual([])
  })

  it("記録は前のやり取りに残り、次の依頼で消えない", () => {
    const view = apply(
      { kind: "request", text: "架空の依頼1", images: [] },
      {
        kind: "question-answered",
        toolUseId: "toolu_q",
        questions: [singleQuestion],
        answers: [["案A"]],
        briefed: [false],
        sentBack: 0,
      },
      { kind: "request", text: "架空の依頼2", images: [] },
    )

    expect(mainViewEntries(view).map((entry) => entry.kind)).toEqual([
      "request",
      "question",
      "request",
    ])
  })
})

describe("applySessionEvent（見直し）", () => {
  const FINDINGS = {
    days: 7,
    headline: "架空の冒頭の一言。",
    proposals: [
      {
        kind: "tool-result",
        target: "ExampleTool",
        impact: "large",
        title: "架空の見出し",
        basis: "架空の根拠",
        action: "架空のやること",
        followUp: "task",
      },
    ],
  } as const

  /** 会話のターンが 100 で始まって進行中のところへ、見直しを 300 で始めて段を 500 で渡した姿。 */
  function running(): SessionState {
    const events: readonly StampedEvent[] = [
      { at: 100, event: { kind: "request", text: "架空の依頼", images: [] } },
      { at: 300, event: { kind: "usage-review-started" } },
      { at: 500, event: { kind: "usage-review-stage", stage: "cache", days: 7 } },
    ]
    return events.reduce<SessionState>(
      (state, { at, event }) => applySessionEvent(state, event, at),
      INITIAL_SESSION_STATE,
    )
  }

  it("見直しのイベントは見直しの欄だけを動かし、セッションの記録（records）とターンを動かさない", () => {
    const before = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "request", text: "架空の依頼", images: [] },
      100,
    )
    const events: readonly SessionEvent[] = [
      { kind: "usage-review-started" },
      { kind: "usage-review-stage", stage: "model", days: 7 },
      { kind: "usage-review-speech", text: "架空のセリフ" },
      { kind: "usage-review-result", findings: FINDINGS },
      { kind: "usage-review-ended" },
      { kind: "usage-proposal-run-started", key: "memory-file:~/.claude/CLAUDE.md" },
      {
        kind: "usage-proposal-run-ended",
        key: "memory-file:~/.claude/CLAUDE.md",
        outcome: "succeeded",
      },
      { kind: "usage-proposal-dismissed", key: "memory-file:~/.claude/CLAUDE.md" },
    ]
    const after = events.reduce((state, event) => applySessionEvent(state, event, 700), before)

    expect(running().usageReview).toEqual({
      kind: "running",
      startedAt: 300,
      progress: { kind: "stage", stage: "cache", days: 7 },
      speech: { kind: "none" },
    })
    expect(after.usageReview.kind).toBe("result")
    expect({
      ...after,
      usageReview: before.usageReview,
      previousUsageReview: before.previousUsageReview,
      usageProposalRun: before.usageProposalRun,
    }).toEqual(before)
  })

  it("見直し中に会話のターンが終わっても、セッションが終わっても、見直しは見直し中のまま", () => {
    const finished = applySessionEvent(
      running(),
      { kind: "turn-finished", outcome: { kind: "completed" } },
      800,
    )
    const ended = applySessionEvent(running(), { kind: "session-ended", reason: "架空" }, 800)

    expect(finished.usageReview).toEqual(running().usageReview)
    expect(ended.usageReview).toEqual(running().usageReview)
  })
})

describe("applySessionEvent（成果の日記書き）", () => {
  it("振り返りのイベントは diaryWriting だけを動かし、会話のターンが終わっても動かさない", () => {
    const before = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "speech", text: "架空のセリフ", expression: "proud" },
      50,
    )
    const requested = applySessionEvent(
      before,
      { kind: "diary-requested", date: "2026-09-23" },
      100,
    )
    const finished = applySessionEvent(
      requested,
      { kind: "turn-finished", outcome: { kind: "completed" } },
      500,
    )

    expect(requested.diaryWriting.kind).toBe("writing")
    expect({ ...requested, diaryWriting: before.diaryWriting }).toEqual(before)
    expect(finished.diaryWriting).toEqual(requested.diaryWriting)
  })
})

describe("applySessionEvent（API の不調と失敗）", () => {
  const REQUEST = { kind: "request", text: "架空の依頼", images: [] } satisfies SessionEvent
  const RETRY = {
    kind: "api-retry",
    retry: {
      attempt: 2,
      maxRetries: 10,
      retryDelayMs: 4000,
      errorStatus: 529,
      error: "overloaded",
    },
  } satisfies SessionEvent
  const FAILED_BY_API = {
    kind: "turn-finished",
    outcome: { kind: "failed", cause: { kind: "api-error" } },
  } satisfies SessionEvent

  it("api-retry で呼び直し中になり、届いた時刻を持つ", () => {
    const state = applySessionEvent(apply(REQUEST), RETRY, 1234)

    expect(state.apiTrouble).toEqual({ kind: "retrying", at: 1234, ...RETRY.retry })
  })

  it("モデルが何かを出したら（本文・ステップの使用量など）呼び直し中を下ろす", () => {
    const outputs = [
      { kind: "partial-utterance", text: "架空の書きかけ" },
      {
        kind: "step-usage",
        messageId: "msg_1",
        scope: "main",
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
      },
      {
        kind: "tool-started",
        toolUseId: "toolu_1",
        name: "Read",
        input: {},
        parentToolUseId: undefined,
      },
    ] satisfies SessionEvent[]

    for (const output of outputs) {
      expect(apply(REQUEST, RETRY, output).apiTrouble).toEqual({ kind: "none" })
    }
  })

  const STEP_USAGE = {
    kind: "step-usage",
    messageId: "msg_1",
    scope: "main",
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    },
  } satisfies SessionEvent

  it("呼び直し中でない姿に step-usage・token-usage を畳むと、同じ参照が返る", () => {
    const state = apply(REQUEST)

    expect(advanceSessionState(state, STEP_USAGE, 0)).toBe(state)
    expect(advanceSessionState(state, { kind: "token-usage", cumulative: [] }, 0)).toBe(state)
  })

  it("呼び直し中の姿に step-usage を畳むと、元の姿は変えずに none の新しい姿が返る", () => {
    const state = applySessionEvent(apply(REQUEST), RETRY, 10)
    const next = advanceSessionState(state, STEP_USAGE, 20)

    expect(next).not.toBe(state)
    expect(next.apiTrouble).toEqual({ kind: "none" })
    expect(state.apiTrouble.kind).toBe("retrying")
  })

  it("モデルの出力でないイベント（答え待ち・使用量の累計）では呼び直し中を下ろさない", () => {
    const state = apply(
      REQUEST,
      RETRY,
      { kind: "pending-changed", pending: [] },
      { kind: "token-usage", cumulative: [] },
    )

    expect(state.apiTrouble.kind).toBe("retrying")
  })

  it("API のエラーで失敗したターンは、届いたエラーの種類を理由にして記録の末尾に積む", () => {
    const state = applySessionEvent(
      apply(REQUEST, { kind: "api-error", error: "rate_limit" }),
      FAILED_BY_API,
      500,
    )

    const failure = { kind: "api-error", error: "rate_limit" } as const
    expect(state.records.at(-1)).toEqual({ kind: "turn-failure", failure })
    expect(state.turn).toEqual({
      kind: "finished",
      startedAt: 0,
      finishedAt: 500,
      ending: { kind: "failed", failure },
    })
    expect(state.apiTrouble).toEqual({ kind: "none" })
  })

  it("呼び直しを使い切って止まったときは、最後の呼び直しの種類を理由にする", () => {
    const state = apply(REQUEST, RETRY, FAILED_BY_API)

    expect(state.records.at(-1)).toEqual({
      kind: "turn-failure",
      failure: { kind: "api-error", error: "overloaded" },
    })
  })

  it("種類が1つも届かずに API のエラーで止まったら unknown にする", () => {
    expect(apply(REQUEST, FAILED_BY_API).records.at(-1)).toEqual({
      kind: "turn-failure",
      failure: { kind: "api-error", error: "unknown" },
    })
  })

  it("API のエラーのあとにモデルが続けて完了したターンは失敗にしない（立て直した）", () => {
    const state = apply(
      REQUEST,
      { kind: "api-error", error: "max_output_tokens" },
      { kind: "utterance", text: "架空の続きの本文" },
      { kind: "turn-finished", outcome: { kind: "completed" } },
    )

    expect(state.records.some((record) => record.kind === "turn-failure")).toBe(false)
    expect(state.turn).toMatchObject({ kind: "finished", ending: { kind: "ended" } })
  })

  it("中断は失敗にせず、記録も積まない", () => {
    const state = apply(REQUEST, { kind: "turn-finished", outcome: { kind: "interrupted" } })

    expect(state.records.some((record) => record.kind === "turn-failure")).toBe(false)
    expect(state.turn).toMatchObject({ kind: "finished", ending: { kind: "ended" } })
  })

  it("上限の失敗は理由をそのまま積む", () => {
    const state = apply(REQUEST, {
      kind: "turn-finished",
      outcome: { kind: "failed", cause: { kind: "max-turns" } },
    })

    expect(state.records.at(-1)).toEqual({ kind: "turn-failure", failure: { kind: "max-turns" } })
  })

  it("次の依頼で呼び直し中も前のターンの失敗の印も持ち越さない（記録は残る）", () => {
    const state = apply(REQUEST, RETRY, FAILED_BY_API, REQUEST, RETRY, REQUEST)

    expect(state.apiTrouble).toEqual({ kind: "none" })
    expect(state.turn).toEqual({ kind: "running", startedAt: 0 })
    expect(state.records.filter((record) => record.kind === "turn-failure")).toHaveLength(1)
  })

  it("rate-limit-changed で利用上限を丸ごと置き換え、ターンの境目では戻さない", () => {
    const rejected = { kind: "rejected", bucket: "five-hour", resetsAt: 1_800_000_000_000 } as const
    const state = apply({ kind: "rate-limit-changed", rateLimit: rejected }, REQUEST, {
      kind: "turn-finished",
      outcome: { kind: "completed" },
    })

    expect(state.rateLimit).toEqual(rejected)
    expect(
      applySessionEvent(state, { kind: "rate-limit-changed", rateLimit: { kind: "clear" } }, 0)
        .rateLimit,
    ).toEqual({ kind: "clear" })
  })
})

describe("設定の点の元（settingMarks）", () => {
  const RUNNING: SessionEvent = {
    kind: "session-info",
    sessionId: "s1",
    model: "claude-opus-5",
    permissionMode: "default",
    slashCommands: [],
    terminalSlashCommands: [],
    skillNames: [],
    agentNames: [],
  }

  it("running なら、3つの受け付けがそれぞれの印を accepted にする", () => {
    const state = apply(
      RUNNING,
      { kind: "model-changed", model: "sonnet" },
      { kind: "effort-changed", effort: "low" },
      { kind: "permission-mode-changed", mode: "plan" },
    )

    expect(state.settingMarks).toEqual({
      model: {
        kind: "accepted",
        value: "sonnet",
        at: 0,
        from: { kind: "known", value: "claude-opus-5" },
      },
      effort: { kind: "accepted", value: "low", at: 0, from: { kind: "unknown" } },
      permissionMode: {
        kind: "accepted",
        value: "plan",
        at: 0,
        from: { kind: "known", value: "default" },
      },
    })
  })

  it("見届ける前に切り替える前の値へ戻すと、印が消える（別の値への付け直しでは最初の値を覚えている）", () => {
    const reverted = apply(
      RUNNING,
      { kind: "permission-mode-changed", mode: "plan" },
      { kind: "permission-mode-changed", mode: "default" },
    )
    const viaOther = apply(
      RUNNING,
      {
        kind: "model-effort-support",
        models: [
          {
            model: "opus",
            resolvedModel: "claude-opus-5",
            supportsEffort: true,
            effortLevels: ["low"],
          },
        ],
      },
      { kind: "model-changed", model: "sonnet" },
      { kind: "model-changed", model: "haiku" },
      { kind: "model-changed", model: "opus" },
    )
    const stillAway = apply(
      RUNNING,
      { kind: "permission-mode-changed", mode: "plan" },
      { kind: "permission-mode-changed", mode: "auto" },
    )

    expect(reverted.settingMarks.permissionMode.kind).toBe("none")
    expect(viaOther.settingMarks.model.kind).toBe("none")
    expect(stillAway.settingMarks.permissionMode).toMatchObject({
      kind: "accepted",
      value: "auto",
      from: { kind: "known", value: "default" },
    })
  })

  it("切り替える前の値が分からないときは、戻しても印を消さない", () => {
    const state = apply(
      RUNNING,
      { kind: "effort-changed", effort: "low" },
      { kind: "effort-changed", effort: "high" },
    )

    expect(state.settingMarks.effort).toMatchObject({ kind: "accepted", value: "high" })
  })

  it("running になる前の受け付けは印を付けず、値だけ従来どおり更新する", () => {
    const state = apply(
      { kind: "model-changed", model: "sonnet" },
      { kind: "effort-changed", effort: "low" },
    )

    expect(state.settingMarks.model.kind).toBe("none")
    expect(state.settingMarks.effort.kind).toBe("none")
    expect(state.model).toBe("sonnet")
    expect(state.effort).toBe("low")
  })

  it("effort の見届けは、合わなくても state.effort を更新し、合えば confirmed にする", () => {
    const accepted = apply(
      RUNNING,
      { kind: "effort-changed", effort: "low" },
      { kind: "setting-confirmed", setting: "effort", value: "high" },
    )
    const confirmed = apply(
      RUNNING,
      { kind: "effort-changed", effort: "low" },
      { kind: "setting-confirmed", setting: "effort", value: "low" },
    )

    expect(accepted.settingMarks.effort.kind).toBe("accepted")
    expect(accepted.effort).toBe("high")
    expect(confirmed.settingMarks.effort.kind).toBe("confirmed")
    expect(confirmed.effort).toBe("low")
  })

  it("受け付けが無いときの見届け（init 由来など）は印を作らない", () => {
    const state = apply(RUNNING, {
      kind: "setting-confirmed",
      setting: "permissionMode",
      value: "default",
    })

    expect(state.settingMarks.permissionMode.kind).toBe("none")
  })

  it("見届ける前の次の受け付けは新しい値で付け直し、confirmed のあとの受け付けも accepted になる", () => {
    const reaccepted = apply(
      RUNNING,
      { kind: "permission-mode-changed", mode: "plan" },
      { kind: "permission-mode-changed", mode: "acceptEdits" },
    )
    const afterConfirmed = apply(
      RUNNING,
      { kind: "permission-mode-changed", mode: "plan" },
      { kind: "setting-confirmed", setting: "permissionMode", value: "plan" },
      { kind: "permission-mode-changed", mode: "auto" },
    )

    expect(reaccepted.settingMarks.permissionMode).toMatchObject({
      kind: "accepted",
      value: "acceptEdits",
    })
    expect(afterConfirmed.settingMarks.permissionMode).toMatchObject({
      kind: "accepted",
      value: "auto",
    })
  })

  it("許可モードの見届けは完全一致のときだけ confirmed にする", () => {
    const state = apply(
      RUNNING,
      { kind: "permission-mode-changed", mode: "auto" },
      { kind: "setting-confirmed", setting: "permissionMode", value: "plan" },
    )

    expect(state.settingMarks.permissionMode.kind).toBe("accepted")
  })
})
