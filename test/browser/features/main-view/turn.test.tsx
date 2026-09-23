import { afterAll, afterEach, describe, expect, it, mock } from "bun:test"

import { cleanup, render } from "@testing-library/react"

import {
  type MainViewStep,
  type MainViewStepBody,
  type MainViewTurn,
} from "../../../../src/shared/main-view.ts"

// 本物の `Report`（react-markdown 一式と演出の配線を持つ）ではなく、**どの本文に演出を掛けると
// 言われたか**だけを記録する代役に差し替える。演出そのもの（`hooks/use-report-reveal.ts`）は
// レイアウトを測るので DOM だけのテストでは確かめられず、ここで見たいのは**対象の選び方**の規則だけ。
//
// `mock.module` はプロセス全体に効くので、テストは `bun test --isolate` で回す
// （理由は `test/browser/features/main-view/report.test.tsx` の冒頭）。
let revealed: {
  readonly markdown: string
  readonly reveal: boolean
  readonly turnId: number
}[] = []

mock.module("../../../../src/browser/features/main-view/report.tsx", () => ({
  Report: (props: { readonly markdown: string; readonly reveal: boolean; turnId: number }) => {
    revealed.push({ markdown: props.markdown, reveal: props.reveal, turnId: props.turnId })
    return <div data-report-stub="yes">{props.markdown}</div>
  },
}))

const { Turn } = await import("../../../../src/browser/features/main-view/turn.tsx")

afterEach(() => {
  cleanup()
  revealed = []
})

afterAll(() => {
  mock.restore()
})

/** 本文を持つステップの `body`。先頭行は本文そのもの（1行の本文しか使わないため）。 */
function text(report: string): MainViewStepBody {
  return { kind: "text", report, firstLine: report }
}

function step(overrides: Partial<MainViewStep> & { readonly id: number }): MainViewStep {
  return {
    body: { kind: "none" },
    interim: false,
    superseded: false,
    final: false,
    actions: [],
    ...overrides,
  }
}

/** やり取りの番号。**筆先に添えて配られる**ので、`<Report>` まで届いていることを見る。 */
const TURN_ID = 5

function turn(steps: readonly MainViewStep[]): MainViewTurn {
  return {
    id: TURN_ID,
    request: { text: "架空の依頼", images: [] },
    steps,
    hasInterimReport: false,
    droppedCount: 0,
  }
}

/** 演出を掛けると言われた本文（`reveal` が立っているもの）。 */
function revealTargets(): readonly string[] {
  return revealed.filter((call) => call.reveal).map((call) => call.markdown)
}

describe("Turn（書き上げる演出を掛ける相手）", () => {
  it("出し始めた時点で既にあった本文には掛けない（過去のターン・読み込み直し）", () => {
    render(<Turn turn={turn([step({ id: 0, body: text("確定した本文"), final: true })])} newest />)

    expect(revealTargets()).toEqual([])
  })

  it("本文にはやり取りの番号を渡す（残った筆先が別のやり取りの上へ出ないため）", () => {
    render(<Turn turn={turn([step({ id: 0, body: text("確定した本文"), final: true })])} newest />)

    expect(revealed.map((call) => call.turnId)).toEqual([TURN_ID])
  })

  it("あとから現れた確定レポートにだけ掛ける", () => {
    const { rerender } = render(<Turn turn={turn([step({ id: 0 })])} newest />)
    revealed = []

    rerender(
      <Turn
        turn={turn([step({ id: 0 }), step({ id: 1, body: text("確定した本文"), final: true })])}
        newest
      />,
    )

    expect(revealTargets()).toEqual(["確定した本文"])
  })

  it("確定レポートが並んだら、最後の1件だけに掛ける", () => {
    const { rerender } = render(
      <Turn turn={turn([step({ id: 0, body: text("1件目"), final: true })])} newest />,
    )
    revealed = []

    rerender(
      <Turn
        turn={turn([
          step({ id: 0, body: text("1件目") }),
          step({ id: 1, body: text("2件目"), final: true }),
        ])}
        newest
      />,
    )

    expect(revealTargets()).toEqual(["2件目"])
  })

  it("中間レポートには掛けない（流れている最中に少しずつ出る本文なので）", () => {
    const { rerender } = render(<Turn turn={turn([step({ id: 0 })])} newest />)
    revealed = []

    rerender(
      <Turn
        turn={turn([step({ id: 0 }), step({ id: 1, body: text("途中の資料"), interim: true })])}
        newest
      />,
    )

    expect(revealTargets()).toEqual([])
  })

  it("今回のやり取りでなければ掛けない", () => {
    const { rerender } = render(<Turn turn={turn([step({ id: 0 })])} newest={false} />)
    revealed = []

    rerender(
      <Turn
        turn={turn([step({ id: 0 }), step({ id: 1, body: text("確定した本文"), final: true })])}
        newest={false}
      />,
    )

    expect(revealTargets()).toEqual([])
  })

  it("同じ本文が描き直されても、掛ける相手は変わらない（一度きりの判定ではない）", () => {
    const { rerender } = render(<Turn turn={turn([step({ id: 0 })])} newest />)
    const grown = turn([step({ id: 0 }), step({ id: 1, body: text("確定した本文"), final: true })])
    rerender(<Turn turn={grown} newest />)
    revealed = []

    rerender(<Turn turn={grown} newest />)

    // `Report` は `memo` で包まれていないので描き直されるが、`reveal` の値は同じまま
    // （演出を始めるかどうかは `useReportReveal` がマウント時に1度だけ決める）。
    expect(revealTargets()).toEqual(["確定した本文"])
  })
})

describe("Turn（最終レポートのラベル）", () => {
  it("中間レポートのあるやり取りでは、最終レポートにラベルを載せる", () => {
    const { container } = render(
      <Turn
        turn={{
          ...turn([
            step({ id: 0, body: text("途中の資料"), interim: true, superseded: true }),
            step({ id: 1, body: text("締めの本文"), final: true }),
          ]),
          hasInterimReport: true,
        }}
        newest={false}
      />,
    )

    expect(container.textContent).toContain("最終レポート")
  })

  it("本文が1つだけのやり取りでは載せない（「最終」が何も区別しないため）", () => {
    const { container } = render(
      <Turn turn={turn([step({ id: 0, body: text("締めの本文"), final: true })])} newest={false} />,
    )

    expect(container.textContent).not.toContain("最終レポート")
  })
})
