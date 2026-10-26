import { describe, expect, it } from "vitest"

import { createSpeechReview } from "../../../../src/server/session-driver/core/speech-review.ts"
import {
  createTokenUsageRecorder,
  type TokenUsageEntry,
} from "../../../../src/server/token-usage/core/token-usage.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import type {
  ModelTokenUsage,
  TurnUsageScope,
} from "../../../../src/shared/token-usage/token-usage.ts"
import { requestEvent } from "../../../fixture/session-event.ts"

function usage(model: string, input: number, output: number, cost: number): ModelTokenUsage {
  return {
    model,
    inputTokens: input,
    outputTokens: output,
    thinkingTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    costUsd: cost,
  }
}

/** 前の `result` の累計のあとに今の累計を渡し、今の累計で記録へ渡ったモデルの並びを返す（行が渡らなければ空）。 */
function deltaOf(
  previous: readonly ModelTokenUsage[],
  current: readonly ModelTokenUsage[],
): readonly ModelTokenUsage[] {
  const written: TokenUsageEntry[] = []
  const recorder = createTokenUsageRecorder({
    append: (entry) => {
      written.push(entry)
    },
    prefetchOpenTask: () => {},
    readRange: () => [],
  })
  recorder.append(previous, 0, STARTED_STATE)
  const writtenBefore = written.length
  recorder.append(current, 1, STARTED_STATE)
  return written.slice(writtenBefore).flatMap((entry) => entry.models)
}

describe("createTokenUsageRecorder の増分", () => {
  it("累計から前回ぶんを引いた増分を返す", () => {
    const previous = [usage("opus", 100, 20, 0.5)]
    const current = [usage("opus", 260, 35, 1.25)]

    expect(deltaOf(previous, current)).toEqual([usage("opus", 160, 15, 0.75)])
  })

  it("累計が振り出しに戻ったターンは負を書かず、いまの累計をそのまま増分にする", () => {
    const previous = [usage("opus", 900, 300, 4)]
    const current = [usage("opus", 120, 40, 0.6)]

    expect(deltaOf(previous, current)).toEqual([usage("opus", 120, 40, 0.6)])
  })

  it("増えていないモデルは並びに出さない（0だけの行を作らない）", () => {
    const previous = [usage("opus", 100, 20, 0.5), usage("haiku", 10, 2, 0.01)]
    const current = [usage("opus", 100, 20, 0.5), usage("haiku", 30, 5, 0.02)]

    expect(deltaOf(previous, current)).toEqual([usage("haiku", 20, 3, 0.01)])
  })

  it("途中で増えたモデル（サブエージェント）は全量が増分になる", () => {
    const previous = [usage("opus", 100, 20, 0.5)]
    const current = [usage("opus", 150, 25, 0.7), usage("sonnet", 40, 8, 0.03)]

    expect(deltaOf(previous, current)).toEqual([
      usage("opus", 50, 5, 0.2),
      usage("sonnet", 40, 8, 0.03),
    ])
  })

  it("1つの数だけが減ったときも、そのモデルは振り出しに戻ったものとして扱う", () => {
    const previous = [usage("opus", 100, 500, 2)]
    const current = [usage("opus", 300, 40, 0.9)]

    expect(deltaOf(previous, current)).toEqual([usage("opus", 300, 40, 0.9)])
  })

  it("累計から消えたモデルは増分に出ない", () => {
    const previous = [usage("opus", 100, 20, 0.5), usage("sonnet", 40, 8, 0.03)]

    expect(deltaOf(previous, [usage("opus", 110, 22, 0.55)])).toEqual([usage("opus", 10, 2, 0.05)])
  })
})

// ここから下はターンの中の内訳。イベントには会話の文面が乗るが、畳んだ結果には長さしか
// 残らないことを固定する（docs/coding-standards.md「会話内容の扱い」）。フィクスチャの文面は
// すべて手で書いた架空のもの。
function toolStarted(toolUseId: string, name: string, parentToolUseId?: string): SessionEvent {
  return {
    kind: "tool-started",
    toolUseId,
    name,
    input: { 架空の引数: "架空の値" },
    parentToolUseId,
  }
}

function toolFinished(toolUseId: string, content: string): SessionEvent {
  return { kind: "tool-finished", toolUseId, content, isError: false }
}

function stepUsage(
  messageId: string,
  scope: TurnUsageScope,
  input: number,
  output: number,
): SessionEvent {
  return {
    kind: "step-usage",
    messageId,
    scope,
    usage: {
      inputTokens: input,
      outputTokens: output,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    },
  }
}

const STARTED_STATE = applySessionEvent(
  INITIAL_SESSION_STATE,
  {
    kind: "session-info",
    sessionId: "架空のセッション",
    model: undefined,
    permissionMode: undefined,
    slashCommands: [],
    terminalSlashCommands: [],
    skillNames: [],
    agentNames: [],
  },
  0,
)

/** 1ターンぶんのイベントを積んでから、そのターンの消費を記録へ1行渡し、渡った行を返す。 */
function writtenRowOf(events: readonly SessionEvent[]): TokenUsageEntry {
  const written: TokenUsageEntry[] = []
  const recorder = createTokenUsageRecorder({
    append: (entry) => {
      written.push(entry)
    },
    prefetchOpenTask: () => {},
    readRange: () => [],
  })
  for (const event of events) {
    recorder.tally(event)
  }
  recorder.append([usage("opus", 1, 1, 0.01)], 0, STARTED_STATE)
  const [row] = written
  if (row === undefined) {
    throw new Error("記録へ1行も渡っていない")
  }
  return row
}

describe("createTokenUsageRecorder の内訳", () => {
  it("同じ名前のツールを1つに畳み、呼び出し回数と結果の長さの合計を数える", () => {
    const { breakdown } = writtenRowOf([
      toolStarted("t-1", "Bash"),
      toolFinished("t-1", "12345"),
      toolStarted("t-2", "Bash"),
      toolFinished("t-2", "123"),
      toolStarted("t-3", "Read"),
      toolFinished("t-3", "1"),
    ])

    expect(breakdown.main.tools).toEqual([
      { name: "Bash", calls: 2, resultBytes: 8 },
      { name: "Read", calls: 1, resultBytes: 1 },
    ])
    expect(breakdown.subagent.tools).toEqual([])
  })

  it("結果の長さは UTF-8 のバイト数で数える（文字数ではない）", () => {
    const { breakdown } = writtenRowOf([toolStarted("t-1", "Read"), toolFinished("t-1", "あいう")])

    expect(breakdown.main.tools).toEqual([{ name: "Read", calls: 1, resultBytes: 9 }])
  })

  it("結果の長さの大きい順に並べる（同じなら名前順）", () => {
    const { breakdown } = writtenRowOf([
      toolStarted("t-1", "Read"),
      toolFinished("t-1", "1"),
      toolStarted("t-2", "Bash"),
      toolFinished("t-2", "123456"),
      toolStarted("t-3", "Edit"),
      toolFinished("t-3", "1"),
    ])

    expect(breakdown.main.tools.map((tool) => tool.name)).toEqual(["Bash", "Edit", "Read"])
  })

  it("結果が返らなかった呼び出しも回数には数える（長さは 0）", () => {
    const { breakdown } = writtenRowOf([toolStarted("t-1", "Bash")])

    expect(breakdown.main.tools).toEqual([{ name: "Bash", calls: 1, resultBytes: 0 }])
  })

  it("サブエージェントの中のツールは別立てで数える（メインに混ぜない）", () => {
    const { breakdown } = writtenRowOf([
      toolStarted("t-1", "Agent"),
      toolStarted("t-2", "Grep", "t-1"),
      toolFinished("t-2", "1234"),
      toolStarted("t-3", "Read", "t-1"),
      toolFinished("t-3", "12"),
      toolFinished("t-1", "123456"),
    ])

    expect(breakdown.main.tools).toEqual([{ name: "Agent", calls: 1, resultBytes: 6 }])
    expect(breakdown.subagent.tools).toEqual([
      { name: "Grep", calls: 1, resultBytes: 4 },
      { name: "Read", calls: 1, resultBytes: 2 },
    ])
  })

  // 同じ `message.id` の `assistant` が何度も届く（返答が流れている間。最初の1つは
  // `output_tokens` が 1〜3 になる）ので、最後に届いたものだけを数える。
  it("同じ message.id のステップは最後の usage だけを数える", () => {
    const { breakdown } = writtenRowOf([
      stepUsage("msg-1", "main", 43_145, 1),
      stepUsage("msg-1", "main", 43_145, 791),
      stepUsage("msg-1", "main", 43_145, 13_371),
    ])

    expect(breakdown.main.steps).toBe(1)
    expect(breakdown.main.tokens.outputTokens).toBe(13_371)
    expect(breakdown.main.tokens.inputTokens).toBe(43_145)
  })

  it("持ち場ごとにステップ数と usage を足す", () => {
    const { breakdown } = writtenRowOf([
      stepUsage("msg-1", "main", 100, 20),
      stepUsage("msg-2", "main", 150, 30),
      stepUsage("msg-3", "subagent", 55_431, 400),
    ])

    expect(breakdown.main.steps).toBe(2)
    expect(breakdown.main.tokens.inputTokens).toBe(250)
    expect(breakdown.main.tokens.outputTokens).toBe(50)
    expect(breakdown.subagent.steps).toBe(1)
    expect(breakdown.subagent.tokens.inputTokens).toBe(55_431)
  })

  it("本文・セリフ・依頼の文面は内訳に積まない（ツールの呼び出しと usage だけを見る）", () => {
    const { breakdown } = writtenRowOf([
      requestEvent("架空の依頼の文面"),
      { kind: "utterance", text: "架空の本文" },
      { kind: "speech", text: "架空のセリフ", expression: "default" },
      { kind: "turn-finished", outcome: { kind: "completed" } },
    ])

    expect(breakdown.main.tools).toEqual([])
    expect(breakdown.main.steps).toBe(0)
    expect(breakdown.subagent.tools).toEqual([])
    expect(breakdown.subagent.steps).toBe(0)
  })

  // この検査がいちばん重要（docs/coding-standards.md「会話内容の扱い」）。記録へ渡る行に、
  // ツールの引数と結果の文面が1文字も残らない。
  it("ツールの引数と結果の文面は、記録へ渡る行に残らない", () => {
    const secrets = ["架空のツールの引数", "架空のツールの結果", "架空の値"]
    const row = writtenRowOf([
      toolStarted("t-1", "Bash"),
      toolFinished("t-1", `${secrets[1] ?? ""}${secrets[0] ?? ""}`),
    ])

    const written = JSON.stringify(row)
    for (const secret of secrets) {
      expect(written).not.toContain(secret)
    }
    // 長さだけは残る（54 バイト = 架空の文面2つ・18文字ぶんの UTF-8 バイト数）。
    expect(row.breakdown.main.tools).toEqual([{ name: "Bash", calls: 1, resultBytes: 54 }])
  })
})

describe("createTokenUsageRecorder の進みの差し込みの印", () => {
  const nudged: SessionEvent = { kind: "progress-nudged" }
  const speech: SessionEvent = { kind: "speech", text: "架空のセリフ", expression: "default" }
  const mainSpeakCalled: SessionEvent = { kind: "speak-called", toolUseId: "s-1", speech }
  const mainSpeakFinished = toolFinished("s-1", "ok")
  const mainSpeakRejected: SessionEvent = {
    kind: "tool-finished",
    toolUseId: "s-1",
    content: "差し戻し",
    isError: true,
  }
  const turnFinished: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }

  /** 本番と同じく、駆動が出したイベントを `SpeechReview.pass` に通した並びを記録に渡す。 */
  function markOf(driven: readonly SessionEvent[]): "spoke" | "silent" | undefined {
    const review = createSpeechReview({ hasNews: () => true, markDrawn: () => {} })
    return writtenRowOf(driven.flatMap(review.pass)).progressNudge
  }

  it.each([
    ["差し込みも speak も無いターン", [], undefined],
    [
      "差し込みの前に描かれたメインの speak",
      [mainSpeakCalled, mainSpeakFinished, nudged],
      "silent",
    ],
    ["差し込みの無いターンのメインの speak", [mainSpeakCalled, mainSpeakFinished], undefined],
    [
      "差し込み後にメインの speak が描かれた",
      [nudged, mainSpeakCalled, mainSpeakFinished],
      "spoke",
    ],
    ["差し込み後に speak が出なかった", [nudged], "silent"],
    ["差し込み後に委譲先の speech だけが来た", [nudged, speech], "silent"],
    [
      "差し込み後のメインの speak が差し戻された",
      [nudged, mainSpeakCalled, mainSpeakRejected],
      "silent",
    ],
    [
      "差し込み後のメインの speak が結果の無いままターンが終わった（預かりの speak は描かれる）",
      [nudged, mainSpeakCalled, turnFinished],
      "spoke",
    ],
  ] satisfies readonly [string, readonly SessionEvent[], "spoke" | "silent" | undefined][])(
    "%s: 印は %s",
    (_name, driven, expected) => {
      expect(markOf(driven)).toBe(expected)
    },
  )

  it("印はターンの終わりに捨て、次のターンへ持ち越さない", () => {
    const written: TokenUsageEntry[] = []
    const recorder = createTokenUsageRecorder({
      append: (entry) => {
        written.push(entry)
      },
      prefetchOpenTask: () => {},
      readRange: () => [],
    })
    recorder.tally(nudged)
    recorder.append([usage("opus", 1, 1, 0.01)], 0, STARTED_STATE)
    recorder.finishTurn()
    recorder.append([usage("opus", 2, 2, 0.02)], 1, STARTED_STATE)

    expect(written.map((entry) => entry.progressNudge)).toEqual(["silent", undefined])
  })
})
