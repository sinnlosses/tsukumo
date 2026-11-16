import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { AnswerPost } from "../../../../../../../src/browser/components/page/conversation/components/main-view/answer-post.tsx"
import { useComposerDraft } from "../../../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"
import type { MainViewQuestion } from "../../../../../../../src/shared/session/main-view-shape.ts"

afterEach(() => {
  cleanup()
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
})

const entry: MainViewQuestion = {
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
  answers: [{ kind: "chosen", labels: ["案B"] }],
  briefs: [],
  imageSizes: [],
  unshelvedImages: [],
}

describe("AnswerPost", () => {
  it("札と選んだ案の名前を出し、時刻は出さない", () => {
    const { container } = render(<AnswerPost entry={entry} redo={false} />)

    expect(container.textContent).toContain("答え")
    expect(container.textContent).toContain("案B")
    expect(container.querySelector("time")).toBeNull()
  })

  it("最後の答えには「答え直す」が付き、押すと空の下書きに訂正の補足の頭が入る（送らない）", () => {
    render(<AnswerPost entry={entry} redo />)

    fireEvent.click(screen.getByRole("button", { name: "答え直す" }))

    expect(useComposerDraft.getState().draft.text).toBe("（答え直し）確認: ")
  })

  it("入力欄に字があるときは消さず、改行1つを挟んで末尾に足す", () => {
    useComposerDraft.getState().replaceDraft({ text: "書きかけ", caret: 4 })
    render(<AnswerPost entry={entry} redo />)

    fireEvent.click(screen.getByRole("button", { name: "答え直す" }))

    expect(useComposerDraft.getState().draft.text).toBe("書きかけ\n（答え直し）確認: ")
  })

  it("最後の答えでなければボタンを出さない", () => {
    render(<AnswerPost entry={entry} redo={false} />)

    expect(screen.queryByRole("button", { name: "答え直す" })).toBeNull()
  })
})
