import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { MainViewReportBody } from "../../../../../../../src/shared/session/main-view-shape.ts"
import { bodyMarkdownOf } from "../../../../../../fixture/main-view-entry.ts"
import { step, turn, turnBodyText, TURN_ID } from "../../../../../../fixture/turn.ts"

// 本物の `Report`（react-markdown 一式と演出の配線を持つ）ではなく、どの本文に演出を掛けると
// 言われたかだけを記録する代役に差し替える。演出そのもの（`useReportReveal`）は
// レイアウトを測るので DOM だけのテストでは確かめられず、ここで見たいのは対象の選び方の規則だけ。
let revealed: {
  readonly markdown: string
  readonly reveal: boolean
  readonly turnId: number
}[] = []

vi.mock(
  "../../../../../../../src/browser/components/page/conversation/components/main-view/report.tsx",
  () => ({
    Report: (props: {
      readonly body: MainViewReportBody
      readonly reveal: boolean
      turnId: number
    }) => {
      const markdown = bodyMarkdownOf(props.body)
      revealed.push({ markdown, reveal: props.reveal, turnId: props.turnId })
      return <div data-report-stub="yes">{markdown}</div>
    },
  }),
)

const { Turn } =
  await import("../../../../../../../src/browser/components/page/conversation/components/main-view/turn.tsx")

afterEach(() => {
  cleanup()
  revealed = []
})

/** 演出を掛けると言われた本文（`reveal` が立っているもの）。 */
function revealTargets(): readonly string[] {
  return revealed.filter((call) => call.reveal).map((call) => call.markdown)
}

describe("Turn（書き上げる演出を掛ける相手）", () => {
  it("出し始めた時点で既にあった本文には掛けない（過去のターン・読み込み直し）", () => {
    render(
      <Turn
        turn={turn([step({ id: 0, body: turnBodyText("確定した本文"), final: true })])}
        newest
        freshReport={false}
      />,
    )

    expect(revealTargets()).toEqual([])
  })

  it("地図から入れ替えたばかりのレポートは、出し始めた時点にあった最終レポートにも掛ける", () => {
    render(
      <Turn
        turn={turn([step({ id: 0, body: turnBodyText("届いた本文"), final: true })])}
        newest
        freshReport
      />,
    )

    expect(revealTargets()).toEqual(["届いた本文"])
  })

  it("本文にはやり取りの番号を渡す（残った筆先が別のやり取りの上へ出ないため）", () => {
    render(
      <Turn
        turn={turn([step({ id: 0, body: turnBodyText("確定した本文"), final: true })])}
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
        turn={turn([
          step({ id: 0 }),
          step({ id: 1, body: turnBodyText("確定した本文"), final: true }),
        ])}
        newest
        freshReport={false}
      />,
    )

    expect(revealTargets()).toEqual(["確定した本文"])
  })

  it("確定レポートが並んだら、最後の1件だけに掛ける", () => {
    const { rerender } = render(
      <Turn
        turn={turn([step({ id: 0, body: turnBodyText("1件目"), final: true })])}
        newest
        freshReport={false}
      />,
    )
    revealed = []

    rerender(
      <Turn
        turn={turn([
          step({ id: 0, body: turnBodyText("1件目") }),
          step({ id: 1, body: turnBodyText("2件目"), final: true }),
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
          step({ id: 0, body: turnBodyText("中間0"), interim: true, superseded: true }),
          step({ id: 1, body: turnBodyText("中間1"), interim: true, superseded: true }),
          step({ id: 2, body: turnBodyText("最終"), final: true }),
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
          step({ id: 0, body: turnBodyText("中間0"), interim: true, superseded: true }),
          step({ id: 1, body: turnBodyText("前の最終"), final: true }),
        ])}
        newest
        freshReport={false}
      />,
    )
    revealed = []

    rerender(
      <Turn
        turn={turn([
          step({ id: 0, body: turnBodyText("中間0"), interim: true, superseded: true }),
          step({ id: 1, body: turnBodyText("前の最終"), interim: true, superseded: true }),
          step({ id: 2, body: turnBodyText("新しい最終"), final: true }),
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
        turn={turn([
          step({ id: 0 }),
          step({ id: 1, body: turnBodyText("途中の資料"), interim: true }),
        ])}
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
        turn={turn([
          step({ id: 0 }),
          step({ id: 1, body: turnBodyText("確定した本文"), final: true }),
        ])}
        newest={false}
        freshReport={false}
      />,
    )

    expect(revealTargets()).toEqual([])
  })

  it("同じ本文が描き直されても、掛ける相手は変わらない（一度きりの判定ではない）", () => {
    const { rerender } = render(<Turn turn={turn([step({ id: 0 })])} newest freshReport={false} />)
    const grown = turn([
      step({ id: 0 }),
      step({ id: 1, body: turnBodyText("確定した本文"), final: true }),
    ])
    rerender(<Turn turn={grown} newest freshReport={false} />)
    revealed = []

    rerender(<Turn turn={grown} newest freshReport={false} />)

    // `Report` は `memo` で包まれていないので描き直されるが、`reveal` の値は同じまま
    // （演出を始めるかどうかは `useReportReveal` がマウント時に1度だけ決める）。
    expect(revealTargets()).toEqual(["確定した本文"])
  })
})
