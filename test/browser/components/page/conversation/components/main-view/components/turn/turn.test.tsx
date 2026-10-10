import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useComposerDraft } from "../../../../../../../../../src/browser/stores/composer-draft.ts"
import { useTaskBoardRequest } from "../../../../../../../../../src/browser/stores/task-board-request.ts"
import type {
  MainViewStep,
  MainViewStepBody,
  MainViewTurn,
} from "../../../../../../../../../src/shared/session/main-view.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../../../src/shared/session/session-state.ts"
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
    report,
    finalReport: report,
    firstLine: report,
    task: { kind: "none" },
    finishedPhase: { kind: "none" },
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
    usageReviewResult: false,
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
  } as const

  function taskBody(report: string): MainViewStepBody {
    return {
      kind: "text",
      report,
      finalReport: report,
      firstLine: report,
      task: TASK,
      finishedPhase: { kind: "none" },
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
      report: "架空の本文",
      finalReport: "架空の本文",
      firstLine: "架空の本文",
      task: { ...TASK, outcome },
      finishedPhase: { kind: "none" },
    }
    const { container } = render(
      <Turn turn={turn([step({ id: 0, body })])} newest freshReport={false} />,
    )

    expect(container.querySelector("header > p")?.textContent).toBe(catalog)
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("架空の作業 a/b を直す")
  })
})

describe("Turn（脇の話の欄の位置）", () => {
  it("脇の話の欄は、持ち主のステップの後ろ・次のレポートの前に並ぶ", () => {
    putSession(INITIAL_SESSION_STATE)
    const aside = { text: "架空の問い", answer: { kind: "waiting" } } as const
    const { container } = render(
      <Turn
        turn={turn([
          step({ id: 0, body: text("1つ目の本文"), interim: true, asides: [aside] }),
          step({ id: 1, body: text("2つ目の本文"), final: true }),
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

describe("Turn（見直しの結果の導線）", () => {
  it("見直しの結果を受け付けたやり取りにだけ、トークンの画面の結果の札を開く導線を出す", () => {
    putSession(INITIAL_SESSION_STATE)
    const steps = [step({ id: 0, body: text("本文"), final: true })]
    const { container, rerender } = render(
      <Turn turn={{ ...turn(steps), usageReviewResult: true }} newest freshReport={false} />,
    )

    const link = container.querySelector("a")
    expect(link?.textContent).toBe("結果を開く")
    expect(link?.getAttribute("href")).toBe("#token-usage?review=last")

    rerender(<Turn turn={turn(steps)} newest freshReport={false} />)

    expect(container.querySelector("a")).toBeNull()
  })
})
