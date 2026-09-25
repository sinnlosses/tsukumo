// 質問の記録（`question-record.tsx`）の2点だけを測る。既存の振る舞い（並び順・自由入力・
// preview の折りたたみなど）は main-view.test.tsx の `describe("MainView（質問の記録）")` が
// 持っているので、ここでは触らない。
//
// **色そのものはテストしない**（`CLAUDE.md`「見た目（色・崩れ）は目視で確かめる」）。
// 差し色が当たる側の class を持つこと、区切りが成り立つ DOM 構造になっていることまでを測る。

import { afterEach, describe, expect, it } from "bun:test"

import { act, cleanup, render } from "@testing-library/react"

import { QuestionRecord } from "../../../../../../src/browser/components/page/conversation/main-view/question-record.tsx"
import { TEXT_TONE_CLASS } from "../../../../../../src/browser/components/ui/text/text.tsx"
import { type MainViewQuestion } from "../../../../../../src/shared/main-view.ts"

/** 印（●/○/■/□）は `<QuestionMark>` が描く、`.question-option` / `.question-preview-label` の
 * 直下の唯一の `<span>`（`Text`）。選んだ側だけ `TEXT_TONE_CLASS.accent` を持つ。 */
const ACCENT_CLASS = TEXT_TONE_CLASS.accent
if (ACCENT_CLASS === undefined) {
  throw new Error("TEXT_TONE_CLASS.accent が無い")
}

afterEach(() => {
  cleanup()
})

function question(header: string, text: string): MainViewQuestion["questions"][number] {
  return {
    header,
    text,
    multiSelect: false,
    options: [
      { label: "案A", description: "", preview: undefined },
      { label: "案B", description: "", preview: undefined },
    ],
  }
}

function multiSelectQuestion(header: string, text: string): MainViewQuestion["questions"][number] {
  return { ...question(header, text), multiSelect: true }
}

describe("QuestionRecord（選んだ印の色）", () => {
  it("選んだ ● は差し色を当てる class を持ち、文字は DOM に残る", () => {
    const entry: MainViewQuestion = {
      kind: "question",
      questions: [question("確認", "どちらにする？")],
      answers: [["案B"]],
    }

    const { container } = render(<QuestionRecord entry={entry} />)

    const marks = [...container.querySelectorAll(".question-option > span")]
    const chosenMark = marks.find((mark) => mark.textContent === "●")
    const unchosenMark = marks.find((mark) => mark.textContent === "○")

    expect(chosenMark?.className.split(" ")).toContain(ACCENT_CLASS)
    expect(unchosenMark?.className.split(" ")).not.toContain(ACCENT_CLASS)
  })

  it("選ばなかった ○ には差し色の class を付けない（差し色は選んだ側だけ）", () => {
    const entry: MainViewQuestion = {
      kind: "question",
      questions: [question("確認", "どちらにする？")],
      answers: [[]],
    }

    const { container } = render(<QuestionRecord entry={entry} />)

    const marks = [...container.querySelectorAll(".question-option > span")]
    expect(marks.some((mark) => mark.className.split(" ").includes(ACCENT_CLASS))).toBe(false)
  })

  it("開いた preview の札にも同じ印の class が付く", () => {
    const entry: MainViewQuestion = {
      kind: "question",
      questions: [
        {
          header: "確認",
          text: "どちらにする？",
          multiSelect: false,
          options: [
            { label: "案A", description: "", preview: "### 案Aの下書き" },
            { label: "案B", description: "", preview: "### 案Bの下書き" },
          ],
        },
      ],
      answers: [["案B"]],
    }

    const { container } = render(<QuestionRecord entry={entry} />)
    const details = container.querySelector("details")
    if (details === null) {
      throw new Error("折りたたみが無い")
    }
    act(() => {
      details.open = true
      details.dispatchEvent(new Event("toggle"))
    })

    const label = [...container.querySelectorAll(".question-preview-label")].find((element) =>
      element.textContent?.includes("案B"),
    )
    const mark = label?.querySelector("span")
    expect(mark?.className.split(" ")).toContain(ACCENT_CLASS)
  })
})

describe("QuestionRecord（単一選択と複数選択で印が変わる）", () => {
  it("複数選択の質問は、選択肢の行で ■/□ を出す（●/○ ではない）", () => {
    const entry: MainViewQuestion = {
      kind: "question",
      questions: [multiSelectQuestion("確認", "どれにする？")],
      answers: [["案B"]],
    }

    const { container } = render(<QuestionRecord entry={entry} />)

    const marks = [...container.querySelectorAll(".question-option > span")].map(
      (mark) => mark.textContent,
    )
    expect(marks).toEqual(["□", "■"])
  })

  it("複数選択の preview の札でも ■/□ を出す", () => {
    const entry: MainViewQuestion = {
      kind: "question",
      questions: [
        {
          header: "確認",
          text: "どれにする？",
          multiSelect: true,
          options: [
            { label: "案A", description: "", preview: "### 案Aの下書き" },
            { label: "案B", description: "", preview: "### 案Bの下書き" },
          ],
        },
      ],
      answers: [["案B"]],
    }

    const { container } = render(<QuestionRecord entry={entry} />)
    const details = container.querySelector("details")
    if (details === null) {
      throw new Error("折りたたみが無い")
    }
    act(() => {
      details.open = true
      details.dispatchEvent(new Event("toggle"))
    })

    const marks = [...container.querySelectorAll(".question-preview-label > span")].map(
      (mark) => mark.textContent,
    )
    expect(marks).toEqual(["□", "■"])
  })

  it("単一選択の質問は、複数選択と混ざっていても ●/○ のまま", () => {
    const entry: MainViewQuestion = {
      kind: "question",
      questions: [question("確認", "どちらにする？")],
      answers: [["案B"]],
    }

    const { container } = render(<QuestionRecord entry={entry} />)

    const marks = [...container.querySelectorAll(".question-option > span")].map(
      (mark) => mark.textContent,
    )
    expect(marks).toEqual(["○", "●"])
  })
})

describe("QuestionRecord（問と答えの塊の区切り）", () => {
  it("質問が1件だけなら、区切りの対象になる兄弟が無い", () => {
    const entry: MainViewQuestion = {
      kind: "question",
      questions: [question("確認", "どちらにする？")],
      answers: [["案A"]],
    }

    const { container } = render(<QuestionRecord entry={entry} />)

    expect(container.querySelectorAll(".question-record + .question-record")).toHaveLength(0)
  })

  it("質問が2件以上なら、2つ目以降の塊が直前の塊と隣り合う（区切りの罫線が掛かる構造）", () => {
    const entry: MainViewQuestion = {
      kind: "question",
      questions: [question("確認1", "1つ目は？"), question("確認2", "2つ目は？")],
      answers: [["案A"], ["案B"]],
    }

    const { container } = render(<QuestionRecord entry={entry} />)

    const records = [...container.querySelectorAll(".question-record")]
    expect(records).toHaveLength(2)
    expect(container.querySelectorAll(".question-record + .question-record")).toHaveLength(1)
  })
})
