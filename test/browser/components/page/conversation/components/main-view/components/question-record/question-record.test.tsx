// 色そのものはテストしない（`CLAUDE.md`「見た目（色・崩れ）は目視で確かめる」）。
// 差し色が当たる側の class を持つことまでを測る。

import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { QuestionRecord } from "../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/question-record/question-record.tsx"
import { TEXT_TONE_CLASS } from "../../../../../../../../../src/browser/components/ui/text/text.tsx"
import type { MainViewQuestion } from "../../../../../../../../../src/shared/session/main-view.ts"

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
})

describe("QuestionRecord（答えの突き合わせ）", () => {
  function optionTexts(container: HTMLElement): readonly (string | null)[] {
    return [...container.querySelectorAll(".question-option")].map((option) => option.textContent)
  }

  it("複数選択の答えは、選んだ選択肢すべてに ■ が付き、選ばなかった選択肢は □ になる", () => {
    const entry: MainViewQuestion = {
      kind: "question",
      questions: [
        {
          ...multiSelectQuestion("確認", "どれを試す？"),
          options: ["案A", "案B", "案C"].map((label) => ({
            label,
            description: "",
            preview: undefined,
          })),
        },
      ],
      answers: [["案A", "案C"]],
    }

    const { container } = render(<QuestionRecord entry={entry} />)

    const chosen = [...container.querySelectorAll(".question-option.is-chosen")].map(
      (option) => option.textContent,
    )
    expect(chosen).toEqual(["■ 案A", "■ 案C"])
    expect(optionTexts(container)).toEqual(["■ 案A", "□ 案B", "■ 案C"])
  })

  it("自由入力の答えは、選択肢の下に別の行で出る", () => {
    const entry: MainViewQuestion = {
      kind: "question",
      questions: [question("確認", "どちらにする？")],
      answers: [["どちらでもない架空の答え"]],
    }

    const { container } = render(<QuestionRecord entry={entry} />)

    expect(optionTexts(container)).toEqual([
      "○ 案A",
      "○ 案B",
      "● どちらでもない架空の答え（自由入力）",
    ])
    expect(container.querySelector(".question-option.is-free-text")).not.toBeNull()
  })

  it("選択肢は送られた順ではなくラベルの辞書順で出す（並べ替えても答えの印は崩れない）", () => {
    const entry: MainViewQuestion = {
      kind: "question",
      questions: [
        {
          ...question("確認", "どれにする？"),
          options: ["案C", "案A", "案B"].map((label) => ({
            label,
            description: "",
            preview: undefined,
          })),
        },
      ],
      answers: [["案B"]],
    }

    const { container } = render(<QuestionRecord entry={entry} />)

    expect(optionTexts(container)).toEqual(["○ 案A", "● 案B", "○ 案C"])
    expect(container.querySelector(".question-option.is-chosen")?.textContent).toBe("● 案B")
  })

  it("質問が2件あると、答えは質問ごとに突き合わせる", () => {
    const entry: MainViewQuestion = {
      kind: "question",
      questions: [
        question("確認1", "1つ目は？"),
        {
          ...question("確認2", "2つ目は？"),
          options: ["案A", "案C"].map((label) => ({ label, description: "", preview: undefined })),
        },
      ],
      answers: [["案B"], ["案A"]],
    }

    const { container } = render(<QuestionRecord entry={entry} />)

    const records = [...container.querySelectorAll(".question-record")]
    expect(
      records.map((record) => record.querySelector(".question-option.is-chosen")?.textContent),
    ).toEqual(["● 案B", "● 案A"])
  })
})

describe("QuestionRecord（残す preview）", () => {
  function entryWithPreview(): MainViewQuestion {
    return {
      kind: "question",
      questions: [
        {
          ...question("確認", "どちらにする？"),
          options: [
            { label: "案A", description: "", preview: "### 案Aの下書き" },
            { label: "案B", description: "", preview: "### 案Bの下書き" },
          ],
        },
      ],
      answers: [["案B"]],
    }
  }

  function openDetails(container: HTMLElement): void {
    const details = container.querySelector("details")
    if (details === null) {
      throw new Error("折りたたみが無い")
    }
    act(() => {
      details.open = true
      details.dispatchEvent(new Event("toggle"))
    })
  }

  it("preview を持つ選択肢が無ければ、折りたたみを作らない", () => {
    const entry: MainViewQuestion = {
      kind: "question",
      questions: [question("確認", "どちらにする？")],
      answers: [["案B"]],
    }

    const { container } = render(<QuestionRecord entry={entry} />)

    expect(container.querySelector("details")).toBeNull()
  })

  it("preview は折りたたまれていて、開くまで描かない", () => {
    const { container } = render(<QuestionRecord entry={entryWithPreview()} />)

    expect(container.querySelector("details")?.open).toBe(false)
    expect(screen.queryByText("案Aの下書き")).toBeNull()
  })

  it("開くと、選択肢ごとの preview が Markdown として出て、札に選ばれた答えの印が付く", () => {
    const { container } = render(<QuestionRecord entry={entryWithPreview()} />)

    openDetails(container)

    // `###` はレポートと同じ段下げで `h5` になる（`SubHeading`）。
    expect(screen.getByText("案Aの下書き").tagName).toBe("H5")
    expect(screen.getByText("案Bの下書き").tagName).toBe("H5")
    const labels = [...container.querySelectorAll(".question-preview-label")].map(
      (label) => label.textContent,
    )
    expect(labels).toEqual(["○ 案A", "● 案B"])
  })
})
