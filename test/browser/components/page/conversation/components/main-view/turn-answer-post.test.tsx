import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type {
  MainViewQuestion,
  MainViewReportBody,
} from "../../../../../../../src/shared/session/main-view-shape.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { bodyTextOf } from "../../../../../../fixture/main-view-entry.ts"
import { step, turn, turnBodyText } from "../../../../../../fixture/turn.ts"
import { typedElement } from "../../../../../../typed-element.ts"
import { putSession } from "../../../../../session-store.ts"

vi.mock("../../../../../../../src/browser/features/report/report.tsx", () => ({
  Report: (props: { readonly body: MainViewReportBody }) => <div>{bodyTextOf(props.body)}</div>,
}))

const { Turn } =
  await import("../../../../../../../src/browser/components/page/conversation/components/main-view/turn.tsx")

afterEach(() => {
  cleanup()
})

function asked(id: number): MainViewQuestion {
  return {
    kind: "question",
    toolUseId: `ask-${String(id)}`,
    questions: [
      {
        header: `見出し${String(id)}`,
        text: "どちらにする？",
        multiSelect: false,
        options: [{ label: "選んだ答え", description: "", preview: undefined }],
      },
    ],
    answers: [{ kind: "chosen", labels: ["選んだ答え"] }],
    briefs: [],
    imageSizes: [],
    unshelvedImages: [],
  }
}

describe("Turn（答えの投稿の「答え直す」）", () => {
  const folded = turn([
    step({
      id: 0,
      body: turnBodyText("中間"),
      mark: "interim-folded",
      actions: [asked(0), asked(1)],
    }),
    step({ id: 2, body: turnBodyText("最終"), mark: "final" }),
  ])

  it("新しいやり取りでは、畳みの中の最後の答えだけに付く", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container } = render(<Turn turn={folded} newest freshReport={false} />)

    const fold = typedElement(container.querySelector(".progress-fold"), HTMLDetailsElement, "畳み")
    expect(fold.textContent).toContain("選んだ答え")
    expect(fold.querySelectorAll("button")).toHaveLength(1)
  })

  it("過去のやり取りでは付かない", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container } = render(<Turn turn={folded} newest={false} freshReport={false} />)

    expect(container.querySelectorAll("button")).toHaveLength(0)
  })
})
