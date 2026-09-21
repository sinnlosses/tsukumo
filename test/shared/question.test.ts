import { describe, expect, it } from "bun:test"

import { parseQuestions } from "../../src/shared/question.ts"

// 手で書いた架空の質問。実物の会話は使わない（docs/coding-standards.md「会話内容の扱い」）。

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
