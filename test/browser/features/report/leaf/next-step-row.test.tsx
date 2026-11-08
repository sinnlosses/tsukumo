import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useComposerDraft } from "../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"
import { NextStepRow } from "../../../../../src/browser/features/report/leaf/next-step-row.tsx"
import { ReplyPortContext } from "../../../../../src/browser/features/report/reply-port.ts"
import type { A2uiReportComponent } from "../../../../../src/shared/report/a2ui-report-catalog.ts"

afterEach(() => {
  cleanup()
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
})

const COMPONENTS: readonly A2uiReportComponent[] = [
  {
    id: "options-1",
    component: "Options",
    title: "架空の比べ",
    items: [
      { name: "架空の案A", verdict: "adopt", reason: "理由" },
      { name: "架空の案B", verdict: "consider", reason: "理由" },
    ],
    fold: "",
    aside: "",
  },
  {
    id: "claims-1",
    component: "Claims",
    items: [{ claim: "架空の主張", certainty: "inferred", basis: "", howToVerify: "架空の手順" }],
    fold: "",
    aside: "",
  },
]

const ORIGIN = { sessionRemaining: { kind: "none" }, outcome: "stopped" } as const

function renderRow(withPort: boolean) {
  const port = {
    appendDraft: useComposerDraft.getState().appendParagraphToDraft,
    ask: () => undefined,
  }
  return render(
    <ReplyPortContext value={withPort ? { kind: "open", port } : { kind: "none" }}>
      <NextStepRow origin={ORIGIN} components={COMPONENTS} />
    </ReplyPortContext>,
  )
}

describe("NextStepRow", () => {
  it("再開する → 続ける → 確かめる → 別の案で進める の順にボタンが並ぶ", () => {
    renderRow(true)

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "再開する",
      "続ける: 架空の案A",
      "確かめる: 推測 1 件",
      "別の案で進める…",
    ])
  })

  it("押すと下書きが入るだけで、入力欄に字があれば空行を挟んで後ろに足す", () => {
    useComposerDraft.getState().replaceDraft({ text: "打ちかけ", caret: 4 })
    renderRow(true)

    fireEvent.click(screen.getByRole("button", { name: "再開する" }))

    expect(useComposerDraft.getState().draft.text).toBe("打ちかけ\n\n止めたところから再開して。")
  })

  it("別の案で進めるは案を選ぶ欄を開き、選んだ案の下書きを入れる", () => {
    renderRow(true)

    fireEvent.click(screen.getByRole("button", { name: "別の案で進める" }))
    expect(useComposerDraft.getState().draft.text).toBe("")
    fireEvent.click(screen.getByRole("button", { name: "架空の案B" }))

    expect(useComposerDraft.getState().draft.text).toBe("架空の案B で進めて。")
  })

  it("口が渡されていない描画には出ない", () => {
    renderRow(false)

    expect(screen.queryAllByRole("button")).toEqual([])
  })
})
