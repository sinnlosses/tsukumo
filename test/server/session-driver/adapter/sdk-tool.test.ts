import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { tsukumoServer } from "../../../../src/server/session-driver/adapter/sdk-tool.ts"
import {
  type CallReview,
  createCallReview,
} from "../../../../src/server/session-driver/core/call-review.ts"
import { PHASE_MENTION_REJECTION_TEXT } from "../../../../src/server/session-driver/core/phase-mention.ts"
import { toSessionEvents } from "../../../../src/server/session-driver/core/sdk-message.ts"
import type {
  ChatRecall,
  SessionMode,
} from "../../../../src/server/session-driver/core/session-driver.ts"
import { SPEECH_NOTHING_NEW_REJECTION_TEXT } from "../../../../src/server/session-driver/core/speech-review.ts"
import { FIRST_SENTENCE_TARGET } from "../../../../src/shared/report/report-limit.ts"
import type { QuestionBrief } from "../../../../src/shared/session-driver/question-brief.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { fixedChatSummary } from "../../../fixture/chat.ts"
import { callTool, listedToolNames, mcpRequest } from "../../../fixture/mcp-server.ts"
import { WORK_PLAN_TOOL_FULL_NAME } from "../../../fixture/sdk-message.ts"

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
  it("仕事のときは report と work_plan と phase_result と question_brief と recall / recall_episode が載り、remember / forget と見直しの2つは載らない", async () => {
    const names = await listedToolNames(workServer())

    expect(names).toEqual([
      "speak",
      "recall",
      "recall_episode",
      "report",
      "work_plan",
      "phase_result",
      "question_brief",
      "clear_and_send",
    ])
  })

  it("雑談のときは report も見直しの2つも載らない。diary も載らない（会話とは別の使い捨ての問い合わせ）", async () => {
    const names = await listedToolNames(
      tsukumoServer(
        EXPRESSIONS,
        CHAT_MODE,
        createCallReview(),
        () => {},
        FAKE_CWD,
        () => {},
        () => {},
        () => {},
      ),
    )

    expect(names).not.toContain("report")
    expect(names).not.toContain("work_plan")
    expect(names).not.toContain("phase_result")
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

/** `report` に渡す図の欄（必須）。図を置かない理由を言う形。 */
const FIGURE = { kind: "none", reason: "short-answer" }

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
      workServer([], [], createCallReview(), held),
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

    const reply = await callTool(workServer([], [], createCallReview(), held), "question_brief", {
      questions: [{ ...BRIEF_ARGS.questions[0], background: "" }],
    })

    expect(reply.isError).toBe(true)
    expect(held).toEqual([])
  })
})

describe("report でターンを閉じる", () => {
  it("通った report の結果にだけ claude/endTurn を付ける", async () => {
    const reply = await callTool(workServer(), "report", {
      conclusion: "架空の結論",
      closing: CLOSING,
      figure: FIGURE,
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
      figure: FIGURE,
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
      figure: FIGURE,
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

  it("figure に置いた mermaid の構文も検査し、描く順の1個目として差し戻す", async () => {
    const reply = await callTool(workServer(), "report", {
      conclusion: "架空の結論",
      figure: { kind: "mermaid", source: "sequenceDiagram\n  A->>B: hi; there" },
      sections: [{ blocks: [{ kind: "mermaid", source: "sequenceDiagram\n  A->>B: hi" }] }],
      closing: CLOSING,
      sessionSummary: SUMMARY,
      waitingLine: WAITING_LINE,
    })

    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("1個目の 2 行目")
    expect(reply.text).not.toContain("there")
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
      figure: FIGURE,
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
      figure: FIGURE,
      sessionSummary: SUMMARY,
    })
    const noSummary = await callTool(workServer(), "report", {
      conclusion: "架空の結論",
      figure: FIGURE,
      closing: CLOSING,
      waitingLine: WAITING_LINE,
    })

    expect(noWaitingLine).toMatchObject({ isError: true, endsTurn: false })
    expect(noSummary).toMatchObject({ isError: true, endsTurn: false })
  })

  it("figure の無い report・理由の無い none は形の検査で落ち、図の塊1つか none と理由で通る", async () => {
    const withFigure = (figure: unknown) => ({
      conclusion: "架空の結論",
      ...(figure === undefined ? {} : { figure }),
      closing: CLOSING,
      sessionSummary: SUMMARY,
      waitingLine: WAITING_LINE,
    })

    const replies = await Promise.all(
      [
        undefined,
        { kind: "none" },
        { kind: "none", reason: "unrecorded" },
        { kind: "table", title: "架空の表", columns: ["a", "b"], rows: [["1", "2"]] },
        { kind: "graph", direction: "LR", source: "架空のA -> 架空のB" },
        { kind: "none", reason: "no-shape" },
      ].map((figure) => callTool(workServer(), "report", withFigure(figure))),
    )

    expect(replies.map((reply) => reply.isError)).toEqual([true, true, true, true, false, false])
    expect(replies[5]).toEqual({ text: "ok", isError: false, endsTurn: true })
  })

  it("speak はターンを閉じない", async () => {
    const reply = await callTool(workServer(), "speak", CLOSING)

    expect(reply).toEqual({ text: "ok", isError: false, endsTurn: false })
  })
})

describe("speak の差し戻し", () => {
  it("仕事のときは、描いたセリフのあとに新しい事実の無い speak を差し戻しの一文で返す", async () => {
    const reply = await callTool(workServer([], [], spokenReview()), "speak", CLOSING)

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

function rangedReview(): CallReview {
  const review = createCallReview()
  review.pass({ kind: "request", text: "架空の依頼", images: [] })
  review.judgeWorkPlan({
    phases: ["架空の計画", "架空の実装A", "架空の実装B", "架空の受け入れ"],
    current: 0,
    delegatedRange: { first: 1, count: 2 },
  })
  return review
}

describe("範囲の外の段の番号の差し戻し", () => {
  const rejected = { text: PHASE_MENTION_REJECTION_TEXT, isError: true, endsTurn: false }

  it("範囲があるあいだ、範囲の外の番号を言う speak と report を差し戻し、範囲の中の番号は通す", async () => {
    const report = (closingText: string) => ({
      conclusion: "架空の結論",
      workPlanClosing: "stopped",
      closing: { text: closingText, expression: "default" },
      figure: FIGURE,
      sessionSummary: SUMMARY,
      waitingLine: WAITING_LINE,
    })

    expect(
      await callTool(workServer([], [], rangedReview()), "speak", {
        text: "段3が返った",
        expression: "default",
      }),
    ).toEqual(rejected)
    expect(
      await callTool(workServer([], [], rangedReview()), "report", report("段3まで済んだ")),
    ).toEqual(rejected)
    expect(
      await callTool(workServer([], [], rangedReview()), "speak", {
        text: "段2が返った",
        expression: "default",
      }),
    ).toMatchObject({ isError: false })
    expect(
      await callTool(workServer([], [], rangedReview()), "report", report("段2まで済んだ")),
    ).toMatchObject({ isError: false, endsTurn: true })
  })

  it("範囲が無ければ検査しない", async () => {
    expect(
      await callTool(workServer(), "speak", { text: "段9が返った", expression: "default" }),
    ).toMatchObject({ isError: false })
  })
})

describe("phase_result（委譲先の段の結果）", () => {
  const planned = async (review: CallReview) => {
    await callTool(workServer([], [], review), "work_plan", {
      phases: ["架空の計画", "架空の実装A", "架空の実装B", "架空の受け入れ"],
      current: 1,
      phaseSummary: "架空のまとめ。",
      delegatedRange: { first: 1, count: 2 },
    })
  }

  it("帯を動かした呼び出しは ok と帯の今の段を返し、結果を読んだ返却を1件流す", async () => {
    const review = createCallReview()
    await planned(review)
    const events: SessionEvent[] = []

    const reply = await callTool(workServer(events, [], review), "phase_result", {
      phase: 1,
      count: 2,
      outcome: "skipped",
    })

    expect(reply.isError).toBe(false)
    expect(reply.text).toMatch(/^ok\n帯の今の段は 本 2\/2 架空の実装B。/u)
    expect(events).toEqual([
      {
        kind: "delegate-returned",
        delegate: "",
        handback: { kind: "phase-skipped", phase: 1, count: 2 },
      },
    ])
  })

  it("帯を動かさない呼び出しは、動いていないことを言い、何も流さない", async () => {
    const review = createCallReview()
    await planned(review)
    const events: SessionEvent[] = []

    const reply = await callTool(workServer(events, [], review), "phase_result", {
      phase: 1,
      count: 2,
      outcome: "stopped",
      reason: "架空の理由。",
    })

    expect(reply.text).toMatch(/^ok\n帯は動いていない。帯の今の段は 本 1\/2 架空の実装A。/u)
    expect(events).toEqual([])
  })

  it("形の誤りは差し戻し、直し方を返す", async () => {
    const reply = await callTool(workServer(), "phase_result", {
      phase: 1,
      count: 2,
      outcome: "finished",
      reason: "架空",
    })

    expect(reply.isError).toBe(true)
    expect(reply.text).toContain("reason は outcome が stopped のときだけ")
  })
})

describe("work_plan（段取り）", () => {
  it("段の並びと位置を渡すと ok が返り、ターンは閉じない", async () => {
    const reply = await callTool(workServer(), "work_plan", {
      phases: ["架空の段A", "架空の段B"],
      current: 1,
      phaseSummary: "架空のまとめ。",
    })

    expect(reply).toEqual({
      text: "ok\n帯の今の段は 2/2 架空の段B。",
      isError: false,
      endsTurn: false,
    })
  })

  it("受け付けた戻り値は帯の今の段の位置と名前を言い、範囲があれば群の名と群の中の番号で言う", async () => {
    const reply = await callTool(workServer(), "work_plan", {
      phases: ["架空の計画", "架空の実装A", "架空の実装B", "架空の受け入れ"],
      current: 1,
      phaseSummary: "架空のまとめ。",
      delegatedRange: { first: 1, count: 2 },
    })

    expect(reply.text).toBe(
      "ok\n帯の今の段は 本 1/2 架空の実装A。帯は範囲の前（前）・範囲（本）・範囲の後ろ（後）の群ごとに1から数え、本の番号は委譲先の段の番号と同じ。セリフで番号を言うのは本の段だけで、前・後の段は名前で言う。",
    )
  })

  it("count を省いた delegatedRange（pending）を受け付け、範囲の先頭から後ろは番号を持たないと言う", async () => {
    const reply = await callTool(workServer(), "work_plan", {
      phases: ["架空の計画", "架空の実装", "架空の受け入れ"],
      current: 0,
      delegatedRange: { first: 1 },
    })

    expect(reply.text).toBe(
      "ok\n帯の今の段は 前 1/1 架空の計画。範囲の先頭から後ろの段は番号を持たない（委譲先の段の数が決まるまで）。",
    )
  })

  it("計画を練り直して first と総数が変わると、戻り値は新しい番号を言う", async () => {
    const review = createCallReview()
    const before = await callTool(workServer([], [], review), "work_plan", {
      phases: ["架空の計画", "架空の実装", "架空の受け入れ"],
      current: 0,
      delegatedRange: { first: 1, count: 1 },
    })
    const after = await callTool(workServer([], [], review), "work_plan", {
      phases: ["架空の計画", "架空の調べ", "架空の実装A", "架空の実装B", "架空の受け入れ"],
      current: 0,
      delegatedRange: { first: 2, count: 2 },
    })

    expect(before.text).toContain("帯の今の段は 前 1/1 架空の計画。")
    expect(after.text).toContain("帯の今の段は 前 1/2 架空の計画。")
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

    expect(withSummary).toMatchObject({ isError: false, endsTurn: false })
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

    expect(ok).toMatchObject({ isError: false, endsTurn: false })
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

    expect(grouped).toMatchObject({ isError: false, endsTurn: false })
    expect(lone.isError).toBe(true)
  })

  it("段が1つだけの段取りは受け付ける", async () => {
    const single = await callTool(workServer(), "work_plan", { phases: ["架空の段A"], current: 0 })

    expect(single).toMatchObject({ isError: false, endsTurn: false })
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

  it.each([
    { name: "1段", input: { phases: ["架空の段A"], current: 0 } },
    {
      name: "まとまりの途中",
      input: {
        phases: ["架空の段A", ["架空の段B", "架空の段C"]],
        current: 1,
        finishedInGroup: ["架空の段C"],
        phaseSummary: "架空のまとめ。",
      },
    },
    {
      name: "委譲先の範囲",
      input: {
        phases: ["架空の計画", "架空の実装", "架空の受け入れ"],
        current: 0,
        delegatedRange: { first: 1, count: 1 },
      },
    },
    { name: "空白だけの名前", input: { phases: ["架空の段A", "  "], current: 0 } },
    { name: "位置が段の数を超える", input: { phases: ["架空の段A"], current: 2 } },
    {
      name: "まとまりの名前の重なり",
      input: { phases: [["架空の段A", "架空の段A"]], current: 0 },
    },
    {
      name: "まとまり全部が済んだと渡す",
      input: {
        phases: [["架空の段A", "架空の段B"], "架空の段C"],
        current: 0,
        finishedInGroup: ["架空の段A", "架空の段B"],
      },
    },
    {
      name: "まとめが3文",
      input: { phases: ["架空の段A", "架空の段B"], current: 1, phaseSummary: "一。二。三。" },
    },
    {
      name: "範囲がまとまりをまたぐ",
      input: {
        phases: ["架空の段A", ["架空の段B", "架空の段C"]],
        current: 0,
        delegatedRange: { first: 0, count: 2 },
      },
    },
  ])("handler が受け付けた引数だけが work-plan-called になる: $name", async ({ input }) => {
    const reply = await callTool(workServer(), "work_plan", input)
    const events = toSessionEvents(
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "toolu_1", name: WORK_PLAN_TOOL_FULL_NAME, input }],
        },
        session_id: "s-1",
        parent_tool_use_id: null,
      },
      ["default"],
    )

    expect(events.some((event) => event.kind === "work-plan-called")).toBe(!reply.isError)
  })
})

describe("report の本文（sections）", () => {
  it("引数は節と塊の並び（sections）で、文字列の body は無い", async () => {
    const reply = await mcpRequest(workServer(), "tools/list", {}, TOOLS_SCHEMA_REPLY)
    const properties = reply.result.tools.find((tool) => tool.name === "report")?.inputSchema
      .properties

    expect(Object.keys(properties ?? {})).toContain("sections")
    expect(Object.keys(properties ?? {})).not.toContain("body")
  })

  it("figure と sections が共有する塊は definitions に1回だけ置いて参照し、report の引数の schema が字数の上限を超えない", async () => {
    const reply = await mcpRequest(workServer(), "tools/list", {}, TOOLS_WHOLE_SCHEMA_REPLY)
    const inputSchema = reply.result.tools.find((tool) => tool.name === "report")?.inputSchema
    const schema = z
      .object({
        properties: z.object({
          figure: z.object({ oneOf: z.array(z.record(z.string(), z.unknown())) }),
        }),
        definitions: z.record(z.string(), z.unknown()),
      })
      .parse(inputSchema)
    const figureRefs = schema.properties.figure.oneOf.flatMap((branch) =>
      typeof branch["$ref"] === "string" ? [branch["$ref"]] : [],
    )

    expect(Object.keys(schema.definitions).toSorted()).toEqual(SHARED_BLOCK_DEFINITIONS)
    expect(figureRefs.toSorted()).toEqual(
      SHARED_BLOCK_DEFINITIONS.filter(
        (name) => name !== "BeforeAfterSide" && name !== "SvgShape",
      ).map((name) => `#/definitions/${name}`),
    )
    expect(JSON.stringify(inputSchema).length).toBeLessThan(REPORT_INPUT_SCHEMA_MAX_CHARS)
  })

  it("conclusion の説明に、目安の字数・読点の数・悪い例と良い例がある", async () => {
    const reply = await mcpRequest(workServer(), "tools/list", {}, TOOLS_SCHEMA_REPLY)
    const conclusion = z
      .object({ description: z.string() })
      .parse(
        reply.result.tools.find((tool) => tool.name === "report")?.inputSchema.properties[
          "conclusion"
        ],
      )

    expect(conclusion.description).toContain(`目安は${String(FIRST_SENTENCE_TARGET)}字`)
    expect(conclusion.description).toContain("読点は1つまで")
    expect(conclusion.description).toContain("悪い例")
    expect(conclusion.description).toContain("良い例")
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
      figure: FIGURE,
      sessionSummary: SUMMARY,
      waitingLine: WAITING_LINE,
    })
    const rejected = await callTool(workServer(), "report", {
      conclusion: "架空の結論",
      sections: [{ blocks: [{ kind: "markdown", markdown: "- 架空の項目" }] }],
      closing: CLOSING,
      figure: FIGURE,
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
    figure: FIGURE,
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

    const reply = await callTool(workServer([], titles), "report", {
      conclusion: "架空の結論",
      closing: CLOSING,
      figure: FIGURE,
      sessionSummary: SUMMARY,
      waitingLine: WAITING_LINE,
      title: "架空の題",
    })

    expect(reply.isError).toBe(false)
    expect(titles).toEqual(["架空の題"])
  })

  it("title を渡さなくても report は通る", async () => {
    const titles: string[] = []

    const reply = await callTool(workServer([], titles), "report", {
      conclusion: "架空の結論",
      closing: CLOSING,
      figure: FIGURE,
      sessionSummary: SUMMARY,
      waitingLine: WAITING_LINE,
    })

    expect(reply.isError).toBe(false)
    expect(titles).toEqual([])
  })

  it("規約違反で差し戻された report の title は渡さない", async () => {
    const titles: string[] = []

    const reply = await callTool(workServer([], titles), "report", {
      conclusion: "架空の一文目。架空の二文目。架空の三文目。",
      closing: CLOSING,
      figure: FIGURE,
      sessionSummary: SUMMARY,
      waitingLine: WAITING_LINE,
      title: "架空の題",
    })

    expect(reply.isError).toBe(true)
    expect(titles).toEqual([])
  })
})

/**
 * 仕事のサーバ。handler が流したイベントは `events` に積む。
 * `report` が受け取った題は `titles` に、`question_brief` が預けた添え書きは `heldBriefs` に積む。
 */
function workServer(
  events: SessionEvent[] = [],
  titles: string[] = [],
  callReview: CallReview = createCallReview(),
  heldBriefs: (readonly QuestionBrief[])[] = [],
): McpSdkServerConfigWithInstance {
  return tsukumoServer(
    EXPRESSIONS,
    WORK_MODE,
    callReview,
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

/** `figure` と `sections` の両方に置ける塊と、`beforeAfter` の前後の側、svg の図形。`report` の schema の `definitions` に1回ずつ出る。 */
const SHARED_BLOCK_DEFINITIONS = [
  "BeforeAfterBlock",
  "BeforeAfterSide",
  "ChartBlock",
  "DimensionBlock",
  "GraphBlock",
  "ImageBlock",
  "MermaidBlock",
  "StatsBlock",
  "SvgBlock",
  "SvgShape",
]

/** 塊の定義が `figure` と `sections` に複製されていたとき（約3.0万字）に落ち、いまの形（約1.8万字）には余白を持たせた上限。 */
const REPORT_INPUT_SCHEMA_MAX_CHARS = 19_000

/** `tools/list` の応答のうち、引数の schema を丸ごと読む形。 */
const TOOLS_WHOLE_SCHEMA_REPLY = z.object({
  id: z.literal(1),
  result: z.object({
    tools: z.array(z.object({ name: z.string(), inputSchema: z.record(z.string(), z.unknown()) })),
  }),
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
