import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { NextStepTray } from "../../../../../../../src/browser/components/page/conversation/components/dispatch/next-step-tray.tsx"
import { useComposerDraft } from "../../../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"
import { useNextStepTray } from "../../../../../../../src/browser/components/page/conversation/stores/next-step-tray.ts"
import {
  buildNextSteps,
  unobservedOf,
} from "../../../../../../../src/browser/features/report/domain/next-step-plan.ts"
import { useComposerFocus } from "../../../../../../../src/browser/stores/composer-focus.ts"
import type { A2uiReportComponent } from "../../../../../../../src/shared/report/a2ui-report-catalog.ts"
import type { ReportChecksView } from "../../../../../../../src/shared/report/report-check-view.ts"

// 札・下見の出し分けと、押したときに下書きへ入る文だけを測る。フィクスチャはすべて手で書いた架空のもの。

afterEach(() => {
  cleanup()
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
  useComposerFocus.setState(useComposerFocus.getInitialState(), true)
  useNextStepTray.setState(useNextStepTray.getInitialState(), true)
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

/** 見出しの口（畳む・お願いへ）を除いた札。 */
function chipButtons(): HTMLElement[] {
  return screen
    .getAllByRole("button")
    .filter((button) => button.hasAttribute("data-next-step-chip"))
}

function renderTray(
  components: readonly A2uiReportComponent[] = COMPONENTS,
  checks: ReportChecksView = { kind: "none" },
) {
  const steps = buildNextSteps({
    components,
    unobserved: unobservedOf(checks),
    sessionRemaining: { kind: "none" },
    outcome: "stopped",
  })
  return render(<NextStepTray steps={steps} folded={false} favor={{ kind: "none" }} />)
}

describe("NextStepTray", () => {
  it("再開する → 続ける → 確かめる → 別の案で進める の順に札が並び、複数行の文は点の数を添える", () => {
    renderTray()

    expect(chipButtons().map((button) => button.textContent)).toEqual([
      "再開する 止めたところから再開して。",
      "続ける 「架空の案A」で進めて。",
      "確かめる: 推測 1 件 次の点を確かめて。1点",
      "別の案で進める 案を選ぶ ▾",
    ])
  })

  it("長い下書きでも札の主の字は下書きと一致し、切り詰めない", () => {
    const longName = "架空の長い案の名前".repeat(12)
    renderTray([
      {
        id: "options-1",
        component: "Options",
        title: "架空の比べ",
        items: [{ name: longName, verdict: "adopt", reason: "理由" }],
        fold: "",
        aside: "",
      },
    ])

    const button = screen.getByRole("button", { name: /^続ける/ })

    expect(button.textContent).toBe(`続ける 「${longName}」で進めて。`)
    expect(button.textContent).not.toContain("…")
  })

  it("押すと下書きが入るだけで、入力欄に字があれば空行を挟んで後ろに足す", () => {
    useComposerDraft.getState().replaceDraft({ text: "打ちかけ", caret: 4 })
    renderTray()

    fireEvent.click(screen.getByRole("button", { name: /^再開する/ }))

    expect(useComposerDraft.getState().draft.text).toBe("打ちかけ\n\n止めたところから再開して。")
  })

  it("別の案で進めるは、その後ろに案の札を開き、選んだ案の下書きを入れる", () => {
    renderTray()

    const chooser = screen.getByRole("button", { name: /^別の案で進める/ })
    fireEvent.click(chooser)
    expect(chooser.getAttribute("aria-expanded")).toBe("true")
    expect(useComposerDraft.getState().draft.text).toBe("")
    fireEvent.click(screen.getByRole("button", { name: /^架空の案B/ }))

    expect(useComposerDraft.getState().draft.text).toBe("「架空の案B」で進めて。")
  })

  it("確かめていない検証の行から確かめた・違ったの2つの札が出て、押すとそれぞれの下書きが入る", () => {
    renderTray(COMPONENTS, CHECKS)

    fireEvent.click(screen.getByRole("button", { name: /^違った/ }))

    expect(screen.getAllByRole("button", { name: /^確かめた/ })).toHaveLength(1)
    expect(useComposerDraft.getState().draft.text).toBe("「架空の検証」を確かめたら、違っていた。")
  })

  it("見出しに押しても送らない案内が出て、下見は先頭の札の文から始まり、フォーカスした札の全文に替わる", () => {
    renderTray()
    const group = screen.getByRole("group", { name: "次の一手" })

    expect(group.textContent).toContain("押すと下の入力欄に入る（送らない）")
    expect(group.querySelector("p")?.textContent).toBe("押すと入る文止めたところから再開して。")

    fireEvent.focus(screen.getByRole("button", { name: /^確かめる/ }))

    expect(group.querySelector("p")?.textContent).toBe(
      "押すと入る文次の点を確かめて。\n1. 架空の主張\n   確かめ方: 架空の手順",
    )
  })
})

describe("NextStepTray（キーと畳む）", () => {
  it("札の並びはタブ止まり1つで、← → で隣の札へ移り、端では止まる", () => {
    renderTray()
    const chips = chipButtons()
    expect(chips.map((chip) => chip.tabIndex)).toEqual([0, -1, -1, -1])

    act(() => {
      chips[0]?.focus()
    })
    fireEvent.keyDown(chips[0] ?? document.body, { key: "ArrowLeft" })
    expect(document.activeElement).toBe(chips[0])
    fireEvent.keyDown(chips[0] ?? document.body, { key: "ArrowRight" })

    expect(document.activeElement).toBe(chips[1])
    expect(chips.map((chip) => chip.tabIndex)).toEqual([-1, 0, -1, -1])
  })

  it("並びの中の ↓ と修飾キーなしの Esc で入力欄へ戻る合図を出す", () => {
    renderTray()
    const chip = screen.getByRole("button", { name: /^再開する/ })

    fireEvent.keyDown(chip, { key: "ArrowDown" })
    fireEvent.keyDown(chip, { key: "Escape" })
    fireEvent.keyDown(chip, { key: "Escape", shiftKey: true })

    expect(useComposerFocus.getState().signal).toBe(2)
  })

  it("畳んだ形は件数と「開く」の1行で、押すと開く", () => {
    useNextStepTray.getState().attach("1:0", [])
    useNextStepTray.getState().fold()
    const steps = buildNextSteps({
      components: COMPONENTS,
      unobserved: [],
      sessionRemaining: { kind: "none" },
      outcome: "stopped",
    })
    render(<NextStepTray steps={steps} folded favor={{ kind: "none" }} />)

    expect(screen.getByRole("group", { name: "次の一手" }).textContent).toBe("次の一手4件開く ⌃")
    fireEvent.click(screen.getByRole("button", { name: "開く" }))

    expect(useNextStepTray.getState().foldedKey).toBeUndefined()
  })
})

describe("NextStepTray（押したあと）", () => {
  const held = (): (string | null)[] =>
    screen
      .getAllByRole("button")
      .filter((button) => button.classList.contains("is-held"))
      .map((button) => button.querySelector(".next-step-chip-kind")?.textContent ?? null)

  it("下書きに文が入っている札だけに印が付き、文を消すと印も消える", () => {
    renderTray()

    fireEvent.click(screen.getByRole("button", { name: /^再開する/ }))
    expect(held()).toEqual(["再開する"])

    act(() => {
      useComposerDraft.getState().replaceDraft({ text: "", caret: 0 })
    })
    expect(held()).toEqual([])
  })

  it("印の付いた札をもう一度押しても足さない", () => {
    renderTray()
    const resume = screen.getByRole("button", { name: /^再開する/ })

    fireEvent.click(resume)
    fireEvent.click(resume)

    expect(useComposerDraft.getState().draft.text).toBe("止めたところから再開して。")
  })

  it("見出しの案内は、下書きが空なら「入る」、字があれば「後ろに足す」", () => {
    renderTray()
    const group = screen.getByRole("group", { name: "次の一手" })
    expect(group.textContent).toContain("押すと下の入力欄に入る（送らない）")

    act(() => {
      useComposerDraft.getState().replaceDraft({ text: "打ちかけ", caret: 4 })
    })

    expect(group.textContent).toContain("押すと下の入力欄の後ろに足す（送らない）")
  })

  it("お願いが見えていないと、見出しの右端に知らせと口が出て、口に ↑ の印は無い", () => {
    const jumped: string[] = []
    render(
      <NextStepTray
        steps={buildNextSteps({
          components: [],
          unobserved: [],
          sessionRemaining: { kind: "none" },
          outcome: "stopped",
        })}
        folded={false}
        favor={{ kind: "waiting", onJump: () => jumped.push("favor") }}
      />,
    )

    const jump = screen.getByRole("button", { name: "お願いへ" })
    fireEvent.click(jump)

    expect(screen.getByRole("group", { name: "次の一手" }).textContent).toContain(
      "お願いが1件あります",
    )
    expect(jump.textContent).toBe("お願いへ")
    expect(jumped).toEqual(["favor"])
  })
})
