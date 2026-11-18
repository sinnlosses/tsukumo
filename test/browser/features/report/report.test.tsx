import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { MainViewReportBody } from "../../../../src/shared/session/main-view-shape.ts"
import { noRootA2ui } from "../../../fixture/main-view-entry.ts"

// `Markdown`（本物は react-markdown 一式で重い）を、呼ばれた回数と引数だけ記録する代役に
// 差し替える。塊ごとに何を渡したかを直接数える。
let calls: string[] = []

vi.mock("../../../../src/browser/features/report/markdown.tsx", () => ({
  detailBlockClassName: "detail-block",
  textLeafClassNames: {},
  noteLeafClassNames: {},
  tableLeafClassNames: {},
  matrixLeafClassNames: {},
  compareLeafClassNames: {},
  statsLeafClassNames: {},
  checksClassName: () => undefined,
  Markdown: (props: { readonly text: string }) => {
    calls.push(props.text)
    return <div data-markdown-stub="yes">{props.text}</div>
  },
}))

const { Report } = await import("../../../../src/browser/features/report/report.tsx")

afterEach(() => {
  cleanup()
  calls = []
})

function markdownBody(markdown: string): MainViewReportBody {
  return { kind: "markdown", markdown }
}

describe("Report（空行で塊に割る）", () => {
  it("最初の描画では、すべての塊を1回ずつ描く", () => {
    render(
      <Report
        reveal={false}
        turnId={1}
        className=""
        revealClassName=""
        blockClassName=""
        body={markdownBody("固定の段落\n\n可変の段落1")}
      />,
    )

    expect(calls).toEqual(["固定の段落", "可変の段落1"])
  })

  it("同じ文字列の塊が2つあっても key の警告が出ない", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)

    render(
      <Report
        reveal={false}
        turnId={1}
        className=""
        revealClassName=""
        blockClassName=""
        body={markdownBody("同じ段落\n\n同じ段落")}
      />,
    )

    expect(calls).toEqual(["同じ段落", "同じ段落"])
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })
})

describe("Report（紙に次の一手を出さない）", () => {
  it("最新の最終レポートとして描いても、紙に次の一手の group は無い", () => {
    render(
      <Report
        reveal={false}
        turnId={1}
        className=""
        revealClassName=""
        blockClassName=""
        favorPressable
        body={{ kind: "regions", sections: [], a2ui: noRootA2ui() }}
      />,
    )

    expect(screen.queryByRole("group", { name: "次の一手" })).toBeNull()
  })
})
