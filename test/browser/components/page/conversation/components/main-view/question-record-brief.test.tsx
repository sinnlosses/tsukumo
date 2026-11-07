import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { QuestionRecord } from "../../../../../../../src/browser/components/page/conversation/components/main-view/question-record.tsx"
import { loadMarkdown } from "../../../../../../../src/browser/features/report/markdown.tsx"
import type { QuestionBrief } from "../../../../../../../src/shared/session-driver/question-brief.ts"
import type { MainViewQuestion } from "../../../../../../../src/shared/session/main-view-shape.ts"

const BRIEF_SUMMARY = "質問のときの詳細"

const BRIEF: QuestionBrief = {
  header: "確認",
  background: "架空の背景の文。",
  axes: ["速さ", "戻しやすさ"],
  options: [
    {
      label: "案A",
      pros: ["架空の良い点A。"],
      cons: [],
      byAxis: ["速い", "戻せる"],
      irreversible: false,
      figures: [],
    },
    {
      label: "案B",
      pros: [],
      cons: ["架空の悪い点B。"],
      byAxis: ["遅い", "戻せない"],
      irreversible: true,
      figures: [],
    },
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
    expect(screen.queryByText(/架空の背景の文/)).toBeNull()
  })

  it("開くと、背景・判断の軸・選択肢ごとの詳細・比べる表が出る", () => {
    const { container } = render(<QuestionRecord entry={entryOf({ briefs: [BRIEF] })} />)

    toggle(container, BRIEF_SUMMARY, true)

    expect(screen.getByText(/架空の背景の文/)).toBeDefined()
    expect(screen.getByText(/速さ \/ 戻しやすさ/)).toBeDefined()
    expect(screen.getByRole("group", { name: "案A の詳細" })).toBeDefined()
    expect(screen.getByRole("group", { name: "案B の詳細" })).toBeDefined()
    expect(screen.getByText("架空の良い点A。")).toBeDefined()
    expect(screen.getByText("架空の悪い点B。")).toBeDefined()
    expect(screen.getByText("並べて比べる")).toBeDefined()
  })

  it("1回開いたあと閉じても、中身は描いたまま", () => {
    const { container } = render(<QuestionRecord entry={entryOf({ briefs: [BRIEF] })} />)

    toggle(container, BRIEF_SUMMARY, true)
    toggle(container, BRIEF_SUMMARY, false)

    expect(screen.getByText(/架空の背景の文/)).toBeDefined()
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

    expect(screen.getByText(/架空の背景の文/)).toBeDefined()
    expect(summaryOf(container, "比べた内容").parentElement?.children).toHaveLength(1)
  })

  it("header の合わない添え書きは出さない", () => {
    const { container } = render(
      <QuestionRecord entry={entryOf({ briefs: [{ ...BRIEF, header: "別の見出し" }] })} />,
    )

    expect(container.querySelectorAll("summary")).toHaveLength(0)
  })
})
