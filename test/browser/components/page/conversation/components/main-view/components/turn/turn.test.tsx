import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useComposerDraft } from "../../../../../../../../../src/browser/stores/composer-draft.ts"
import { useTaskBoardRequest } from "../../../../../../../../../src/browser/stores/task-board-request.ts"
import type { ReportChangeSummary } from "../../../../../../../../../src/shared/report/report-change-summary.ts"
import type {
  MainViewStep,
  MainViewStepBody,
  MainViewTurn,
} from "../../../../../../../../../src/shared/session/main-view.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../../../src/shared/session/session-state.ts"
import { typedElement } from "../../../../../../../../typed-element.ts"
import { putSession } from "../../../../../../../session-store.ts"

// 本物の `Report`（react-markdown 一式と演出の配線を持つ）ではなく、どの本文に演出を掛けると
// 言われたかだけを記録する代役に差し替える。演出そのもの（`useReportReveal`）は
// レイアウトを測るので DOM だけのテストでは確かめられず、ここで見たいのは対象の選び方の規則だけ。
let revealed: {
  readonly markdown: string
  readonly reveal: boolean
  readonly turnId: number
}[] = []

vi.mock(
  "../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/report/report.tsx",
  () => ({
    Report: (props: { readonly markdown: string; readonly reveal: boolean; turnId: number }) => {
      revealed.push({ markdown: props.markdown, reveal: props.reveal, turnId: props.turnId })
      return <div data-report-stub="yes">{props.markdown}</div>
    },
  }),
)

const { Turn } =
  await import("../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/turn/turn.tsx")

afterEach(() => {
  cleanup()
  revealed = []
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
  useTaskBoardRequest.setState(useTaskBoardRequest.getInitialState(), true)
})

/** 本文を持つステップの `body`。先頭行は本文そのもの（1行の本文しか使わないため）。 */
function text(report: string): MainViewStepBody {
  return {
    kind: "text",
    headings: [],
    report,
    finalReport: report,
    firstLine: report,
    task: { kind: "none" },
    finishedPhase: { kind: "none" },
    changeSummary: { kind: "none" },
  }
}

function step(overrides: Partial<MainViewStep> & { readonly id: number }): MainViewStep {
  return {
    body: { kind: "none" },
    interim: false,
    superseded: false,
    final: false,
    actions: [],
    asides: [],
    ...overrides,
  }
}

/** やり取りの番号。筆先に添えて配られるので、`<Report>` まで届いていることを見る。 */
const TURN_ID = 5

function turn(steps: readonly MainViewStep[]): MainViewTurn {
  return {
    id: TURN_ID,
    request: { text: "架空の依頼", images: [] },
    steps,
    hasInterimReport: false,
    droppedCount: 0,
    failure: { kind: "none" },
  }
}

/** 演出を掛けると言われた本文（`reveal` が立っているもの）。 */
function revealTargets(): readonly string[] {
  return revealed.filter((call) => call.reveal).map((call) => call.markdown)
}

describe("Turn（書き上げる演出を掛ける相手）", () => {
  it("出し始めた時点で既にあった本文には掛けない（過去のターン・読み込み直し）", () => {
    render(
      <Turn
        turn={turn([step({ id: 0, body: text("確定した本文"), final: true })])}
        newest
        freshReport={false}
      />,
    )

    expect(revealTargets()).toEqual([])
  })

  it("地図から入れ替えたばかりのレポートは、出し始めた時点にあった最終レポートにも掛ける", () => {
    render(
      <Turn
        turn={turn([step({ id: 0, body: text("届いた本文"), final: true })])}
        newest
        freshReport
      />,
    )

    expect(revealTargets()).toEqual(["届いた本文"])
  })

  it("本文にはやり取りの番号を渡す（残った筆先が別のやり取りの上へ出ないため）", () => {
    render(
      <Turn
        turn={turn([step({ id: 0, body: text("確定した本文"), final: true })])}
        newest
        freshReport={false}
      />,
    )

    expect(revealed.map((call) => call.turnId)).toEqual([TURN_ID])
  })

  it("あとから現れた確定レポートにだけ掛ける", () => {
    const { rerender } = render(<Turn turn={turn([step({ id: 0 })])} newest freshReport={false} />)
    revealed = []

    rerender(
      <Turn
        turn={turn([step({ id: 0 }), step({ id: 1, body: text("確定した本文"), final: true })])}
        newest
        freshReport={false}
      />,
    )

    expect(revealTargets()).toEqual(["確定した本文"])
  })

  it("確定レポートが並んだら、最後の1件だけに掛ける", () => {
    const { rerender } = render(
      <Turn
        turn={turn([step({ id: 0, body: text("1件目"), final: true })])}
        newest
        freshReport={false}
      />,
    )
    revealed = []

    rerender(
      <Turn
        turn={turn([
          step({ id: 0, body: text("1件目") }),
          step({ id: 1, body: text("2件目"), final: true }),
        ])}
        newest
        freshReport={false}
      />,
    )

    expect(revealTargets()).toEqual(["2件目"])
  })

  it("閉じた瞬間に入れ替えた札では、中間レポートが経過の畳みに入っても最終レポートだけに掛ける", () => {
    render(
      <Turn
        turn={turn([
          step({ id: 0, body: text("中間0"), interim: true, superseded: true }),
          step({ id: 1, body: text("中間1"), interim: true, superseded: true }),
          step({ id: 2, body: text("最終"), final: true }),
        ])}
        newest
        freshReport
      />,
    )

    expect(revealTargets()).toEqual(["最終"])
  })

  it("続きのターンで最終レポートが替わると、前の最終は経過の畳みへ移り、新しい最終だけに掛ける", () => {
    const { rerender } = render(
      <Turn
        turn={turn([
          step({ id: 0, body: text("中間0"), interim: true, superseded: true }),
          step({ id: 1, body: text("前の最終"), final: true }),
        ])}
        newest
        freshReport={false}
      />,
    )
    revealed = []

    rerender(
      <Turn
        turn={turn([
          step({ id: 0, body: text("中間0"), interim: true, superseded: true }),
          step({ id: 1, body: text("前の最終"), interim: true, superseded: true }),
          step({ id: 2, body: text("新しい最終"), final: true }),
        ])}
        newest
        freshReport={false}
      />,
    )

    expect(revealTargets()).toEqual(["新しい最終"])
  })

  it("中間レポートには掛けない（流れている最中に少しずつ出る本文なので）", () => {
    const { rerender } = render(<Turn turn={turn([step({ id: 0 })])} newest freshReport={false} />)
    revealed = []

    rerender(
      <Turn
        turn={turn([step({ id: 0 }), step({ id: 1, body: text("途中の資料"), interim: true })])}
        newest
        freshReport={false}
      />,
    )

    expect(revealTargets()).toEqual([])
  })

  it("今回のやり取りでなければ掛けない", () => {
    const { rerender } = render(
      <Turn turn={turn([step({ id: 0 })])} newest={false} freshReport={false} />,
    )
    revealed = []

    rerender(
      <Turn
        turn={turn([step({ id: 0 }), step({ id: 1, body: text("確定した本文"), final: true })])}
        newest={false}
        freshReport={false}
      />,
    )

    expect(revealTargets()).toEqual([])
  })

  it("同じ本文が描き直されても、掛ける相手は変わらない（一度きりの判定ではない）", () => {
    const { rerender } = render(<Turn turn={turn([step({ id: 0 })])} newest freshReport={false} />)
    const grown = turn([step({ id: 0 }), step({ id: 1, body: text("確定した本文"), final: true })])
    rerender(<Turn turn={grown} newest freshReport={false} />)
    revealed = []

    rerender(<Turn turn={grown} newest freshReport={false} />)

    // `Report` は `memo` で包まれていないので描き直されるが、`reveal` の値は同じまま
    // （演出を始めるかどうかは `useReportReveal` がマウント時に1度だけ決める）。
    expect(revealTargets()).toEqual(["確定した本文"])
  })
})

describe("Turn（失敗で終わったやり取り）", () => {
  it("本文が1つも無いまま失敗したやり取りでも、失敗の塊は出す", () => {
    putSession(INITIAL_SESSION_STATE)
    render(
      <Turn
        turn={{ ...turn([]), failure: { kind: "failed", failure: { kind: "max-turns" } } }}
        newest={false}
        freshReport={false}
      />,
    )

    expect(screen.getByRole("note", { name: "失敗で終わった" }).textContent).toContain(
      "往復の上限に当たった",
    )
  })

  it("利用上限で終わったやり取りの戻る時刻つきの口を押すと、依頼が入力欄の下書きに入る", () => {
    putSession({
      ...INITIAL_SESSION_STATE,
      rateLimit: {
        kind: "rejected",
        bucket: "five-hour",
        resetsAt: Temporal.Now.instant().add({ hours: 1 }).epochMilliseconds,
      },
    })
    render(
      <Turn
        turn={{
          ...turn([]),
          failure: { kind: "failed", failure: { kind: "api-error", error: "rate_limit" } },
        }}
        newest
        freshReport={false}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /に戻る · 依頼を入力欄に戻す$/ }))

    expect(useComposerDraft.getState().draft.text).toBe("架空の依頼")
  })
})

describe("Turn（目録の1行と見出し）", () => {
  const TASK = {
    kind: "task",
    id: "X-7",
    name: "架空の作業 `a/b` を直す",
    outcome: "finished",
    genre: "work",
  } as const

  function taskBody(
    report: string,
    changeSummary: ReportChangeSummary = { kind: "none" },
  ): MainViewStepBody {
    return {
      kind: "text",
      headings: [],
      report,
      finalReport: report,
      firstLine: report,
      task: TASK,
      finishedPhase: { kind: "none" },
      changeSummary,
    }
  }

  it("一覧に無いタスクの ID は押せない", () => {
    putSession(INITIAL_SESSION_STATE)
    render(
      <Turn
        turn={turn([step({ id: 0, body: taskBody("架空の本文"), final: true })])}
        newest
        freshReport={false}
      />,
    )

    expect(screen.queryByRole("button", { name: "X-7" })).toBeNull()
  })

  it("変更の札が数を持てば、目録の末尾に「変更 n ファイル +a −b」が出る", () => {
    putSession(INITIAL_SESSION_STATE)
    const body = taskBody("架空の本文", {
      kind: "counted",
      files: 3,
      added: 12,
      removed: 4,
      mixed: false,
    })
    const { container } = render(
      <Turn turn={turn([step({ id: 0, body, final: true })])} newest freshReport={false} />,
    )

    expect(container.querySelector("header > p")?.textContent).toBe(
      "最終レポート·X-7·✓ 完了·変更 3 ファイル +12 −4",
    )
  })

  it("変更の札が mixed なら、数の後ろに「※他の変更を含みうる」の注記が出る", () => {
    putSession(INITIAL_SESSION_STATE)
    const body = taskBody("架空の本文", {
      kind: "counted",
      files: 3,
      added: 12,
      removed: 4,
      mixed: true,
    })
    const { container } = render(
      <Turn turn={turn([step({ id: 0, body, final: true })])} newest freshReport={false} />,
    )

    expect(container.querySelector("header > p")?.textContent).toBe(
      "最終レポート·X-7·✓ 完了·変更 3 ファイル +12 −4 ※他の変更を含みうる",
    )
  })

  it("変更の札が none なら、目録に「変更」の字は出ない", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container } = render(
      <Turn
        turn={turn([step({ id: 0, body: taskBody("架空の本文"), final: true })])}
        newest
        freshReport={false}
      />,
    )

    expect(container.querySelector("header > p")?.textContent).not.toContain("変更")
  })

  it("一覧にあるタスクの ID を押すと、そのタスクを選んでタスクのモーダルを開くよう頼む", () => {
    putSession({
      ...INITIAL_SESSION_STATE,
      tasks: {
        kind: "known",
        items: [
          {
            id: "X-7",
            summary: "架空のタスク",
            status: "done",
            dependencies: [],
            waitingFor: [],
            labels: [],
            difficulty: undefined,
            loopable: undefined,
            body: "",
            location: { kind: "none" },
          },
        ],
      },
    })
    render(
      <Turn
        turn={turn([step({ id: 0, body: taskBody("架空の本文"), final: true })])}
        newest
        freshReport={false}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "X-7" }))

    expect(useTaskBoardRequest.getState().request).toEqual({
      kind: "open",
      focus: { kind: "task", id: "X-7" },
    })
  })

  it.each([
    ["finished", "X-7·✓ 完了"],
    ["awaiting-answer", "X-7·？ 答え待ち"],
    ["stopped", "X-7"],
  ] as const)("終わり方 %s の目録の1行は「%s」で、見出しは作業の名前", (outcome, catalog) => {
    putSession(INITIAL_SESSION_STATE)
    const body: MainViewStepBody = {
      kind: "text",
      headings: [],
      report: "架空の本文",
      finalReport: "架空の本文",
      firstLine: "架空の本文",
      task: { ...TASK, outcome },
      finishedPhase: { kind: "none" },
      changeSummary: { kind: "none" },
    }
    const { container } = render(
      <Turn turn={turn([step({ id: 0, body })])} newest freshReport={false} />,
    )

    expect(container.querySelector("header > p")?.textContent).toBe(catalog)
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("架空の作業 a/b を直す")
  })
})

describe("Turn（畳んだ中間レポートの見出し）", () => {
  function phaseStep(id: number, skipped: boolean): MainViewStep {
    return step({
      id,
      interim: true,
      superseded: true,
      body: {
        kind: "text",
        headings: [],
        report: "架空のまとめ",
        finalReport: "架空のまとめ",
        firstLine: `${String(id + 1)}/2 架空の段`,
        task: { kind: "none" },
        finishedPhase: {
          kind: "phase",
          label: `${String(id + 1)}/2 架空の段`,
          duration: { kind: "known", milliseconds: 0 },
          skipped,
        },
        changeSummary: { kind: "none" },
      },
    })
  }

  it("飛ばした段の <summary> は所要の前に「飛ばした」を出し、済んだ段は出さない", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container } = render(
      <Turn
        turn={turn([phaseStep(0, false), phaseStep(1, true), step({ id: 2, final: true })])}
        newest
        freshReport={false}
      />,
    )

    expect(
      [...container.querySelectorAll("details.is-interim > summary")].map(
        (node) => node.textContent,
      ),
    ).toEqual([
      "中間レポート: 1/2 架空の段 · 所要 0秒",
      "中間レポート: 2/2 架空の段 · 飛ばした · 所要 0秒",
    ])
  })
})

describe("Turn（脇の話の欄の位置）", () => {
  it("働くあいだ（最終レポートが無い）は、脇の話の欄が持ち主のステップの後ろ・次のレポートの前に並ぶ", () => {
    putSession(INITIAL_SESSION_STATE)
    const aside = { text: "架空の問い", answer: { kind: "waiting" } } as const
    const { container } = render(
      <Turn
        turn={turn([
          step({ id: 0, body: text("1つ目の本文"), interim: true, asides: [aside] }),
          step({ id: 1, body: text("2つ目の本文"), interim: true }),
        ])}
        newest
        freshReport={false}
      />,
    )

    const order = [...container.querySelectorAll("[data-report-stub], details")].map(
      (element) => element.textContent,
    )
    expect(order).toHaveLength(3)
    expect(order[0]).toBe("1つ目の本文")
    expect(order[1]).toContain("脇の話 1件")
    expect(order[2]).toBe("2つ目の本文")
  })

  it("最終レポートのある閉じたやり取りは、最終レポート → 脇の話の欄 → 経過の畳みの順に並ぶ", () => {
    putSession(INITIAL_SESSION_STATE)
    const aside = { text: "架空の問い", answer: { kind: "waiting" } } as const
    const { container } = render(
      <Turn
        turn={turn([
          step({
            id: 0,
            body: text("中間の本文"),
            interim: true,
            superseded: true,
            asides: [aside],
          }),
          step({ id: 1, body: text("最終の本文"), final: true }),
        ])}
        newest
        freshReport={false}
      />,
    )

    const top = [...container.querySelectorAll(":scope > div > div > *")].map(
      (element) => element.textContent,
    )
    expect(top).toHaveLength(3)
    expect(top[0]).toBe("最終の本文")
    expect(top[1]).toContain("脇の話 1件")
    expect(top[2]).toContain("経過 1 件")
    expect(top[2]).toContain("中間の本文")
  })

  it("本文も質問も無いステップの脇の話は、欄だけを描く", () => {
    putSession(INITIAL_SESSION_STATE)
    const aside = { text: "架空の問い", answer: { kind: "waiting" } } as const
    const { container } = render(
      <Turn turn={turn([step({ id: 0, asides: [aside] })])} newest freshReport={false} />,
    )

    expect(container.querySelectorAll("section")).toHaveLength(0)
    expect(container.querySelectorAll("details")).toHaveLength(1)
  })
})

describe("Turn（経過の畳み）", () => {
  const interims = [0, 1, 2].map((id) =>
    step({ id, body: text(`中間${String(id)}`), interim: true, superseded: true }),
  )

  it("閉じたやり取りでは、最終レポートの下に経過の畳みが1つだけ出て、中は届いた順の1行の畳み", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container } = render(
      <Turn
        turn={turn([...interims, step({ id: 3, body: text("最終"), final: true })])}
        newest
        freshReport={false}
      />,
    )

    const folds = container.querySelectorAll(".progress-fold")
    expect(folds).toHaveLength(1)
    const fold = typedElement(folds[0], HTMLDetailsElement, "経過の畳み")
    expect(fold.open).toBe(false)
    expect(fold.querySelector(":scope > summary")?.textContent).toBe("経過 3 件")
    expect(
      [...fold.querySelectorAll("details.is-interim > summary")].map(
        (summary) => summary.textContent,
      ),
    ).toEqual(["中間レポート: 中間0", "中間レポート: 中間1", "中間レポート: 中間2"])

    const stubs = [...container.querySelectorAll("[data-report-stub]")]
    expect(stubs.map((stub) => stub.textContent)).toEqual(["最終", "中間0", "中間1", "中間2"])
    expect(stubs.slice(1).every((stub) => fold.contains(stub))).toBe(true)
  })

  it("中間レポートが無い閉じたやり取りには、経過の畳みを出さない", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container } = render(
      <Turn
        turn={turn([step({ id: 0, body: text("最終"), final: true })])}
        newest
        freshReport={false}
      />,
    )

    expect(container.querySelector(".progress-fold")).toBeNull()
  })

  it("働くあいだは経過の畳みを出さず、中間レポートを届いた順に並べたまま", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container } = render(
      <Turn
        turn={turn([...interims, step({ id: 3, body: text("まだ決まらない本文") })])}
        newest
        freshReport={false}
      />,
    )

    expect(container.querySelector(".progress-fold")).toBeNull()
    expect(
      [...container.querySelectorAll("[data-report-stub]")].map((stub) => stub.textContent),
    ).toEqual(["中間0", "中間1", "中間2", "まだ決まらない本文"])
  })
})
