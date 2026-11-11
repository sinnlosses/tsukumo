import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { QuestionRecord } from "../../../../../../../src/browser/components/page/conversation/components/main-view/question-record.tsx"
import { loadMarkdown } from "../../../../../../../src/browser/features/report/markdown.tsx"
import type { QuestionBrief } from "../../../../../../../src/shared/session-driver/question-brief.ts"
import type { MainViewQuestion } from "../../../../../../../src/shared/session/main-view-shape.ts"

const BRIEF_SUMMARY = "質問のときの詳細"

const BRIEF: QuestionBrief = {
  header: "確認",
  whyAsk: "架空の聞く理由の文。",
  facts: [
    { text: "架空の数の話。", basis: "checked" },
    { text: "架空の本文の話。", basis: "copied" },
  ],
  recommended: { reason: "架空の根拠の文。", certainty: "low" },
  options: [
    { label: "案A", irreversible: false, figures: [] },
    { label: "案B", irreversible: true, figures: [] },
  ],
}

function entryOf(overrides: Partial<MainViewQuestion>): MainViewQuestion {
  return {
    kind: "question",
    toolUseId: "toolu_fictional",
    questions: [
      {
        header: "確認",
        text: "どちらにする？",
        multiSelect: false,
        options: [
          { label: "案A", description: "", preview: undefined },
          { label: "案B", description: "", preview: undefined },
        ],
      },
    ],
    answers: [["案B"]],
    briefs: [],
    imageSizes: [],
    unshelvedImages: [],
    ...overrides,
  }
}

function summaryOf(container: HTMLElement, text: string): HTMLElement {
  const summary = [...container.querySelectorAll("summary")].find(
    (candidate) => candidate.textContent === text,
  )
  if (summary === undefined) {
    throw new Error(`${text} の畳みが無い`)
  }
  return summary
}

function toggle(container: HTMLElement, text: string, open: boolean): void {
  const details = summaryOf(container, text).parentElement
  if (!(details instanceof HTMLDetailsElement)) {
    throw new Error("details が無い")
  }
  act(() => {
    details.open = open
    details.dispatchEvent(new Event("toggle"))
  })
}

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

describe("QuestionRecord（質問のときの詳細）", () => {
  it("添え書きの無い問は畳みの行を足さない", () => {
    const { container } = render(<QuestionRecord entry={entryOf({})} />)

    expect(container.querySelectorAll("summary")).toHaveLength(0)
  })

  it("添え書きのある問は畳みの行が1つ増え、開くまで中身を描かない", () => {
    const { container } = render(<QuestionRecord entry={entryOf({ briefs: [BRIEF] })} />)

    expect(container.querySelectorAll("summary")).toHaveLength(1)
    expect(summaryOf(container, BRIEF_SUMMARY)).toBeDefined()
    expect(screen.queryByText(/架空の聞く理由の文/)).toBeNull()
  })

  it("開くと、聞く理由と、説明か図か preview を持つ選択肢ごとの詳細が出て、比べる表は出ない", () => {
    const entry = entryOf({
      briefs: [BRIEF],
      questions: [
        {
          header: "確認",
          text: "どちらにする？",
          multiSelect: false,
          options: [
            { label: "案A", description: "架空の説明A", preview: undefined },
            { label: "案B", description: "架空の説明B", preview: undefined },
          ],
        },
      ],
    })
    const { container } = render(<QuestionRecord entry={entry} />)

    toggle(container, BRIEF_SUMMARY, true)

    expect(screen.getByText(/架空の聞く理由の文/)).toBeDefined()
    expect(screen.getByRole("group", { name: "案A の詳細" })).toBeDefined()
    expect(screen.getByRole("group", { name: "案B の詳細" })).toBeDefined()
    expect(container.querySelector("details table")).toBeNull()
  })

  it("開くと、聞く理由 → 事実（出どころの印つき）→ おすすめの理由と確度 → 選択肢ごとの詳細の順に出す", () => {
    const entry = entryOf({
      briefs: [BRIEF],
      questions: [
        {
          header: "確認",
          text: "どちらにする？",
          multiSelect: false,
          options: [
            { label: "案A", description: "架空の説明A", preview: undefined },
            { label: "案B", description: "", preview: undefined },
          ],
        },
      ],
    })
    const { container } = render(<QuestionRecord entry={entry} />)

    toggle(container, BRIEF_SUMMARY, true)

    const text = summaryOf(container, BRIEF_SUMMARY).parentElement?.textContent ?? ""
    const positions = [
      "聞く理由",
      "事実",
      "確かめた",
      "写した",
      "おすすめの理由",
      "確度 低",
      "架空の根拠の文",
      "案A の詳細",
    ].map((part) => text.indexOf(part))
    expect(positions).toEqual(positions.toSorted((a, b) => a - b))
    expect(positions.every((position) => position >= 0)).toBe(true)
  })

  it("1回開いたあと閉じても、中身は描いたまま", () => {
    const { container } = render(<QuestionRecord entry={entryOf({ briefs: [BRIEF] })} />)

    toggle(container, BRIEF_SUMMARY, true)
    toggle(container, BRIEF_SUMMARY, false)

    expect(screen.getByText(/架空の聞く理由の文/)).toBeDefined()
  })

  it("比べた内容の畳みとは独立に開閉する", () => {
    const entry = entryOf({
      briefs: [BRIEF],
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
    })
    const { container } = render(<QuestionRecord entry={entry} />)

    toggle(container, BRIEF_SUMMARY, true)

    expect(screen.getByText(/架空の聞く理由の文/)).toBeDefined()
    expect(summaryOf(container, "比べた内容").parentElement?.children).toHaveLength(1)
  })

  it("header の合わない添え書きは出さない", () => {
    const { container } = render(
      <QuestionRecord entry={entryOf({ briefs: [{ ...BRIEF, header: "別の見出し" }] })} />,
    )

    expect(container.querySelectorAll("summary")).toHaveLength(0)
  })
})
