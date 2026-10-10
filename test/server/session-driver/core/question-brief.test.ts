import { describe, expect, it } from "vitest"

import {
  answerQuestionBriefCall,
  briefedQuestions,
  mermaidSourcesOf,
  reviewQuestionBriefing,
} from "../../../../src/server/session-driver/core/question-brief.ts"
import type { FigureBlock } from "../../../../src/shared/report/report-block.ts"
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

    const answer = answerQuestionBriefCall(briefs, [], (given) => held.push(given))

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

    const answer = answerQuestionBriefCall(briefs, [], (given) => held.push(given))

    expect(answer.isError).toBe(true)
    expect(held).toEqual([])
  })

  it("割れた mermaid の図は位置と字句の名前だけを添えて、預けずに差し戻す", () => {
    const held: (readonly QuestionBrief[])[] = []
    const briefs = [brief()]

    const answer = answerQuestionBriefCall(
      briefs,
      [{ kind: "located", block: 1, line: 2, token: "架空の字句" }],
      (given) => held.push(given),
    )

    expect(answer.isError).toBe(true)
    expect(answer.text).toContain("1個目の 2 行目・字句 架空の字句")
    expect(held).toEqual([])
  })
})

describe("mermaidSourcesOf", () => {
  it("figures の mermaid の塊のソースだけを、質問・選択肢の並びで返す", () => {
    const mermaid = (source: string): FigureBlock => ({
      kind: "mermaid",
      title: "",
      source,
      fold: "",
    })
    const sources = mermaidSourcesOf([
      brief({
        options: [
          option("A案", {
            figures: [mermaid("架空の図1"), { kind: "list", style: "bullet", items: [], fold: "" }],
          }),
          option("B案", { figures: [mermaid("架空の図2")] }),
        ],
      }),
    ])

    expect(sources).toEqual(["架空の図1", "架空の図2"])
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

    expect(reviewQuestionBriefing(questions, [brief()]).kind).toBe("accepted")
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

describe("briefedQuestions", () => {
  it("質問ごとに、header の合う添え書きがあるかを並びのまま返す", () => {
    const questions = [question("架空の見出し", ["A案", "B案"]), question("別の見出し", ["C案"])]

    expect(briefedQuestions(questions, [brief()])).toEqual([true, false])
  })
})
