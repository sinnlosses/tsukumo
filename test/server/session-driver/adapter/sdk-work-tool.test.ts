import { describe, expect, it } from "vitest"

import {
  type CallReview,
  createCallReview,
} from "../../../../src/server/session-driver/core/call-review.ts"
import { toSessionEvents } from "../../../../src/server/session-driver/core/sdk-message.ts"
import type { QuestionBrief } from "../../../../src/shared/session-driver/question-brief.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { callTool } from "../../../fixture/mcp-server.ts"
import { WORK_PLAN_TOOL_FULL_NAME } from "../../../fixture/sdk-message.ts"
import { workServer } from "../../../fixture/sdk-tool.ts"

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
                {
                  kind: "mermaid",
                  title: "",
                  source: "sequenceDiagram\n  A ->> B: x",
                  fold: "",
                  aside: "",
                },
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

describe("work_plan（ワークプラン）", () => {
  it("段の並びと位置を渡すと ok が返り、ターンは閉じない", async () => {
    const review = createCallReview()
    await callTool(workServer([], [], review), "work_plan", {
      phases: ["架空の段A", "架空の段B"],
      current: 0,
    })
    const reply = await callTool(workServer([], [], review), "work_plan", {
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
      "ok\n帯の今の段は 本 1/2 架空の実装A。帯は範囲の前（前）・範囲（本）・範囲の後ろ（後）の群ごとに1から数え、本の番号は委譲先の段の番号と同じ。セリフで番号を言うのは本の段だけで、前・後の段は名前で言う。\n委譲先の段の範囲: first=1 count=2",
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
    const review = createCallReview()
    await callTool(workServer([], [], review), "work_plan", {
      phases: ["架空の段A", "架空の段B"],
      current: 0,
    })
    const withSummary = await callTool(workServer([], [], review), "work_plan", {
      phases: ["架空の段A", "架空の段B"],
      current: 1,
      phaseSummary: "架空のまとめ。",
    })
    const withoutSummary = await callTool(workServer([], [], review), "work_plan", {
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

  it("並列の段と finishedInGroup は形の検査を通り、1段だけの並列の段は落ちる", async () => {
    const review = createCallReview()
    await callTool(workServer([], [], review), "work_plan", {
      phases: ["架空の段A", ["架空の段B", "架空の段C"]],
      current: 0,
    })
    await callTool(workServer([], [], review), "work_plan", {
      phases: ["架空の段A", ["架空の段B", "架空の段C"]],
      current: 1,
      phaseSummary: "架空のまとめ。",
    })
    const grouped = await callTool(workServer([], [], review), "work_plan", {
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

  it("段が1つだけのワークプランは受け付ける", async () => {
    const single = await callTool(workServer(), "work_plan", { phases: ["架空の段A"], current: 0 })

    expect(single).toMatchObject({ isError: false, endsTurn: false })
  })

  it("段が0・空白だけの名前のワークプランは形の検査で落ちる", async () => {
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
      name: "並列の段の途中",
      input: {
        phases: ["架空の段A", ["架空の段B", "架空の段C"]],
        current: 1,
        finishedInGroup: ["架空の段C"],
        phaseSummary: "架空のまとめ。",
        delegatedRange: { first: 0, count: 1 },
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
      name: "並列の段の中の名前の重なり",
      input: { phases: [["架空の段A", "架空の段A"]], current: 0 },
    },
    {
      name: "並列の段の中の段を全部済んだと渡す",
      input: {
        phases: [["架空の段A", "架空の段B"], "架空の段C"],
        current: 0,
        finishedInGroup: ["架空の段A", "架空の段B"],
      },
    },
    {
      name: "まとめが3文",
      input: {
        phases: ["架空の段A", "架空の段B"],
        current: 1,
        phaseSummary: "一。二。三。",
        delegatedRange: { first: 1, count: 1 },
      },
    },
    {
      name: "範囲が並列の段をまたぐ",
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
