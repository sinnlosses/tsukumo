import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useComposerDraft } from "../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"
import { NextStepRow } from "../../../../../src/browser/features/report/leaf/next-step-row.tsx"
import { ReplyPortContext } from "../../../../../src/browser/features/report/reply-port.ts"
import type { A2uiReportComponent } from "../../../../../src/shared/report/a2ui-report-catalog.ts"
import type { ReportChecksView } from "../../../../../src/shared/report/report-check-view.ts"

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

const CHECKS: ReportChecksView = {
  kind: "checks",
  summary: {
    passedCount: 0,
    figures: [],
    problems: [{ status: "unobserved", count: 1 }],
    favor: { kind: "none" },
  },
  problems: [
    {
      status: "unobserved",
      label: "架空の検証",
      figure: "",
      time: "",
      viaCommand: false,
      recorded: false,
      runCount: 0,
      supports: [],
      detail: "",
      howToVerify: "架空の手順",
    },
  ],
  passed: [],
}

const ORIGIN = { sessionRemaining: { kind: "none" }, outcome: "stopped" } as const

function renderRow(withPort: boolean, checks: ReportChecksView = { kind: "none" }) {
  const port = {
    appendDraft: useComposerDraft.getState().appendParagraphToDraft,
    prependDraft: useComposerDraft.getState().prependToDraft,
  }
  return render(
    <ReplyPortContext value={withPort ? { kind: "open", port } : { kind: "none" }}>
      <NextStepRow origin={ORIGIN} components={COMPONENTS} checks={checks} />
    </ReplyPortContext>,
  )
}

describe("NextStepRow", () => {
  it("再開する → 続ける → 確かめる → 別の案で進める の順にボタンが並ぶ", () => {
    renderRow(true)

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "再開する 止めたところから再開して。",
      "続ける 「架空の案A」で進めて。",
      "確かめる: 推測 1 件 次の点を確かめて。1. 架空の主張\n   確かめ方: 架空の手順",
      "別の案で進める…",
    ])
  })

  it("長い下書きでも札の主の字は下書きと一致し、切り詰めない", () => {
    const longName = "架空の長い案の名前".repeat(12)
    const components: readonly A2uiReportComponent[] = [
      {
        id: "options-1",
        component: "Options",
        title: "架空の比べ",
        items: [{ name: longName, verdict: "adopt", reason: "理由" }],
        fold: "",
        aside: "",
      },
    ]
    const port = {
      appendDraft: useComposerDraft.getState().appendParagraphToDraft,
      prependDraft: useComposerDraft.getState().prependToDraft,
      ask: () => Promise.resolve(),
    }
    render(
      <ReplyPortContext value={{ kind: "open", port }}>
        <NextStepRow origin={ORIGIN} components={components} checks={{ kind: "none" }} />
      </ReplyPortContext>,
    )

    const button = screen.getByRole("button", { name: /^続ける/ })

    expect(button.textContent).toBe(`続ける 「${longName}」で進めて。`)
    expect(button.textContent).not.toContain("…")
  })

  it("押すと下書きが入るだけで、入力欄に字があれば空行を挟んで後ろに足す", () => {
    useComposerDraft.getState().replaceDraft({ text: "打ちかけ", caret: 4 })
    renderRow(true)

    fireEvent.click(screen.getByRole("button", { name: /^再開する/ }))

    expect(useComposerDraft.getState().draft.text).toBe("打ちかけ\n\n止めたところから再開して。")
  })

  it("別の案で進めるは案を選ぶ欄を開き、選んだ案の下書きを入れる", () => {
    renderRow(true)

    fireEvent.click(screen.getByRole("button", { name: "別の案で進める" }))
    expect(useComposerDraft.getState().draft.text).toBe("")
    fireEvent.click(screen.getByRole("button", { name: /^架空の案B/ }))

    expect(useComposerDraft.getState().draft.text).toBe("「架空の案B」で進めて。")
  })

  it("確かめていない検証の行から確かめた・違ったの対が出て、押すと下書きが入る", () => {
    renderRow(true, CHECKS)

    fireEvent.click(screen.getByRole("button", { name: /^違った/ }))

    expect(screen.getAllByRole("button", { name: /^確かめた/ })).toHaveLength(1)
    expect(useComposerDraft.getState().draft.text).toBe("「架空の検証」を確かめたら、違っていた。")
  })

  it("行の頭に、押しても送らない案内が出て、押すと下書きが入るだけ", () => {
    renderRow(true)
    const group = screen.getByRole("group", { name: "次の一手" })

    expect(group.children[1]?.textContent).toBe("押すと、入力欄に下書きが入る（送らない）")

    fireEvent.click(screen.getByRole("button", { name: /^再開する/ }))

    expect(useComposerDraft.getState().draft.text).toBe("止めたところから再開して。")
  })

  it("口が渡されていない描画には、ボタンも案内も出ない", () => {
    const { container } = renderRow(false)

    expect(screen.queryAllByRole("button")).toEqual([])
    expect(container.textContent).not.toContain("送らない")
  })
})
