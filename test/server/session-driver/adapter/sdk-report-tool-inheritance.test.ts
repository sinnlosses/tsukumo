// `report` の差し戻しのあとの出し直し。handler が判定と題に使う値と、`CallReview.pass` が描く値が、
// どの経路（入力検査で落ちる・組んだ値が欠ける・判定で差し戻す・受け付ける）のあとも同じ土台から組まれることを確かめる。

import { describe, expect, it } from "vitest"

import type { ReportDraft } from "../../../../src/server/report/core/report-violation.ts"
import {
  type CallReview,
  createCallReview,
} from "../../../../src/server/session-driver/core/call-review.ts"
import { toSessionEvents } from "../../../../src/server/session-driver/core/sdk-message.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { callTool } from "../../../fixture/mcp-server.ts"
import { REJECTION_PHRASE } from "../../../fixture/report-review.ts"
import { assistantMessage, REPORT_TOOL_FULL_NAME } from "../../../fixture/sdk-message.ts"
import {
  CLOSING,
  FIGURE,
  REMAINING,
  SESSION_SUMMARY,
  WAITING_LINE,
  workServer,
} from "../../../fixture/sdk-tool.ts"

type ReportCalled = Extract<SessionEvent, { kind: "report" }>

const COMPLETE = {
  conclusion: ["架空の結論"],
  figure: FIGURE,
  favor: "架空のお願い",
  closing: CLOSING,
  sessionSummary: SESSION_SUMMARY,
  sessionRemaining: REMAINING,
  waitingLine: WAITING_LINE,
  title: "架空の題",
}
// conclusion が3要素以上（規約違反「冒頭の1〜2文で結論」）だと差し戻される。
const VIOLATING = {
  ...COMPLETE,
  conclusion: ["架空の一文目。", "架空の二文目。", "架空の三文目。"],
}

/** 本物の駆動と同じ並びで、1つのセッションに `report` を呼んでいく口。 */
function session() {
  const inner = createCallReview()
  const drafts: ReportDraft[] = []
  const titles: string[] = []
  const review: CallReview = {
    ...inner,
    judgeReport: (draft) => {
      drafts.push(draft)
      return inner.judgeReport(draft)
    },
  }
  let count = 0

  return {
    drafts,
    titles,
    review,
    /**
     * `assistant` メッセージの変換 → handler → 結果の順に流し、`pass` が描いた `report` を返す（描かなければ undefined）。
     * handler に届かない呼び出し（入力検査で落ちる）も、結果は `isError` で流れる。
     */
    call: async (input: Readonly<Record<string, unknown>>) => {
      count += 1
      const toolUseId = `toolu_r${String(count)}`
      const converted = toSessionEvents(
        assistantMessage([{ type: "tool_use", id: toolUseId, name: REPORT_TOOL_FULL_NAME, input }]),
        ["default"],
      )
      const before = converted.flatMap((event) => review.pass(event))
      const reply = await callTool(workServer([], titles, review), "report", input)
      const after = review.pass({
        kind: "tool-finished",
        toolUseId,
        content: reply.text,
        isError: reply.isError,
      })
      const drawn = [...before, ...after].find(
        (event): event is ReportCalled => event.kind === "report",
      )
      return { reply, drawn }
    },
  }
}

/** 判定に渡った下書きと、描いた `report` が同じ値か。 */
function expectJudgedAsDrawn(draft: ReportDraft | undefined, drawn: ReportCalled | undefined) {
  expect(drawn).toBeDefined()
  expect(draft).toMatchObject({
    conclusion: drawn?.conclusion,
    figure: drawn?.figure,
    sections: drawn?.sections,
    favor: drawn?.favor,
    checks: drawn?.checks,
    task: drawn?.task,
    workPlanClosing: drawn?.workPlanClosing,
  })
}

describe("report の差し戻しのあとの出し直し", () => {
  it("判定で差し戻したあと直す欄だけを渡すと、省いた欄を差し戻した値で埋めて判定・描画し、組んだ値の title を渡す", async () => {
    const live = session()

    const rejected = await live.call(VIOLATING)
    const resent = await live.call({ conclusion: ["架空の直した結論"] })

    expect(rejected.reply.isError).toBe(true)
    expect(resent.reply).toEqual({ text: "架空の直した結論", isError: false, endsTurn: true })
    expect(resent.drawn).toMatchObject({ conclusion: "架空の直した結論", favor: "架空のお願い" })
    expectJudgedAsDrawn(live.drafts.at(-1), resent.drawn)
    expect(live.titles).toEqual(["架空の題"])
  })

  it.each([
    { conclusion: VIOLATING.conclusion, chars: [6, 6, 6] },
    { conclusion: [`${"あ".repeat(40)}。`, `${"い".repeat(40)}。`], chars: [40, 40] },
  ])(
    "conclusion を省いた出し直しは、引き継いだ結論の要素ごとの字数で判定する: $chars",
    async ({ conclusion, chars }) => {
      const live = session()

      await live.call({
        ...COMPLETE,
        conclusion,
        sections: [{ blocks: [{ kind: "markdown", markdown: "- 架空の項目" }] }],
      })
      await live.call({ favor: "架空の直したお願い" })

      expect(live.drafts.map((draft) => draft.conclusionSentenceChars)).toEqual([chars, chars])
    },
  )

  it("conclusion を省いた出し直しの結果の文は、引き継いだ結論の1要素目になる", async () => {
    const live = session()

    await live.call({
      ...COMPLETE,
      conclusion: ["架空の結論A", "架空の補足B"],
      sections: [{ blocks: [{ kind: "markdown", markdown: "- 架空の項目" }] }],
    })
    const resent = await live.call({
      sections: [{ blocks: [{ kind: "text", text: "架空の本文。" }] }],
    })

    expect(resent.reply).toEqual({ text: "架空の結論A", isError: false, endsTurn: true })
  })

  it("入力検査で落ちて handler に届かなかった呼び出しも土台になり、判定と描画が同じ値を見る", async () => {
    const live = session()

    await live.call(VIOLATING)
    const unreached = await live.call({
      favor: "架空の二度目のお願い",
      closing: { text: "架空の締め", expression: "架空の表情" },
    })
    const resent = await live.call({ closing: CLOSING })

    expect(unreached.reply.isError).toBe(true)
    expect(live.drafts).toHaveLength(2)
    expect(resent.reply.isError).toBe(false)
    expect(resent.drawn?.favor).toBe("架空の二度目のお願い")
    expectJudgedAsDrawn(live.drafts.at(-1), resent.drawn)
  })

  it("土台が無いのに省けない欄を省いた呼び出しは判定せず isError で返し、そのあとの出し直しはその呼び出しを土台にする", async () => {
    const live = session()

    const missing = await live.call({ conclusion: ["架空の結論"], favor: "架空のお願い" })
    const resent = await live.call({
      figure: FIGURE,
      closing: CLOSING,
      sessionSummary: SESSION_SUMMARY,
      sessionRemaining: REMAINING,
      waitingLine: WAITING_LINE,
    })

    expect(missing.reply.isError).toBe(true)
    expect(missing.reply.text).toContain("closing")
    expect(missing.reply.text).not.toContain("figure")
    expect(live.drafts).toHaveLength(1)
    expect(resent.drawn).toMatchObject({ conclusion: "架空の結論", favor: "架空のお願い" })
    expectJudgedAsDrawn(live.drafts.at(-1), resent.drawn)
  })

  it("差し戻しが続けば、判定も描画もいちばん新しい差し戻しの組み上げ値を土台にする", async () => {
    const live = session()

    await live.call(VIOLATING)
    // 規約違反の枠は1ターン1回で2回目からは判定が通すので、続く2回は入力検査で落とす。
    await live.call({ favor: "架空の二度目", sections: [] })
    await live.call({ favor: "架空の三度目", closing: { text: "架空", expression: "架空の表情" } })
    const resent = await live.call({ conclusion: ["架空の直した結論"] })

    expect(resent.drawn?.favor).toBe("架空の三度目")
    expectJudgedAsDrawn(live.drafts.at(-1), resent.drawn)
  })

  it("空の値を渡した欄は引き継がずに上書きする", async () => {
    const live = session()

    await live.call(VIOLATING)
    const resent = await live.call({ conclusion: ["架空の結論"], favor: "" })

    expect(resent.drawn?.favor).toBe("")
    expectJudgedAsDrawn(live.drafts.at(-1), resent.drawn)
  })

  it("受け付けたあとは土台を捨て、次の呼び出しは省いた欄を引き継がない", async () => {
    const live = session()

    await live.call(VIOLATING)
    await live.call({ conclusion: ["架空の直した結論"] })
    const next = await live.call({ conclusion: ["架空の次の結論"] })

    expect(next.reply.isError).toBe(true)
    expect(next.drawn).toBeUndefined()
  })

  it("ターンの境目のイベントで土台を捨てる", async () => {
    const live = session()

    await live.call(VIOLATING)
    live.review.pass({ kind: "turn-finished", outcome: { kind: "completed" } })
    const next = await live.call({ conclusion: ["架空の直した結論"] })

    expect(next.reply.isError).toBe(true)
    expect(next.drawn).toBeUndefined()
  })

  it("送り直しの判定は組んだ値で比べる（省いた欄を埋めると描いた report と同じなら差し戻す）", async () => {
    const live = session()

    const accepted = await live.call(COMPLETE)
    // 描いたあと新しい事実が無いので、別の中身の呼び出しは「新しい事実が無い」で差し戻る。
    const nothingNew = await live.call({
      ...COMPLETE,
      conclusion: ["架空の別の結論"],
      favor: "架空の別のお願い",
    })
    const resent = await live.call({ conclusion: COMPLETE.conclusion, favor: COMPLETE.favor })

    expect(accepted.reply.isError).toBe(false)
    expect(nothingNew.reply.text).toContain(REJECTION_PHRASE.nothingNew)
    expect(resent.reply).toMatchObject({
      isError: true,
      text: expect.stringContaining(REJECTION_PHRASE.resend),
    })
  })
})
