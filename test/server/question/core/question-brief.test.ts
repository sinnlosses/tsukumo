import { describe, expect, it } from "vitest"

import {
  answerQuestionBriefCall,
  reviewQuestionBriefing,
} from "../../../../src/server/question/core/question-brief.ts"
import type { FigureBlock } from "../../../../src/shared/report/report-block.ts"
import type {
  QuestionBrief,
  QuestionBriefFact,
  QuestionBriefOption,
  QuestionBriefRecommended,
} from "../../../../src/shared/session-driver/question-brief.ts"
import type { Question } from "../../../../src/shared/session-driver/question.ts"

const FACT: QuestionBriefFact = { text: "架空の事実。", basis: "checked" }
const RECOMMENDED: QuestionBriefRecommended = { reason: "架空の勧める理由。", certainty: "high" }
const FIGURE: FigureBlock = {
  kind: "mermaid",
  title: "",
  source: "flowchart LR\n  W[架空の書き手] --> A[架空の置き場]",
  fold: "",
  aside: "",
}

function option(label: string, overrides: Partial<QuestionBriefOption> = {}): QuestionBriefOption {
  return {
    label,
    irreversible: false,
    figures: [],
    ...overrides,
  }
}

function brief(overrides: Partial<QuestionBrief> = {}): QuestionBrief {
  return {
    header: "架空の見出し",
    whyAsk: "架空の理由。利用者の好みが分からない。",
    facts: [FACT],
    options: [option("A案"), option("B案")],
    ...overrides,
  }
}

function question(header: string, labels: readonly string[]): Question {
  return {
    header,
    text: "架空の質問文",
    multiSelect: false,
    options: labels.map((label) => ({ label, description: "", preview: undefined })),
  }
}

describe("answerQuestionBriefCall", () => {
  it("形の揃った添え書きは預けて ok を返す", () => {
    const held: (readonly QuestionBrief[])[] = []
    const briefs = [brief()]

    const answer = answerQuestionBriefCall(briefs, (given) => held.push(given))

    expect(answer).toEqual({ text: "ok", isError: false })
    expect(held).toEqual([briefs])
  })

  it.each<readonly [string, readonly QuestionBrief[]]>([
    ["facts が1件", [brief({ facts: [FACT] })]],
    ["facts が5件", [brief({ facts: [FACT, FACT, FACT, FACT, FACT] })]],
    ["recommended の省略", [brief({ recommended: undefined })]],
    ["recommended の指定", [brief({ recommended: RECOMMENDED })]],
    [
      "選択肢の figures が2つ",
      [brief({ options: [option("A案", { figures: [FIGURE, FIGURE] }), option("B案")] })],
    ],
  ])("%s は差し戻さずに預ける", (_, briefs) => {
    const held: (readonly QuestionBrief[])[] = []

    const answer = answerQuestionBriefCall(briefs, (given) => held.push(given))

    expect(answer).toEqual({ text: "ok", isError: false })
    expect(held).toEqual([briefs])
  })

  it.each<readonly [string, readonly QuestionBrief[], string]>([
    ["空白だけの whyAsk", [brief({ whyAsk: " 　" })], "whyAsk"],
    ["facts が0件", [brief({ facts: [] })], "facts は1〜5件"],
    ["facts が6件", [brief({ facts: [FACT, FACT, FACT, FACT, FACT, FACT] })], "facts は1〜5件"],
    ["facts の空の text", [brief({ facts: [{ ...FACT, text: " " }] })], "facts に空の text"],
    [
      "recommended の空の reason",
      [brief({ recommended: { ...RECOMMENDED, reason: " " } })],
      "recommended の reason",
    ],
    [
      "選択肢の figures が3つ",
      [brief({ options: [option("A案", { figures: [FIGURE, FIGURE, FIGURE] }), option("B案")] })],
      "選択肢「A案」のfigures は2つまで",
    ],
  ])("%s は預けず、header と欄の名前で直す箇所を言って差し戻す", (_, briefs, field) => {
    const held: (readonly QuestionBrief[])[] = []

    const answer = answerQuestionBriefCall(briefs, (given) => held.push(given))

    expect(answer.isError).toBe(true)
    expect(answer.text).toContain(`「架空の見出し」の${field}`)
    expect(held).toEqual([])
  })

  it.each<readonly [string, readonly QuestionBrief[]]>([
    ["質問が0件", []],
    ["質問が5件", ["1", "2", "3", "4", "5"].map((header) => brief({ header }))],
    ["header の重なり", [brief(), brief()]],
    ["空の header", [brief({ header: " " })]],
    ["選択肢が1件", [brief({ options: [option("A案")] })]],
    ["label の重なり", [brief({ options: [option("A案"), option("A案")] })]],
  ])("%s は預けずに理由つきで差し戻す", (_, briefs) => {
    const held: (readonly QuestionBrief[])[] = []

    const answer = answerQuestionBriefCall(briefs, (given) => held.push(given))

    expect(answer.isError).toBe(true)
    expect(held).toEqual([])
  })
})

describe("reviewQuestionBriefing", () => {
  it("header と label の集合が合えば添え書きを載せる", () => {
    const briefs = [brief()]

    expect(reviewQuestionBriefing([question("架空の見出し", ["B案", "A案"])], briefs)).toEqual({
      kind: "accepted",
      briefs,
    })
  })

  it("おすすめの印と自由入力の選択肢を除いて突き合わせる", () => {
    const questions = [question("架空の見出し", ["A案 (推奨)", "B案", "その他"])]

    expect(reviewQuestionBriefing(questions, [brief({ recommended: RECOMMENDED })]).kind).toBe(
      "accepted",
    )
  })

  it.each<readonly [string, string, QuestionBrief, string]>([
    ["印があり recommended が無い", "A案 (推奨)", brief(), "recommended が無い"],
    [
      "印が無く recommended がある",
      "A案",
      brief({ recommended: RECOMMENDED }),
      "recommended を外す",
    ],
  ])("%s と、header と欠けている側だけを言って断る", (_, firstLabel, given, expected) => {
    const result = reviewQuestionBriefing([question("架空の見出し", [firstLabel, "B案"])], [given])

    expect(result.kind).toBe("rejected")
    const message = result.kind === "rejected" ? result.message : ""
    expect(message).toContain("「架空の見出し」")
    expect(message).toContain(expected)
    for (const secret of ["A案", "B案", "架空の勧める理由", "架空の質問文"]) {
      expect(message).not.toContain(secret)
    }
  })

  it("印の有る無しと recommended の有る無しが揃っていれば、印が無くても載せる", () => {
    const questions = [question("架空の見出し", ["A案", "B案"])]

    expect(reviewQuestionBriefing(questions, [brief()]).kind).toBe("accepted")
  })

  it("選択肢が1つの質問では、印と recommended が合わない添え書きを断らず捨てる", () => {
    const questions = [question("架空の見出し", ["A案 (推奨)"])]

    expect(reviewQuestionBriefing(questions, [brief()])).toEqual({ kind: "accepted", briefs: [] })
  })

  it("header が質問に当たらなければ断る", () => {
    const result = reviewQuestionBriefing([question("別の見出し", ["A案", "B案"])], [brief()])

    expect(result.kind).toBe("rejected")
  })

  it("label の集合が質問と違えば、足りない数と余る数だけを言って断る", () => {
    const result = reviewQuestionBriefing([question("架空の見出し", ["A案", "C案"])], [brief()])

    expect(result.kind).toBe("rejected")
    const message = result.kind === "rejected" ? result.message : ""
    expect(message).toContain("足りない1個・余る1個")
    expect(message).not.toContain("C案")
  })

  it("添え書きが無ければ、header を挙げて断る", () => {
    const result = reviewQuestionBriefing([question("架空の見出し", ["A案", "B案"])], [])

    expect(result.kind).toBe("rejected")
    expect(result.kind === "rejected" ? result.message : "").toContain("「架空の見出し」")
  })

  it("選択肢が1つの質問は添え書きが無くても積み、合わない添え書きは捨てる", () => {
    const questions = [question("架空の見出し", ["A案"])]

    expect(reviewQuestionBriefing(questions, [])).toEqual({ kind: "accepted", briefs: [] })
    expect(reviewQuestionBriefing(questions, [brief()])).toEqual({ kind: "accepted", briefs: [] })
  })
})
