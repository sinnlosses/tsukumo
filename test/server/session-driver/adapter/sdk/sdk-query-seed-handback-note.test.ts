import { describe, expect, it } from "vitest"

import {
  handbackNoteHooks,
  presentSceneKeeperOf,
} from "../../../../../src/server/session-driver/adapter/sdk/sdk-handback-note-hook.ts"
import {
  type CallReview,
  createCallReview,
} from "../../../../../src/server/session-driver/core/call-review.ts"
import type { PresentSceneSource } from "../../../../../src/server/session-driver/core/present-scene-keeper.ts"
import type { SessionMode } from "../../../../../src/server/session-driver/core/session-driver.ts"
import { PHASE_RESULT_MISSING_HANDBACK_LINE } from "../../../../../src/server/work-plan/core/band-position.ts"
import { CHAT_MODE, WORK_MODE } from "../../../../fixture/sdk-tool.ts"
import { requestEvent } from "../../../../fixture/session-event.ts"
import { checkedToolUseId } from "../../../../fixture/tool-use-id.ts"

const HANDBACK_PROMPT =
  '<agent-message from="架空の委譲先">\n[架空の前置き]\n  段 1/2 | 架空の返却。'

async function runUserPromptSubmit(
  review: CallReview,
  prompt: string,
  agentId?: string,
  reportHeadMismatch: () => void = () => {},
  takePresentScene: () => Promise<string> = () => Promise.resolve(""),
): Promise<unknown> {
  const callback = handbackNoteHooks(review, reportHeadMismatch, takePresentScene)
    .UserPromptSubmit?.[0]?.hooks[0]
  expect(callback).toBeDefined()
  return callback?.(
    {
      session_id: "s-1",
      transcript_path: "/tmp/tsukumo-test/fake.jsonl",
      cwd: "/tmp/tsukumo-test",
      hook_event_name: "UserPromptSubmit",
      prompt,
      ...(agentId === undefined ? {} : { agent_id: agentId }),
    },
    undefined,
    { signal: new AbortController().signal },
  )
}

function plannedReview(): CallReview {
  const review = createCallReview()
  review.pass(requestEvent())
  review.judgeWorkPlan({
    phases: ["架空の計画", "架空の実装A", "架空の実装B", "架空の受け入れ"],
    current: 1,
    phaseSummary: "架空のまとめ。",
    delegatedRange: { first: 1, count: 2 },
  })
  return review
}

function startedReview(): CallReview {
  const review = plannedReview()
  review.pass({ kind: "delegate-handed-back", delegate: checkedToolUseId("toolu_delegate") })
  return review
}

describe("handbackNoteHooks（返却を運ぶ入力に注記を添える）", () => {
  it("メインの返却の入力に、済んだ帯の段と帯の位置の注記を additionalContext で1回だけ添える", async () => {
    const review = startedReview()

    expect(await runUserPromptSubmit(review, HANDBACK_PROMPT)).toEqual({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext:
          `tsukumo の注記（委譲先の返却の本文ではない）:${PHASE_RESULT_MISSING_HANDBACK_LINE}` +
          "プログレスバーの今のフェーズは 本 1/2 架空の実装A。プログレスバーは範囲の前（前）・範囲（本）・範囲の後ろ（後）の群ごとに1から数え、本の番号は委譲先のフェーズの番号と同じ。セリフで番号を言うのは本だけで、前・後は名前で言う。",
      },
    })
    expect(await runUserPromptSubmit(review, HANDBACK_PROMPT)).toEqual({})
  })

  it("返却でない入力とサブエージェントの中の入力では何も返さず、注記を取り出さない", async () => {
    const review = startedReview()

    expect(await runUserPromptSubmit(review, "架空の依頼")).toEqual({})
    expect(await runUserPromptSubmit(review, HANDBACK_PROMPT, "agent-1")).toEqual({})
    expect(review.takeHandbackNote()).toContain(PHASE_RESULT_MISSING_HANDBACK_LINE)
  })

  it("注記が溜まったまま頭の合わないメインの入力が届いたら、包みの形が変わったと知らせる", async () => {
    const reported: string[] = []
    const report = () => {
      reported.push("mismatch")
    }

    await runUserPromptSubmit(startedReview(), "<架空の新しい包み>架空の返却", undefined, report)
    expect(reported).toEqual(["mismatch"])
  })

  it("注記が溜まっていなければ、頭の合わない入力でも知らせない", async () => {
    const reported: string[] = []
    const report = () => {
      reported.push("mismatch")
    }

    await runUserPromptSubmit(plannedReview(), "架空の依頼", undefined, report)
    await runUserPromptSubmit(startedReview(), "架空の依頼", "agent-1", report)
    expect(reported).toEqual([])
  })
})

describe("handbackNoteHooks（メインの入力にいまの様子を添える）", () => {
  const NOW = 1_000 * 3_600_000

  /** 夜更けで、先頭の札がある架空の口。 */
  const SOURCE: PresentSceneSource = {
    localHourAt: () => 1,
    earlierRequestTimes: () => Promise.resolve([]),
    doneToday: () => Promise.resolve({ kind: "unknown" }),
    nextTask: () => ({ kind: "known", id: "bd-a1" }),
  }

  const SCENE_WITH_USAGE = [
    "いまの様子（tsukumo が添える。言うかどうかは任せる）",
    "- 時間帯: 夜更け",
    "- 使用量の集計期間: 5時間の枠が8割を超えた",
    "- 次に着手できるタスク: bd-a1",
  ].join("\n")

  /** 依頼を1件観て、8 割を超えた使用量を覚えた控え役で、入力を1回通す。 */
  async function runWith(
    keeperMode: SessionMode,
    prompt: string,
    review: CallReview = createCallReview(),
  ): Promise<unknown> {
    const keeper = presentSceneKeeperOf(
      keeperMode,
      () => NOW,
      () => {},
    )
    keeper.observe(requestEvent())
    keeper.notePlanUsage({
      kind: "ready",
      usage: { fiveHour: { utilization: 90 }, sevenDay: { utilization: 10 } },
    })
    return runUserPromptSubmit(review, prompt, undefined, () => {}, keeper.take)
  }

  const workMode: SessionMode = { ...WORK_MODE, presentSceneSource: SOURCE }
  const withScene = (context: string) => ({
    hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context },
  })

  it.each([
    ["ふつうの依頼", "架空の依頼"],
    ["補足の文", "架空の補足"],
    ["完了の知らせ", "<task-notification>架空の完了</task-notification>"],
  ])("%s に、いま渡す材料の塊を添える", async (_, prompt) => {
    expect(await runWith(workMode, prompt)).toEqual(withScene(SCENE_WITH_USAGE))
  })

  it("返却では、注記の後ろに空行でつなぐ", async () => {
    const note = startedReview().takeHandbackNote()
    expect(note).not.toBe("")

    expect(
      await runWith(workMode, '<agent-message from="架空の委譲先">架空の返却。', startedReview()),
    ).toEqual(withScene(`${note}\n\n${SCENE_WITH_USAGE}`))
  })

  it("渡すものが無ければ何も添えない", async () => {
    expect(
      await runUserPromptSubmit(
        createCallReview(),
        "架空の依頼",
        undefined,
        () => {},
        () => Promise.resolve(""),
      ),
    ).toEqual({})
  })

  it("サブエージェントの入力では何も添えず、いまの様子を取り出さない", async () => {
    const taken: string[] = []
    const take = () => {
      taken.push("taken")
      return Promise.resolve("架空の塊")
    }

    expect(
      await runUserPromptSubmit(createCallReview(), "架空の依頼", "agent-1", () => {}, take),
    ).toEqual({})
    expect(taken).toEqual([])
  })

  it("雑談のモードの控え役では、材料があっても何も添えない", async () => {
    expect(await runWith(CHAT_MODE, "架空の依頼")).toEqual({})
  })
})
