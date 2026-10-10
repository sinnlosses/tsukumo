import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { tsukumoServer } from "../../../../src/server/session-driver/adapter/sdk-tool.ts"
import {
  type CallReview,
  createCallReview,
} from "../../../../src/server/session-driver/core/call-review.ts"
import type {
  ChatRecall,
  SessionMode,
} from "../../../../src/server/session-driver/core/session-driver.ts"
import { SPEECH_NOTHING_NEW_REJECTION_TEXT } from "../../../../src/server/session-driver/core/speech-review.ts"
import { createUsageReviewIntake } from "../../../../src/server/usage-review/core/usage-review-tool.ts"
import type { QuestionBrief } from "../../../../src/shared/session-driver/question-brief.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
} from "../../../../src/shared/session/session-state.ts"
import { fixedChatSummary } from "../../../fixture/chat.ts"

// どのツールが載るか・呼ぶと何が返るかを、モデルが見るのと同じ MCP の `tools/list` /
// `tools/call` で確かめる（サーバの中身を覗かず、公開された口だけを通す）。本物の claude は

const EXPRESSIONS = [{ name: "default", label: "通常" }] as const
const FAKE_CWD = "/tmp/tsukumo-架空のcwd"

const NOT_FOUND_RECALL = {
  recallList: () => ({ kind: "not-found" }),
  recallEpisode: () => ({ kind: "not-found" }),
  finishTurn: () => {},
} satisfies ChatRecall

const WORK_MODE: SessionMode = { kind: "work", chatRecall: NOT_FOUND_RECALL }

const CHAT_MODE: SessionMode = {
  kind: "chat",
  personaMemory: { remember: () => {}, forget: () => {}, finishTurn: () => {} },
  chatSummary: fixedChatSummary(undefined),
  chatRecall: NOT_FOUND_RECALL,
}

describe("tsukumoServer", () => {
  it("仕事のときは report と work_plan と question_brief と見直しの2つと recall / recall_episode が載り、remember / forget は載らない", async () => {
    const names = await listedToolNames(workServer())

    expect(names).toEqual([
      "speak",
      "recall",
      "recall_episode",
      "report",
      "work_plan",
      "question_brief",
      "clear_and_send",
      "usage_review_stage",
      "usage_review_result",
    ])
  })

  it("雑談のときは report も見直しの2つも載らない。diary も載らない（会話とは別の使い捨ての問い合わせ）", async () => {
    const names = await listedToolNames(
      tsukumoServer(
        EXPRESSIONS,
        CHAT_MODE,
        createCallReview(),
        noopIntake(),
        () => {},
        FAKE_CWD,
        () => {},
        () => {},
        () => {},
      ),
    )

    expect(names).not.toContain("report")
    expect(names).not.toContain("work_plan")
    expect(names).not.toContain("clear_and_send")
    expect(names).not.toContain("usage_review_result")
    expect(names).not.toContain("diary")
    expect(names).toContain("speak")
    expect(names).toContain("remember")
  })

  it("雑談のときは recall と recall_episode の2段階が載り、keep と index はもう載らない", async () => {
    const names = await listedToolNames(
      tsukumoServer(
        EXPRESSIONS,
        CHAT_MODE,
        createCallReview(),
        noopIntake(),
        () => {},
        FAKE_CWD,
        () => {},
        () => {},
        () => {},
      ),
    )

    expect(names).toEqual(["speak", "recall", "recall_episode", "remember", "forget"])
  })
})

describe("recall / recall_episode ツール", () => {
  it("recall は一覧の文面を、recall_episode は開いた1件の文面を返す（口が返したものをそのまま渡す）", async () => {
    const chatMode: SessionMode = {
      ...CHAT_MODE,
      chatRecall: {
        recallList: (keyword) => ({
          kind: "found",
          candidates: [{ id: `id-for-${keyword}`, title: "架空の見出し", gist: "架空の要旨" }],
        }),
        recallEpisode: (id) => ({
          kind: "found",
          entries: [
            {
              kind: "request",
              origin: { mode: "chat" },
              text: `${id} の架空のやり取り`,
              date: "2026-09-25",
            },
          ],
          overflowed: false,
        }),
        finishTurn: () => {},
      },
    }
    // `McpSdkServerConfigWithInstance` は同時に1本の transport しか繋げないので、
    // 呼び出しごとにサーバを作り直す（`callTool` が繋いで閉じる。他のテストと同じ手）。
    const server = (): McpSdkServerConfigWithInstance =>
      tsukumoServer(
        EXPRESSIONS,
        chatMode,
        createCallReview(),
        noopIntake(),
        () => {},
        FAKE_CWD,
        () => {},
        () => {},
        () => {},
      )

    const listReply = await callTool(server(), "recall", { keyword: "散歩" })
    const episodeReply = await callTool(server(), "recall_episode", { id: "2026-09-25-1" })

    expect(listReply.text).toContain("id-for-散歩")
    expect(listReply.text).toContain("架空の見出し")
    expect(episodeReply.text).toContain("2026-09-25-1 の架空のやり取り")
  })

  it("仕事のときも recall / recall_episode が引け、仕事の行が印つきで返る", async () => {
    const workMode: SessionMode = {
      kind: "work",
      chatRecall: {
        recallList: () => ({ kind: "not-found" }),
        recallEpisode: (id) => ({
          kind: "found",
          entries: [
            {
              kind: "conclusion",
              origin: { mode: "work", project: "架空プロジェクト" },
              text: `${id} の架空の結論`,
              date: "2026-09-25",
            },
          ],
          overflowed: false,
        }),
        finishTurn: () => {},
      },
    }

    const reply = await callTool(
      tsukumoServer(
        EXPRESSIONS,
        workMode,
        createCallReview(),
        noopIntake(),
        () => {},
        FAKE_CWD,
        () => {},
        () => {},
        () => {},
      ),
      "recall_episode",
      { id: "2026-09-25-1" },
    )

    expect(reply.text).toContain("[仕事: 架空プロジェクト] したこと: 2026-09-25-1 の架空の結論")
  })

  it("当たらない・知らない id のときは短い一言だけで、会話の文面は入らない", async () => {
    const chatMode: SessionMode = {
      ...CHAT_MODE,
      chatRecall: {
        recallList: () => ({ kind: "not-found" }),
        recallEpisode: () => ({ kind: "not-found" }),
        finishTurn: () => {},
      },
    }
    const server = (): McpSdkServerConfigWithInstance =>
      tsukumoServer(
        EXPRESSIONS,
        chatMode,
        createCallReview(),
        noopIntake(),
        () => {},
        FAKE_CWD,
        () => {},
        () => {},
        () => {},
      )

    const listReply = await callTool(server(), "recall", { keyword: "架空" })
    const episodeReply = await callTool(server(), "recall_episode", { id: "no-such-id" })

    expect(listReply.text).not.toContain("利用者:")
    expect(episodeReply.text).not.toContain("利用者:")
  })
})

/** `report` に渡す締めのセリフ（架空）。 */
const CLOSING = { text: "架空の締めの一言", expression: "default" }

/** `report` に渡す待ちの一言とセッションの要約（架空）。どちらも必須。 */
const WAITING_LINE = { text: "架空の待ちの一言", expression: "default" }
const SUMMARY = "架空の要約"

describe("question_brief", () => {
  const BRIEF_ARGS = {
    questions: [
      {
        header: "架空の見出し",
        background: "架空の背景。",
        axes: ["速さ"],
        options: [
          {
            label: "A案",
            pros: ["架空の良い点。"],
            byAxis: ["速い"],
            figures: [{ kind: "mermaid", source: "sequenceDiagram\n  A ->> B: x" }],
          },
          { label: "B案", cons: ["架空の悪い点。"], byAxis: ["遅い"], irreversible: true },
        ],
      },
    ],
  }

  it("通った添え書きは省いた欄を既定で埋めて預け、ok を返す（ターンは閉じない）", async () => {
    const held: (readonly QuestionBrief[])[] = []

    const reply = await callTool(
      workServer([], [], [], createCallReview(), held),
      "question_brief",
      BRIEF_ARGS,
    )

    expect(reply).toEqual({ text: "ok", isError: false, endsTurn: false })
    expect(held).toEqual([
      [
        {
          header: "架空の見出し",
          background: "架空の背景。",
          axes: ["速さ"],
          options: [
            {
              label: "A案",
              pros: ["架空の良い点。"],
              cons: [],
              byAxis: ["速い"],
              irreversible: false,
              figures: [
                { kind: "mermaid", title: "", source: "sequenceDiagram\n  A ->> B: x", fold: "" },
              ],
            },
            {
              label: "B案",
              pros: [],
              cons: ["架空の悪い点。"],
              byAxis: ["遅い"],
              irreversible: true,
              figures: [],
            },
          ],
        },
      ],
    ])
  })

  it("崩れた添え書きは預けずに isError で直し方を返す", async () => {
    const held: (readonly QuestionBrief[])[] = []

    const reply = await callTool(
      workServer([], [], [], createCallReview(), held),
      "question_brief",
      { questions: [{ ...BRIEF_ARGS.questions[0], background: "" }] },
    )

    expect(reply.isError).toBe(true)
    expect(held).toEqual([])
  })
})

describe("report でターンを閉じる", () => {
  it("通った report の結果にだけ claude/endTurn を付ける", async () => {
    const reply = await callTool(workServer(), "report", {
      conclusion: "架空の結論",
      closing: CLOSING,
      sessionSummary: SUMMARY,
      waitingLine: WAITING_LINE,
    })

    expect(reply).toEqual({ text: "ok", isError: false, endsTurn: true })
  })

  it("差し戻した report（isError）には付けない（直して呼び直せる）", async () => {
    // conclusion が3文以上（規約違反「冒頭の1〜2文で結論」）だと差し戻される。
    const reply = await callTool(workServer(), "report", {
      conclusion: "架空の一文目。架空の二文目。架空の三文目。",
      closing: CLOSING,
      sessionSummary: SUMMARY,
      waitingLine: WAITING_LINE,
    })

    expect(reply.isError).toBe(true)
    expect(reply.endsTurn).toBe(false)
  })

  it("構文が割れる mermaid の図を含む report は差し戻し、直した report は通す", async () => {
    const withDiagram = (source: string) => ({
      conclusion: "架空の結論",
      sections: [{ blocks: [{ kind: "mermaid", source }] }],
      closing: CLOSING,
      sessionSummary: SUMMARY,
      waitingLine: WAITING_LINE,
    })

    const broken = await callTool(
      workServer(),
      "report",
      withDiagram("sequenceDiagram\n  A->>B: hi; there"),
    )
    const fixed = await callTool(
      workServer(),
      "report",
      withDiagram("sequenceDiagram\n  A->>B: hi"),
    )

    expect(broken.isError).toBe(true)
    expect(broken.text).toContain("1個目の 2 行目")
    expect(broken.text).not.toContain("there")
    expect(fixed).toEqual({ text: "ok", isError: false, endsTurn: true })
  })

  it("closing の無い report は形の検査で落ち、ターンを閉じない", async () => {
    const reply = await callTool(workServer(), "report", { conclusion: "架空の結論" })

    expect(reply.isError).toBe(true)
    expect(reply.endsTurn).toBe(false)
  })

  it("選択肢に無い表情の waitingLine は形の検査で落ちる", async () => {
    const reply = await callTool(workServer(), "report", {
      conclusion: "架空の結論",
      closing: CLOSING,
      sessionSummary: SUMMARY,
      waitingLine: { text: "架空の待ちの一言", expression: "架空の表情" },
    })

    expect(reply.isError).toBe(true)
    expect(reply.endsTurn).toBe(false)
  })

  it("waitingLine か sessionSummary の無い report は形の検査で落ち、ターンを閉じない", async () => {
    const noWaitingLine = await callTool(workServer(), "report", {
      conclusion: "架空の結論",
      closing: CLOSING,
      sessionSummary: SUMMARY,
    })
    const noSummary = await callTool(workServer(), "report", {
      conclusion: "架空の結論",
      closing: CLOSING,
      waitingLine: WAITING_LINE,
    })

    expect(noWaitingLine).toMatchObject({ isError: true, endsTurn: false })
    expect(noSummary).toMatchObject({ isError: true, endsTurn: false })
  })

  it("speak はターンを閉じない", async () => {
    const reply = await callTool(workServer(), "speak", CLOSING)

    expect(reply).toEqual({ text: "ok", isError: false, endsTurn: false })
  })
})

describe("speak の差し戻し", () => {
  it("仕事のときは、描いたセリフのあとに新しい事実の無い speak を差し戻しの一文で返す", async () => {
    const reply = await callTool(workServer([], [], [], spokenReview()), "speak", CLOSING)

    expect(reply).toEqual({
      text: SPEECH_NOTHING_NEW_REJECTION_TEXT,
      isError: true,
      endsTurn: false,
    })
  })

  it("雑談のときは差し戻さない", async () => {
    const reply = await callTool(
      tsukumoServer(
        EXPRESSIONS,
        CHAT_MODE,
        spokenReview(),
        noopIntake(),
        () => {},
        FAKE_CWD,
        () => {},
        () => {},
        () => {},
      ),
      "speak",
      CLOSING,
    )

    expect(reply).toEqual({ text: "ok", isError: false, endsTurn: false })
  })
})

/** セリフを1つ描いたあと、新しい事実の届いていない `CallReview`。 */
function spokenReview(): CallReview {
  const review = createCallReview()
  review.pass({
    kind: "speak-called",
    toolUseId: "toolu_speak_1",
    speech: { kind: "speech", text: "架空のセリフ", expression: "default" },
  })
  review.pass({ kind: "tool-finished", toolUseId: "toolu_speak_1", content: "ok", isError: false })
  return review
}

describe("work_plan（段取り）", () => {
  it("段の並びと位置を渡すと ok が返り、ターンは閉じない", async () => {
    const reply = await callTool(workServer(), "work_plan", {
      phases: ["架空の段A", "架空の段B"],
      current: 2,
    })

    expect(reply).toEqual({ text: "ok", isError: false, endsTurn: false })
  })

  it("途中の位置の呼び出しは、段のまとめがあれば通し、無ければ差し戻す", async () => {
    const withSummary = await callTool(workServer(), "work_plan", {
      phases: ["架空の段A", "架空の段B"],
      current: 1,
      phaseSummary: "架空のまとめ。",
    })
    const withoutSummary = await callTool(workServer(), "work_plan", {
      phases: ["架空の段A", "架空の段B"],
      current: 1,
    })

    expect(withSummary).toEqual({ text: "ok", isError: false, endsTurn: false })
    expect(withoutSummary.isError).toBe(true)
    expect(withoutSummary.endsTurn).toBe(false)
  })

  it("委譲先の段の範囲は形の検査を通り、並びをはみ出す範囲と整数でない範囲は差し戻す", async () => {
    const phases = ["架空の計画", "架空の実装", "架空の受け入れ"]
    const ok = await callTool(workServer(), "work_plan", {
      phases,
      current: 0,
      delegatedRange: { first: 1, count: 1 },
    })
    const overflow = await callTool(workServer(), "work_plan", {
      phases,
      current: 0,
      delegatedRange: { first: 2, count: 2 },
    })
    const zero = await callTool(workServer(), "work_plan", {
      phases,
      current: 0,
      delegatedRange: { first: 1, count: 0 },
    })

    expect(ok).toEqual({ text: "ok", isError: false, endsTurn: false })
    expect(overflow.isError).toBe(true)
    expect(zero.isError).toBe(true)
  })

  it("同時に走る段のまとまりと finishedInGroup は形の検査を通り、1段だけのまとまりは落ちる", async () => {
    const grouped = await callTool(workServer(), "work_plan", {
      phases: ["架空の段A", ["架空の段B", "架空の段C"]],
      current: 1,
      finishedInGroup: ["架空の段C"],
      phaseSummary: "架空のまとめ。",
    })
    const lone = await callTool(workServer(), "work_plan", {
      phases: ["架空の段A", ["架空の段B"]],
      current: 0,
    })

    expect(grouped).toEqual({ text: "ok", isError: false, endsTurn: false })
    expect(lone.isError).toBe(true)
  })

  it("段が1つだけの段取りは受け付ける", async () => {
    const single = await callTool(workServer(), "work_plan", { phases: ["架空の段A"], current: 0 })

    expect(single).toEqual({ text: "ok", isError: false, endsTurn: false })
  })

  it("段が0・空白だけの名前の段取りは形の検査で落ちる", async () => {
    const empty = await callTool(workServer(), "work_plan", { phases: [], current: 0 })
    const blank = await callTool(workServer(), "work_plan", {
      phases: ["架空の段A", "  "],
      current: 0,
    })

    expect(empty.isError).toBe(true)
    expect(blank.isError).toBe(true)
  })

  it("phases を省いた呼び出しは差し戻す", async () => {
    const reply = await callTool(workServer(), "work_plan", {
      current: 1,
      phaseSummary: "架空のまとめ。",
    })

    expect(reply.isError).toBe(true)
    expect(reply.endsTurn).toBe(false)
  })
})

describe("report の本文（sections）", () => {
  it("引数は節と塊の並び（sections）で、文字列の body は無い", async () => {
    const reply = await request(workServer(), "tools/list", {}, TOOLS_SCHEMA_REPLY)
    const properties = reply.result.tools.find((tool) => tool.name === "report")?.inputSchema
      .properties

    expect(Object.keys(properties ?? {})).toContain("sections")
    expect(Object.keys(properties ?? {})).not.toContain("body")
  })

  it("塊で書いた report は通り、逃げ道に塊の種類がある記法を書いた report は差し戻す", async () => {
    const accepted = await callTool(workServer(), "report", {
      conclusion: "架空の結論",
      sections: [
        {
          heading: "架空の節",
          blocks: [
            { kind: "text", text: "架空の根拠。" },
            { kind: "list", style: "bullet", items: [{ text: "架空の項目" }] },
          ],
        },
      ],
      closing: CLOSING,
      sessionSummary: SUMMARY,
      waitingLine: WAITING_LINE,
    })
    const rejected = await callTool(workServer(), "report", {
      conclusion: "架空の結論",
      sections: [{ blocks: [{ kind: "markdown", markdown: "- 架空の項目" }] }],
      closing: CLOSING,
      sessionSummary: SUMMARY,
      waitingLine: WAITING_LINE,
    })

    expect(accepted).toEqual({ text: "ok", isError: false, endsTurn: true })
    expect(rejected.isError).toBe(true)
    expect(rejected.text).toContain("`list` の塊")
  })
})

describe("report の差し戻しの記録", () => {
  const draft = {
    conclusion: "架空の結論",
    closing: CLOSING,
    sessionSummary: SUMMARY,
    waitingLine: WAITING_LINE,
  }

  it("差し戻した report は種類の名前だけの report-rejected を流し、通した report は流さない", async () => {
    const events: SessionEvent[] = []
    await callTool(workServer(events), "report", {
      ...draft,
      sections: [{ blocks: [{ kind: "markdown", markdown: "- 架空の項目" }] }],
    })
    await callTool(workServer(events), "report", draft)

    expect(events).toEqual([{ kind: "report-rejected", reasons: ["markdown-notation"] }])
  })
})

describe("report の title", () => {
  it("通った report の title を渡す", async () => {
    const titles: string[] = []

    const reply = await callTool(workServer([], [], titles), "report", {
      conclusion: "架空の結論",
      closing: CLOSING,
      sessionSummary: SUMMARY,
      waitingLine: WAITING_LINE,
      title: "架空の題",
    })

    expect(reply.isError).toBe(false)
    expect(titles).toEqual(["架空の題"])
  })

  it("title を渡さなくても report は通る", async () => {
    const titles: string[] = []

    const reply = await callTool(workServer([], [], titles), "report", {
      conclusion: "架空の結論",
      closing: CLOSING,
      sessionSummary: SUMMARY,
      waitingLine: WAITING_LINE,
    })

    expect(reply.isError).toBe(false)
    expect(titles).toEqual([])
  })

  it("規約違反で差し戻された report の title は渡さない", async () => {
    const titles: string[] = []

    const reply = await callTool(workServer([], [], titles), "report", {
      conclusion: "架空の一文目。架空の二文目。架空の三文目。",
      closing: CLOSING,
      sessionSummary: SUMMARY,
      waitingLine: WAITING_LINE,
      title: "架空の題",
    })

    expect(reply.isError).toBe(true)
    expect(titles).toEqual([])
  })
})

describe("見直しのツール", () => {
  it("正しい結果を渡すと ok が返り、畳んだ状態が結果になる", async () => {
    const events: SessionEvent[] = []

    const reply = await callTool(workServer(events), "usage_review_result", VALID_FINDINGS)

    expect(reply).toEqual({ text: "ok", isError: false, endsTurn: false })
    expect(events).toEqual([{ kind: "usage-review-result", findings: VALID_FINDINGS }])
    const state = events.reduce(
      (current, event) => applySessionEvent(current, event, 2_000),
      INITIAL_SESSION_STATE,
    )
    expect(state.usageReview).toEqual({
      kind: "result",
      reviewedAt: 2_000,
      findings: VALID_FINDINGS,
    })
  })

  it("段を渡すとイベントが流れ、見送った提案の識別子が戻り値に並ぶ", async () => {
    const events: SessionEvent[] = []

    const reply = await callTool(
      workServer(events, ["unused-mcp:example-server"]),
      "usage_review_stage",
      { stage: "cache", days: 7 },
    )

    expect(events).toEqual([{ kind: "usage-review-stage", stage: "cache", days: 7 }])
    expect(reply.isError).toBe(false)
    expect(reply.text.split("\n")[0]).toBe("ok")
    expect(reply.text).toContain("- unused-mcp:example-server")
  })

  it("列挙に無い種類は境界で断られ、理由が戻り値で返り、イベントは流れない", async () => {
    const events: SessionEvent[] = []

    const reply = await callTool(workServer(events), "usage_review_result", {
      ...VALID_FINDINGS,
      proposals: [{ ...VALID_PROPOSAL, kind: "unknown-kind" }],
    })

    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("kind")
    expect(events).toEqual([])
  })

  it("形は合っていても条に外れる結果は、直し方つきで差し戻される", async () => {
    const events: SessionEvent[] = []

    const reply = await callTool(
      workServer(events, ["unused-mcp:example-server"]),
      "usage_review_result",
      { ...VALID_FINDINGS, headline: " ", proposals: [VALID_PROPOSAL, VALID_PROPOSAL] },
    )

    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("`headline` が空")
    expect(reply.text).toContain("同じ `kind` と `target` の組が1件重なっている")
    expect(reply.text).toContain("利用者が見送った提案が2件入っている")
    expect(events).toEqual([])
  })

  it("提案が上限を超えると差し戻される", async () => {
    const events: SessionEvent[] = []
    const proposals = ["a", "b", "c", "d", "e", "f"].map((target) => ({
      ...VALID_PROPOSAL,
      kind: "tool-result",
      target,
    }))

    const reply = await callTool(workServer(events), "usage_review_result", {
      ...VALID_FINDINGS,
      proposals,
    })

    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("提案が6件ある")
    expect(events).toEqual([])
  })
})

const VALID_PROPOSAL = {
  kind: "unused-mcp",
  target: "example-server",
  impact: "small",
  title: "架空の MCP サーバを外す",
  basis: "架空の根拠（10 ターンぶん）",
  action: "架空のやること",
  followUp: "delegate",
} as const

const VALID_FINDINGS = {
  days: 7,
  headline: "架空の冒頭の一言。",
  proposals: [VALID_PROPOSAL],
} as const

/**
 * 仕事のサーバ。見直しのイベントは `events` に積み、見送りの一覧は `dismissed` を返す。
 * `report` が受け取った題は `titles` に、`question_brief` が預けた添え書きは `heldBriefs` に積む。
 */
function workServer(
  events: SessionEvent[] = [],
  dismissed: readonly string[] = [],
  titles: string[] = [],
  callReview: CallReview = createCallReview(),
  heldBriefs: (readonly QuestionBrief[])[] = [],
): McpSdkServerConfigWithInstance {
  return tsukumoServer(
    EXPRESSIONS,
    WORK_MODE,
    callReview,
    createUsageReviewIntake(
      () => dismissed,
      async () => true,
      (event) => {
        events.push(event)
      },
    ),
    (title) => {
      titles.push(title)
    },
    FAKE_CWD,
    (event) => {
      events.push(event)
    },
    (briefs) => {
      heldBriefs.push(briefs)
    },
    () => {},
  )
}

function noopIntake() {
  return createUsageReviewIntake(
    () => [],
    async () => true,
    () => {},
  )
}

/** `tools/list` の応答のうち、ここで読む形（名前の並び）。 */
const TOOLS_LIST_REPLY = z.object({
  id: z.literal(1),
  result: z.object({ tools: z.array(z.object({ name: z.string() })) }),
})

/** `tools/list` の応答のうち、ここで読む形（名前と、引数の schema の欄の名前）。 */
const TOOLS_SCHEMA_REPLY = z.object({
  id: z.literal(1),
  result: z.object({
    tools: z.array(
      z.object({
        name: z.string(),
        inputSchema: z.object({ properties: z.record(z.string(), z.unknown()) }),
      }),
    ),
  }),
})

/** `tools/call` の応答のうち、ここで読む形（文面と `isError` と、ターンを閉じる印）。 */
const TOOLS_CALL_REPLY = z.object({
  id: z.literal(1),
  result: z.object({
    content: z.array(z.object({ type: z.literal("text"), text: z.string() })),
    isError: z.boolean().optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
})

async function listedToolNames(server: McpSdkServerConfigWithInstance): Promise<string[]> {
  const reply = await request(server, "tools/list", {}, TOOLS_LIST_REPLY)
  return reply.result.tools.map((tool) => tool.name)
}

async function callTool(
  server: McpSdkServerConfigWithInstance,
  name: string,
  args: unknown,
): Promise<{ readonly text: string; readonly isError: boolean; readonly endsTurn: boolean }> {
  const reply = await request(server, "tools/call", { name, arguments: args }, TOOLS_CALL_REPLY)
  const { _meta: meta } = reply.result
  return {
    text: reply.result.content.map((block) => block.text).join("\n"),
    isError: reply.result.isError ?? false,
    endsTurn: meta?.["claude/endTurn"] === true,
  }
}

/**
 * サーバをメモリ上の口につなぎ、要求を1回送って返ってきた応答を読む。
 * 口は送り返しを控えるだけの最小のもの（MCP の `Transport` の形）。
 */
async function request<T>(
  server: McpSdkServerConfigWithInstance,
  method: string,
  params: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const replies: unknown[] = []
  const transport: Parameters<McpSdkServerConfigWithInstance["instance"]["connect"]>[0] = {
    start: async () => {},
    close: async () => {},
    send: async (message) => {
      replies.push(message)
    },
  }
  await server.instance.connect(transport)
  transport.onmessage?.({ jsonrpc: "2.0", id: 1, method, params })

  const reply = await waitForReply(replies, schema)
  await server.instance.close()
  return reply
}

/** 応答が控えに届くまで待つ。mermaid の worker の初回の読み込みを待てる長さにしてある。 */
async function waitForReply<T>(replies: readonly unknown[], schema: z.ZodType<T>): Promise<T> {
  for (let attempt = 0; attempt < 2000; attempt += 1) {
    const found = replies.find((reply) => schema.safeParse(reply).success)
    if (found !== undefined) {
      return schema.parse(found)
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error("応答が届かなかった")
}
