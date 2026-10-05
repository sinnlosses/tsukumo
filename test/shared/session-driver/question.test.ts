import { describe, expect, it } from "vitest"

import {
  isRecommendedLabel,
  parseQuestions,
  sortQuestionOptions,
  type QuestionOption,
  withoutRecommendedMark,
} from "../../../src/shared/session-driver/question.ts"

describe("parseQuestions", () => {
  it("質問文・見出し・選択肢を取り出し、preview も運ぶ", () => {
    const input = {
      questions: [
        {
          header: "出す場所",
          question: "質問をどのビューに出す？",
          multiSelect: false,
          options: [
            { label: "メインビュー", description: "作業の記録として出す", preview: "| 案 | 差 |" },
            { label: "吹き出し", description: "キャラビューに出す", preview: undefined },
          ],
        },
      ],
    }

    const questions = parseQuestions(input)

    expect(questions).toEqual([
      {
        header: "出す場所",
        text: "質問をどのビューに出す？",
        multiSelect: false,
        options: [
          { label: "メインビュー", description: "作業の記録として出す", preview: "| 案 | 差 |" },
          { label: "吹き出し", description: "キャラビューに出す", preview: undefined },
        ],
      },
    ])
  })

  it("preview が文字列でない・空白だけのときは undefined に畳む", () => {
    const previewsOf = (preview: unknown) =>
      parseQuestions({
        questions: [{ header: "h", question: "q", options: [{ label: "l", preview }] }],
      })?.[0]?.options[0]?.preview

    expect(previewsOf(42)).toBeUndefined()
    expect(previewsOf("   ")).toBeUndefined()
    expect(previewsOf("# 見出し")).toBe("# 見出し")
  })

  it("multiSelect は true のときだけ true になる", () => {
    const of = (multiSelect: unknown) =>
      parseQuestions({
        questions: [{ header: "h", question: "q", multiSelect, options: [] }],
      })?.[0]?.multiSelect

    expect(of(true)).toBe(true)
    expect(of(false)).toBe(false)
    expect(of(undefined)).toBe(false)
    expect(of("true")).toBe(false)
  })

  it("形が違う質問・選択肢は、その要素だけ捨てる", () => {
    const questions = parseQuestions({
      questions: [
        {
          header: "h",
          question: "残る",
          options: [{ label: "残る選択肢" }, { label: 42 }, "壊れ"],
        },
        { header: "h", options: [] },
        "壊れた質問",
      ],
    })

    expect(questions).toHaveLength(1)
    expect(questions?.[0]?.text).toBe("残る")
    expect(questions?.[0]?.options).toEqual([
      { label: "残る選択肢", description: "", preview: undefined },
    ])
  })

  it("入力の形が違う・質問が1つも無いときは undefined", () => {
    expect(parseQuestions(undefined)).toBeUndefined()
    expect(parseQuestions({})).toBeUndefined()
    expect(parseQuestions({ questions: "まとも？" })).toBeUndefined()
    expect(parseQuestions({ questions: [] })).toBeUndefined()
    expect(parseQuestions({ questions: ["壊れ"] })).toBeUndefined()
  })
})

describe("sortQuestionOptions", () => {
  function option(label: string): QuestionOption {
    return { label, description: "", preview: undefined }
  }

  it("送られた順がアルファベット順でなくても、上からラベルの辞書順に並べ替える", () => {
    const sorted = sortQuestionOptions([option("C案"), option("A案"), option("B案")])

    expect(sorted.map((o) => o.label)).toEqual(["A案", "B案", "C案"])
  })

  it("自由入力（その他）は並べ替えに混ぜず、末尾に固定する", () => {
    const sorted = sortQuestionOptions([option("その他"), option("C案"), option("A案")])

    expect(sorted.map((o) => o.label)).toEqual(["A案", "C案", "その他"])
  })

  it("漢字のラベルは ja の並びに揃える（実行環境の既定ロケールに引きずられない）", () => {
    // 既定ロケールに任せると テストの環境（en-US）とブラウザ（ja）で並びが食い違う組み合わせ。
    const sorted = sortQuestionOptions([
      option("本文だけ（架空）"),
      option("見出しと質問文（架空）"),
      option("とても長いラベル（架空）"),
    ])

    expect(sorted.map((o) => o.label)).toEqual([
      "とても長いラベル（架空）",
      "見出しと質問文（架空）",
      "本文だけ（架空）",
    ])
  })

  it("おすすめの印が付いた選択肢を先に、残りをそれぞれ辞書順で並べる（自由入力は末尾のまま）", () => {
    const sorted = sortQuestionOptions([
      option("その他"),
      option("スクリプトを同梱する（架空）"),
      option("集計を移す（架空） (Recommended)"),
      option("見直しを出さない（架空）"),
    ])

    expect(sorted.map((o) => o.label)).toEqual([
      "集計を移す（架空） (Recommended)",
      "スクリプトを同梱する（架空）",
      "見直しを出さない（架空）",
      "その他",
    ])
  })

  it("日本語の（推奨）も、半角・全角の括弧のどちらでもおすすめの印として読む", () => {
    expect(isRecommendedLabel("A案 (推奨)")).toBe(true)
    expect(isRecommendedLabel("A案（推奨）")).toBe(true)
    expect(withoutRecommendedMark("A案（推奨）")).toBe("A案")
    expect(isRecommendedLabel("推奨の扱いを決める")).toBe(false)
  })
})
