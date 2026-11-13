import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ReplyPortContext } from "../../../../../src/browser/features/report/reply-port.ts"
import { Report } from "../../../../../src/browser/features/report/report.tsx"
import { useReadingDepth } from "../../../../../src/browser/stores/reading-depth.ts"
import { reportEvents } from "../../../../../src/server/session-driver/core/message/sdk-report-message.ts"
import { mainViewEntries } from "../../../../../src/shared/session/main-view-entry.ts"
import type { MainViewReportRegions } from "../../../../../src/shared/session/main-view-shape.ts"
import { applySessionEvent } from "../../../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session/session-state.ts"
import { EXPRESSIONS } from "../../../../fixture/sdk-assistant-message.ts"
import { checkedToolUseId } from "../../../../fixture/tool-use-id.ts"

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset["shell"]
  useReadingDepth.setState(useReadingDepth.getInitialState(), true)
})

const NO_CLASS_NAMES = { className: "", revealClassName: "", blockClassName: "" }

const NEXT_STEPS = { sessionRemaining: { kind: "remaining", text: "架空の残り" } } as const

const section = (text: string) => [
  { id: "s1", component: "Section", heading: "架空の節", children: ["t1"] },
  { id: "t1", component: "Markdown", markdown: text },
]

/** 疑似セッションの場面 `progress-delivered`・`progress-ask`・`progress-short` と同じ形の引数。 */
const SCENES = {
  delivered: [
    {
      id: "root",
      component: "Report",
      verdict: "done",
      next: { owner: "none", action: "架空の続けて頼むことは無い" },
      sources: [{ mark: 1, place: "src/fictional/list.ts:12", note: "架空の並べ替え" }],
      conclusion: ["架空の結論: 一覧を名前の順に並べ直した{{src: 1}}。"],
      checks: [
        {
          status: "ok",
          label: "架空の並びの確認",
          figure: "3 件",
          command: "",
          detail: "",
          howToVerify: "",
        },
      ],
      children: ["s1"],
    },
    ...section("架空の並べ替えの関数を名前の順にした。"),
  ],
  ask: [
    {
      id: "root",
      component: "Report",
      verdict: "yours",
      next: {
        owner: "you",
        action: "架空の古い設定を消すか残すかを選んでほしい",
        choices: ["消す", "残す"],
      },
      conclusion: ["架空の結論: 古い設定は2か所から読まれていて、消すかどうかを決めてほしい。"],
      children: ["s1"],
    },
    ...section("架空の起動と架空の書き出しが読んでいる。"),
  ],
  short: [
    {
      id: "root",
      component: "Report",
      verdict: "done",
      figureNone: "short-answer",
      conclusion: ["架空の結論: 既定値は 30 秒。"],
      children: ["a1"],
      closing: { text: "架空の締め", expression: "default" },
    },
    { id: "a1", component: "Markdown", markdown: "架空の読み口が既定値を持っている。" },
  ],
  unverified: [
    {
      id: "root",
      component: "Report",
      verdict: "done",
      conclusion: ["架空の結論: 設定の読み口を1か所にした。"],
      children: ["s1"],
    },
    { id: "s1", component: "Section", heading: "架空の節", children: ["c1"] },
    {
      id: "c1",
      component: "Claims",
      items: [
        {
          claim: "架空の別の環境でも同じに読む。",
          certainty: "unverified",
          howToVerify: "架空の環境で起こし直す",
        },
      ],
    },
  ],
} as const

/** 場面の引数を、本番と同じ読み替えと畳みを通した本文にする。 */
function regionsOfScene(name: keyof typeof SCENES): MainViewReportRegions {
  const [read] = reportEvents(
    checkedToolUseId("toolu_fictional"),
    { components: SCENES[name] },
    EXPRESSIONS,
  )
  if (read?.kind !== "report") throw new Error("report にならなかった")
  const entry = mainViewEntries(applySessionEvent(INITIAL_SESSION_STATE, read, 0)).find(
    (candidate) => candidate.kind === "report",
  )
  if (entry?.kind !== "report") throw new Error("レポートの記録が無い")
  return entry.regions
}

function renderScene(name: keyof typeof SCENES, shell: "stage" | "classic" | "unset") {
  if (shell !== "unset") {
    document.documentElement.dataset["shell"] = shell
  }
  const appendDraft = vi.fn<(text: string) => void>()
  const ask = vi.fn<() => void>()
  const port = { appendDraft, prependDraft: () => undefined, ask }
  const rendered = render(
    <ReplyPortContext value={{ kind: "open", port }}>
      <Report
        reveal={false}
        turnId={1}
        {...NO_CLASS_NAMES}
        body={regionsOfScene(name)}
        nextSteps={NEXT_STEPS}
      />
    </ReplyPortContext>,
  )
  return { ...rendered, appendDraft, ask }
}

function headOf(container: HTMLElement): HTMLElement {
  const head = container.querySelector<HTMLElement>('[data-report-region="head"]')
  if (head === null) throw new Error("頭の欄が無い")
  return head
}

/** 頭の欄の中の、見出しと結論の字を文書の順に並べる。 */
function headOrder(container: HTMLElement): readonly string[] {
  return [...headOf(container).querySelectorAll("p, h3")].map((node) => node.textContent ?? "")
}

describe("新しい器の紙の頭", () => {
  it("渡す紙は、判定の行が済んだで、結論の直後に続けて頼めることが来る", async () => {
    const { container } = renderScene("delivered", "stage")
    await screen.findByText(/一覧を名前の順に並べ直した/)

    const order = headOrder(container)
    expect(order[0]).toContain("✓済んだ")
    expect(order[0]).toContain("✓1")
    expect(order[1]).toContain("一覧を名前の順に並べ直した")
    expect(order[2]).toBe("続けて頼めること")
    expect(container.querySelector("[data-paper-form]")?.getAttribute("data-paper-form")).toBe(
      "deliver",
    )
  })

  it("判断を仰ぐ紙は、あなたの番が結論の直後に来て、選べる答えを押すと入力欄に入るだけで送らない", async () => {
    const { container, appendDraft, ask } = renderScene("ask", "stage")
    await screen.findByText(/古い設定は2か所から読まれていて/)

    const order = headOrder(container)
    expect(order[0]).toContain("●あなたの番")
    expect(order[1]).toContain("古い設定は2か所から読まれていて")
    expect(order[2]).toBe("あなたの番")
    const mine = within(headOf(container)).getByRole("heading", {
      name: "あなたの番",
    }).parentElement
    if (mine === null) throw new Error("あなたの番の欄が無い")
    fireEvent.click(within(mine).getByRole("button", { name: "消す" }))

    expect(appendDraft).toHaveBeenCalledWith("消す")
    expect(ask).not.toHaveBeenCalled()
  })

  it("続けて頼めることを押すと、下書きが入力欄に入るだけで送らない", () => {
    const { appendDraft, ask } = renderScene("delivered", "stage")

    fireEvent.click(screen.getByRole("button", { name: "続ける: 架空の残り" }))

    expect(appendDraft).toHaveBeenCalledWith("続けて。架空の残り")
    expect(ask).not.toHaveBeenCalled()
  })

  it("検証が無く未確認の主張だけがある紙も、判定の行に確かめていないの件数を出す", () => {
    const { container } = renderScene("unverified", "stage")

    expect(headOrder(container)[0]).toContain("？1")
  })

  it("短い答えの紙は、判定を答えたにし、あなたの番も続けて頼めることも出さない", () => {
    const { container } = renderScene("short", "stage")

    expect(headOrder(container)[0]).toContain("✓答えた")
    expect(screen.queryByRole("heading", { name: "あなたの番" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "続けて頼めること" })).toBeNull()
  })

  it("旧い器では紙の根を使わず、印の無いときと同じ DOM になる", () => {
    const classic = renderScene("delivered", "classic").container.innerHTML
    cleanup()
    const unset = renderScene("delivered", "unset").container.innerHTML

    expect(classic).toBe(unset)
    expect(classic).not.toContain("data-paper-form")
  })
})

describe("読む深さと節の畳み", () => {
  function bodyOf(container: HTMLElement): HTMLElement {
    const body = container.querySelector<HTMLElement>("[data-report-body]")
    if (body === null) throw new Error("本文の根が無い")
    return body
  }

  it("既定は本文で、一目に替えても節の DOM は残り、根の印だけが替わる", () => {
    const { container } = renderScene("delivered", "stage")
    expect(bodyOf(container).dataset["depth"]).toBe("2")

    fireEvent.click(screen.getByRole("button", { name: "一目" }))

    expect(bodyOf(container).dataset["depth"]).toBe("1")
    expect(screen.getByRole("button", { name: "一目" }).getAttribute("aria-pressed")).toBe("true")
    expect(container.querySelector("[data-report-section]")).not.toBeNull()
    expect(container.querySelector('[data-paper-part="ledger"]')).not.toBeNull()
  })

  it("深さは部屋に1つで、別の紙で替えてもそろって替わる", () => {
    const first = renderScene("delivered", "stage").container
    const second = renderScene("ask", "stage").container

    fireEvent.click(within(first).getByRole("button", { name: "記録" }))

    expect(bodyOf(second).dataset["depth"]).toBe("3")
  })

  it("節の畳みのボタンを押すと欄が data-folded になり、中身の DOM は残る", () => {
    const { container } = renderScene("delivered", "stage")
    const region = container.querySelector<HTMLElement>("[data-report-section]")

    fireEvent.click(within(region ?? document.body).getByRole("button", { name: "畳む" }))

    expect(region?.dataset["folded"]).toBe("true")
    expect(region?.textContent).toContain("架空の並べ替えの関数を名前の順にした。")
  })

  it("見出しの無い節には畳みのボタンを出さない", () => {
    const { container } = renderScene("short", "stage")
    const region = container.querySelector<HTMLElement>("[data-report-section]")

    expect(region?.textContent).toContain("架空の読み口が既定値を持っている。")
    expect(within(region ?? document.body).queryByRole("button", { name: "畳む" })).toBeNull()
    expect(region?.dataset["foldKey"]).toBeUndefined()
  })
})
