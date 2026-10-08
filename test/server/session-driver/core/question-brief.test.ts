import { describe, expect, it } from "vitest"

import {
  answerQuestionBriefCall,
  pairQuestionBrief,
} from "../../../../src/server/session-driver/core/question-brief.ts"
import type {
  QuestionBrief,
  QuestionBriefOption,
} from "../../../../src/shared/session-driver/question-brief.ts"
import type { Question } from "../../../../src/shared/session-driver/question.ts"

function option(label: string, overrides: Partial<QuestionBriefOption> = {}): QuestionBriefOption {
  return {
    label,
    pros: ["架空の良い点。"],
    cons: ["架空の悪い点。"],
    byAxis: ["速い", "戻せる"],
    irreversible: false,
    figures: [],
    ...overrides,
  }
}

function brief(overrides: Partial<QuestionBrief> = {}): QuestionBrief {
  return {
    header: "架空の見出し",
    background: "架空の背景の1文目。架空の背景の2文目。",
    axes: ["速さ", "戻しやすさ"],
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
    ["質問が0件", []],
    ["質問が5件", ["1", "2", "3", "4", "5"].map((header) => brief({ header }))],
    ["header の重なり", [brief(), brief()]],
    ["空の header", [brief({ header: " " })]],
    ["空の背景", [brief({ background: " " })]],
    ["4文の背景", [brief({ background: "架空の1。架空の2。架空の3。架空の4。" })]],
    [
      "軸が0個",
      [
        brief({
          axes: [],
          options: [option("A案", { byAxis: [] }), option("B案", { byAxis: [] })],
        }),
      ],
    ],
    ["軸の重なり", [brief({ axes: ["速さ", "速さ"] })]],
    ["選択肢が1件", [brief({ options: [option("A案")] })]],
    ["label の重なり", [brief({ options: [option("A案"), option("A案")] })]],
    [
      "byAxis の数が軸と違う",
      [brief({ options: [option("A案", { byAxis: ["速い"] }), option("B案")] })],
    ],
    [
      "良い点も悪い点も無い",
      [brief({ options: [option("A案", { pros: [], cons: [] }), option("B案")] })],
    ],
  ])("%s は預けずに理由つきで差し戻す", (_, briefs) => {
    const held: (readonly QuestionBrief[])[] = []

    const answer = answerQuestionBriefCall(briefs, (given) => held.push(given))

    expect(answer.isError).toBe(true)
    expect(held).toEqual([])
  })
})

describe("pairQuestionBrief", () => {
  it("header と label の集合が合えば添え書きを載せる", () => {
    const briefs = [brief()]

    expect(pairQuestionBrief([question("架空の見出し", ["B案", "A案"])], briefs)).toEqual({
      kind: "paired",
      briefs,
    })
  })

  it("おすすめの印と自由入力の選択肢を除いて突き合わせる", () => {
    const questions = [question("架空の見出し", ["A案 (推奨)", "B案", "その他"])]

    expect(pairQuestionBrief(questions, [brief()]).kind).toBe("paired")
  })

  it("header が質問に当たらなければ理由を返す", () => {
    const result = pairQuestionBrief([question("別の見出し", ["A案", "B案"])], [brief()])

    expect(result.kind).toBe("mismatched")
  })

  it("label の集合が質問と違えば、足りないものと余るものを理由にする", () => {
    const result = pairQuestionBrief([question("架空の見出し", ["A案", "C案"])], [brief()])

    expect(result).toEqual({
      kind: "mismatched",
      reasons: [
        "「架空の見出し」の選択肢「C案」に添え書きが無い",
        "「架空の見出し」の添え書きの「B案」が質問の選択肢に無い",
      ],
    })
  })
})
