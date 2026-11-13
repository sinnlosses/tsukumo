import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type {
  WorkPlanDelegate,
  WorkPlanLap,
  WorkPlanRow,
} from "../../../../../../../src/browser/components/page/conversation/domain/work-plan-row.ts"

// 本物の Markdown は遅延で読み込まれる重い部品なので、本文の字をそのまま出す代役に差し替える。
vi.mock("../../../../../../../src/browser/features/report/markdown.tsx", () => ({
  InlineMarkdown: (props: { readonly text: string }) => <span>{props.text}</span>,
}))

const { PresentationalWorkPlanPaper } =
  await import("../../../../../../../src/browser/components/page/conversation/components/main-view/presentational-work-plan-paper.tsx")

afterEach(() => {
  cleanup()
})

function lapPair(lap: number, reason: string, last: boolean): readonly WorkPlanLap[] {
  return [
    {
      key: `${String(lap)}-rejected`,
      label: `${String(lap)}周目`,
      result: "rejected",
      text: reason,
      duration: { kind: "known", milliseconds: 60_000 },
    },
    {
      key: `${String(lap)}-fixed`,
      label: "直し",
      result: last ? "now" : "fixed",
      text: "",
      duration: { kind: "unknown" },
    },
  ]
}

function delegate(id: string, state: WorkPlanDelegate["state"]): WorkPlanDelegate {
  return {
    key: id,
    name: `架空の役${id}`,
    state,
    text: `架空の進み${id}`,
    since: { kind: "restored" },
  }
}

function row(
  key: string,
  state: WorkPlanRow["state"],
  extra: Partial<Pick<WorkPlanRow, "laps" | "delegates" | "ask">> = {},
): WorkPlanRow {
  return {
    key,
    state,
    ordinal: key,
    title: `架空の段${key}`,
    duration: { kind: "unknown" },
    summary: "",
    lap: 1,
    laps: [],
    delegates: [],
    touched: [],
    live:
      state === "current"
        ? { kind: "now", text: "架空の手順をしている", startedAt: { kind: "restored" } }
        : { kind: "none" },
    usual: { kind: "none" },
    ask: { kind: "none" },
    ...extra,
  }
}

function renderWorking(rows: readonly WorkPlanRow[]) {
  return render(
    <PresentationalWorkPlanPaper
      model={{
        kind: "working",
        verdict: "running",
        position: "",
        elapsed: "",
        estimate: { kind: "none" },
        quietLine: {
          quiet: { kind: "none" },
          runningLine: "",
          onStop: () => {},
          onRestoreRequest: () => {},
        },
        plan: {
          folded: { kind: "none" },
          slots: rows.map((item) => ({ kind: "phase", spanHead: { kind: "none" }, row: item })),
        },
        rows,
        now: 0,
        away: { kind: "none" },
      }}
    />,
  )
}

describe("PresentationalWorkPlanPaper の周と任せた役", () => {
  it("差し戻された周の理由と、任せた役の名前と1行が、今の段の中に出る", () => {
    renderWorking([
      row("1", "done"),
      row("2", "current", {
        laps: lapPair(1, "架空の差し戻し1", true),
        delegates: [delegate("1", "running"), delegate("2", "done")],
      }),
    ])

    expect(screen.getByText("1周目")).toBeTruthy()
    expect(screen.getByText("架空の差し戻し1")).toBeTruthy()
    expect(screen.getByText(/架空の役1/u).textContent).toContain("架空の進み1")
    expect(screen.getByText(/架空の役2/u).textContent).toContain("✓")
  })

  it("周を持つ今の段では、実況を「直し」の行にだけ出し、「いま」の行を重ねない", () => {
    renderWorking([
      row("1", "current", {
        laps: lapPair(1, "架空の差し戻し1", true),
        delegates: [delegate("1", "running")],
      }),
    ])

    expect(screen.getAllByText("架空の手順をしている")).toHaveLength(1)
    expect(screen.queryByText("いま")).toBeNull()
    expect(screen.getByText("任せた")).toBeTruthy()
  })

  it("周の無い今の段では、実況を「いま」の行に出す", () => {
    renderWorking([row("1", "current")])

    expect(screen.getByText("いま")).toBeTruthy()
    expect(screen.getAllByText("架空の手順をしている")).toHaveLength(1)
  })

  it("4周目からは前の周を <details> に畳み、開くと読める", () => {
    const { container } = renderWorking([
      row("1", "current", {
        laps: [
          ...lapPair(1, "架空の差し戻し1", false),
          ...lapPair(2, "架空の差し戻し2", false),
          ...lapPair(3, "架空の差し戻し3", true),
        ],
      }),
    ])

    const folded = container.querySelector("details")
    expect(folded?.querySelector("summary")?.textContent).toBe("1周目 ✕ 1 回")
    expect(folded?.textContent).toContain("架空の差し戻し1")
    expect(screen.getByText("架空の差し戻し3")).toBeTruthy()
  })

  it("済んだ役が6つ以上の並びでは、済んだ役を <details> に畳む", () => {
    const { container } = renderWorking([
      row("1", "current", {
        delegates: [
          delegate("1", "done"),
          delegate("2", "running"),
          delegate("3", "done"),
          delegate("4", "running"),
          delegate("5", "running"),
          delegate("6", "running"),
        ],
      }),
    ])

    const folded = container.querySelector("details")
    expect(folded?.querySelector("summary")?.textContent).toBe("済んだ 2 つ")
    expect(folded?.textContent).toContain("架空の役1")
    expect(folded?.textContent).not.toContain("架空の役2")
  })

  it("周の無い段には周の行も畳みも出ない", () => {
    const { container } = renderWorking([row("1", "done"), row("2", "current")])

    expect(screen.queryByText(/周目/u)).toBeNull()
    expect(container.querySelector("details")).toBeNull()
  })
})

describe("PresentationalWorkPlanPaper の問い", () => {
  it("問いが付いた段に、問いと材料と答える場所の案内が出て、ボタンは無い", () => {
    renderWorking([
      row("1", "done"),
      row("2", "current", {
        ask: { kind: "asked", question: "架空の質問？", material: "架空の事実", askedAt: 0 },
      }),
    ])

    expect(screen.getByText("架空の質問？")).toBeTruthy()
    expect(screen.getByText("架空の事実")).toBeTruthy()
    expect(screen.getByText("あなたの番")).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
  })
})

describe("PresentationalWorkPlanPaper の失敗で止まった紙", () => {
  function renderFailed(handlers: {
    readonly onDraft: (text: string) => void
    readonly onRetry: (request: string) => void
  }) {
    const rows = [row("1", "done"), row("2", "failed"), row("3", "upcoming")]
    return render(
      <PresentationalWorkPlanPaper
        model={{
          kind: "failed",
          position: "3段のうち2段目で止まった",
          elapsed: "12分48秒",
          reason: "架空の理由の語",
          retry: { kind: "request", label: "同じ依頼を入力欄に戻す", request: "架空の依頼" },
          remaining: ["済んだ 1 段の変更 2 ファイル"],
          slots: rows.map((item) => ({ kind: "phase", spanHead: { kind: "none" }, row: item })),
          rows,
          now: 0,
          away: { kind: "none" },
          ...handlers,
        }}
      />,
    )
  }

  it("判定の行・理由・残っているものが出て、止まった段に ✕ と札が付く", () => {
    const { container } = renderFailed({ onDraft: () => {}, onRetry: () => {} })

    expect(screen.getByText("失敗で止まった")).toBeTruthy()
    expect(screen.getByText("架空の理由の語")).toBeTruthy()
    expect(screen.getByText("済んだ 1 段の変更 2 ファイル")).toBeTruthy()
    expect(screen.getByText("ここで止まった")).toBeTruthy()
    expect(container.querySelectorAll('[data-lamp-state="fail"]').length).toBeGreaterThan(0)
  })

  it("続け方の選択は下書きに入れ、戻す口は依頼を渡すだけで、どちらも送らない", () => {
    const onDraft = vi.fn<(text: string) => void>()
    const onRetry = vi.fn<(request: string) => void>()
    renderFailed({ onDraft, onRetry })

    fireEvent.click(screen.getByRole("button", { name: /元に戻す/u }))
    fireEvent.click(screen.getByRole("button", { name: "同じ依頼を入力欄に戻す" }))

    expect(onDraft).toHaveBeenCalledWith("ここまでの変更を元に戻して")
    expect(onRetry).toHaveBeenCalledWith("架空の依頼")
  })
})

describe("PresentationalWorkPlanPaper の渡す紙の離れていたあいだのまとめ", () => {
  const brief = {
    kind: "brief",
    minutes: 5,
    total: 3,
    settled: 3,
    waiting: { kind: "none" },
    changes: [],
    assumptions: [],
    replans: [],
    markBeforeRowKey: { kind: "none" },
  } as const

  it("済んだ紙の頭に、道筋より先にまとめが出る", () => {
    const rows = [row("1", "done")]
    const { container } = render(
      <PresentationalWorkPlanPaper
        model={{
          kind: "finished",
          ending: "finished",
          summary: "1段",
          slots: rows.map((item) => ({ kind: "phase", spanHead: { kind: "none" }, row: item })),
          rows,
          now: 0,
          away: brief,
        }}
      />,
    )

    const away = screen.getByLabelText("離れていたあいだのまとめ")
    const route = container.querySelector("details")
    if (route === null) {
      throw new Error("道筋の <details> が無い")
    }
    expect(away.compareDocumentPosition(route) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("失敗で止まった紙でも、まとめが出る", () => {
    const rows = [row("1", "done"), row("2", "failed")]
    render(
      <PresentationalWorkPlanPaper
        model={{
          kind: "failed",
          position: "2段のうち2段目で止まった",
          elapsed: "",
          reason: "架空の理由の語",
          retry: { kind: "none" },
          remaining: [],
          slots: rows.map((item) => ({ kind: "phase", spanHead: { kind: "none" }, row: item })),
          rows,
          now: 0,
          away: brief,
          onDraft: () => {},
          onRetry: () => {},
        }}
      />,
    )

    expect(screen.getByLabelText("離れていたあいだのまとめ")).toBeTruthy()
  })
})
