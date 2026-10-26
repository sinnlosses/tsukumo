import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { MainViewReportBody } from "../../../../../../../../../src/shared/session/main-view-shape.ts"

// `Markdown`（本物は react-markdown 一式で重い）を、呼ばれた回数と引数だけ記録する代役に
// 差し替える。`Report` が「変わらない塊は再描画しない」（docs/architecture/browser.md「Markdown」）ことは、
// 本物の unified の出力では確かめづらい（同じ入力なら同じ出力になるため、再描画したか
// どうかが DOM からは見分けられない）。呼ばれたかどうかを直接数えるのが確実。
let calls: string[] = []

vi.mock(
  "../../../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx",
  () => ({
    detailBlockClassName: "detail-block",
    Markdown: (props: { readonly text: string }) => {
      calls.push(props.text)
      return <div data-markdown-stub="yes">{props.text}</div>
    },
  }),
)

const { Report } =
  await import("../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/report/report.tsx")

afterEach(() => {
  cleanup()
  calls = []
})

function markdownBody(markdown: string): MainViewReportBody {
  return { kind: "markdown", markdown }
}

function regionsBody(text: string): MainViewReportBody {
  return {
    kind: "regions",
    head: "結論",
    finalHead: "結論",
    sections: [{ id: 0, heading: "", markdown: text }],
    retrospective: "",
    favor: { id: "favor-fictional", markdown: "" },
  }
}

describe("Report（書き上げる演出を飛ばす口）", () => {
  it("演出を掛けるレポートには「全部出す」の口を置き、掛けないレポートには置かない", () => {
    const { rerender } = render(
      <Report reveal={true} turnId={1} className="" body={markdownBody("段落")} />,
    )
    expect(screen.queryByRole("button", { name: "全部出す" })).not.toBeNull()

    rerender(<Report reveal={false} turnId={1} className="" body={markdownBody("段落")} />)
    expect(screen.queryByRole("button", { name: "全部出す" })).toBeNull()
  })

  it("本文が phone-hidden のとき、口は本文の兄弟として並ぶ（隠す CSS が `> .phone-hidden[data-revealing]` で口を引ける形）", () => {
    const text = "架空の本文。".repeat(40)
    const { container } = render(
      <Report reveal={true} turnId={1} className="phone-hidden" body={regionsBody(text)} />,
    )

    const body = container.querySelector("[data-report-body]")
    expect(body?.classList.contains("phone-hidden")).toBe(true)
    expect(body?.hasAttribute("data-revealing")).toBe(true)
    expect(screen.getByRole("button", { name: "全部出す" }).parentElement).toBe(body?.parentElement)
  })

  it("口を押すと、窓で聞いている飛ばしの経路に乗って演出が終わる", () => {
    const text = "架空の本文。".repeat(40)
    const { container } = render(
      <Report reveal={true} turnId={1} className="" body={regionsBody(text)} />,
    )
    const body = container.querySelector("[data-report-body]")
    expect(body?.hasAttribute("data-revealing")).toBe(true)

    fireEvent.pointerDown(screen.getByRole("button", { name: "全部出す" }))

    expect(body?.hasAttribute("data-revealing")).toBe(false)
  })
})

describe("Report（長い1文目の畳み）", () => {
  const head = (text: string): MainViewReportBody => ({
    kind: "regions",
    head: text,
    finalHead: text,
    sections: [],
    retrospective: "",
    favor: { id: "favor-fictional", markdown: "" },
  })
  const clampedRegion = (container: HTMLElement): Element | null =>
    container.querySelector("[data-report-region='head']")

  it("1文目が50字を超える頭の欄は畳んで始め、口を押すと開き、もう一度押すと畳む", () => {
    const { container } = render(
      <Report reveal={false} turnId={1} className="" body={head(`${"あ".repeat(60)}。`)} />,
    )
    expect(clampedRegion(container)?.hasAttribute("data-first-sentence-clamped")).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "全文" }))
    expect(clampedRegion(container)?.hasAttribute("data-first-sentence-clamped")).toBe(false)

    fireEvent.click(screen.getByRole("button", { name: "畳む" }))
    expect(clampedRegion(container)?.hasAttribute("data-first-sentence-clamped")).toBe(true)
  })

  it("1文目が短い頭の欄は畳まず、口も置かない", () => {
    const { container } = render(
      <Report reveal={false} turnId={1} className="" body={head("短い結論。")} />,
    )
    expect(clampedRegion(container)?.hasAttribute("data-first-sentence-clamped")).toBe(false)
    expect(screen.queryByRole("button", { name: "全文" })).toBeNull()
  })
})

describe("Report（空行で塊に割り、塊ごとに memo）", () => {
  it("最初の描画では、すべての塊を1回ずつ描く", () => {
    render(
      <Report
        reveal={false}
        turnId={1}
        className=""
        body={markdownBody("固定の段落\n\n可変の段落1")}
      />,
    )

    expect(calls).toEqual(["固定の段落", "可変の段落1"])
  })

  it("変わらない塊は再描画せず、変わった塊だけ描き直す", () => {
    const { rerender } = render(
      <Report
        reveal={false}
        turnId={1}
        className=""
        body={markdownBody("固定の段落\n\n可変の段落1")}
      />,
    )
    calls = []

    rerender(
      <Report
        reveal={false}
        turnId={1}
        className=""
        body={markdownBody("固定の段落\n\n可変の段落2")}
      />,
    )

    expect(calls).toEqual(["可変の段落2"])
  })

  it("同じ文字列の塊が2つあっても key の警告が出ない", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)

    render(
      <Report reveal={false} turnId={1} className="" body={markdownBody("同じ段落\n\n同じ段落")} />,
    )

    expect(calls).toEqual(["同じ段落", "同じ段落"])
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })
})
