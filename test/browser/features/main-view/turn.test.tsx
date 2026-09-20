import { afterAll, afterEach, describe, expect, it, mock } from "bun:test"

import { cleanup, render } from "@testing-library/react"

import { type MainViewStep, type MainViewTurn } from "../../../../src/shared/main-view.ts"

// 本物の `Report`（react-markdown 一式と演出の配線を持つ）ではなく、**どの本文に演出を掛けると
// 言われたか**だけを記録する代役に差し替える。演出そのもの（`report-reveal.ts`）はレイアウトを
// 測るので DOM だけのテストでは確かめられず、ここで見たいのは**対象の選び方**の規則だけ。
//
// `mock.module` はプロセス全体に効くので、テストは `bun test --isolate` で回す
// （理由は `test/browser/features/main-view/report.test.tsx` の冒頭）。
let revealed: { readonly markdown: string; readonly reveal: boolean }[] = []

mock.module("../../../../src/browser/features/main-view/report.tsx", () => ({
  Report: (props: { readonly markdown: string; readonly reveal: boolean }) => {
    revealed.push({ markdown: props.markdown, reveal: props.reveal })
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

function step(overrides: Partial<MainViewStep> & { readonly id: number }): MainViewStep {
  return {
    report: undefined,
    interim: false,
    superseded: false,
    firstLine: undefined,
    actions: [],
    ...overrides,
  }
}

function turn(steps: readonly MainViewStep[]): MainViewTurn {
  return { id: 0, request: "架空の依頼", steps, droppedCount: 0 }
}

/** 演出を掛けると言われた本文（`reveal` が立っているもの）。 */
function revealTargets(): readonly string[] {
  return revealed.filter((call) => call.reveal).map((call) => call.markdown)
}

describe("Turn（書き上げる演出を掛ける相手）", () => {
  it("出し始めた時点で既にあった本文には掛けない（過去のタブ・読み込み直し）", () => {
    render(<Turn turn={turn([step({ id: 0, report: "確定した本文" })])} newest />)

    expect(revealTargets()).toEqual([])
  })

  it("あとから現れた確定レポートにだけ掛ける", () => {
    const { rerender } = render(<Turn turn={turn([step({ id: 0 })])} newest />)
    revealed = []

    rerender(
      <Turn turn={turn([step({ id: 0 }), step({ id: 1, report: "確定した本文" })])} newest />,
    )

    expect(revealTargets()).toEqual(["確定した本文"])
  })

  it("確定レポートが並んだら、最後の1件だけに掛ける", () => {
    const { rerender } = render(<Turn turn={turn([step({ id: 0, report: "1件目" })])} newest />)
    revealed = []

    rerender(
      <Turn
        turn={turn([step({ id: 0, report: "1件目" }), step({ id: 1, report: "2件目" })])}
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
        turn={turn([step({ id: 0 }), step({ id: 1, report: "途中の資料", interim: true })])}
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
        turn={turn([step({ id: 0 }), step({ id: 1, report: "確定した本文" })])}
        newest={false}
      />,
    )

    expect(revealTargets()).toEqual([])
  })

  it("同じ本文が描き直されても、掛ける相手は変わらない（一度きりの判定ではない）", () => {
    const { rerender } = render(<Turn turn={turn([step({ id: 0 })])} newest />)
    const grown = turn([step({ id: 0 }), step({ id: 1, report: "確定した本文" })])
    rerender(<Turn turn={grown} newest />)
    revealed = []

    rerender(<Turn turn={grown} newest />)

    // `Report` は `memo` で包まれていないので描き直されるが、`reveal` の値は同じまま
    // （演出を始めるかどうかは `useReportReveal` がマウント時に1度だけ決める）。
    expect(revealTargets()).toEqual(["確定した本文"])
  })
})
