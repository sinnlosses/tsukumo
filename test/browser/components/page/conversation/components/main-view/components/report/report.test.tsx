import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// `Markdown`（本物は react-markdown 一式で重い）を、呼ばれた回数と引数だけ記録する代役に
// 差し替える。`Report` が「変わらない塊は再描画しない」（docs/design.md「Markdown」）ことは、
// 本物の unified の出力では確かめづらい（同じ入力なら同じ出力になるため、再描画したか
// どうかが DOM からは見分けられない）。呼ばれたかどうかを直接数えるのが確実。
let calls: string[] = []

vi.mock(
  "../../../../../../../../../src/browser/components/page/conversation/components/main-view/markdown/markdown.tsx",
  () => ({
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

describe("Report（空行で塊に割り、塊ごとに memo）", () => {
  it("最初の描画では、すべての塊を1回ずつ描く", () => {
    render(<Report reveal={false} turnId={1} markdown={"固定の段落\n\n可変の段落1"} />)

    expect(calls).toEqual(["固定の段落", "可変の段落1"])
  })

  it("変わらない塊は再描画せず、変わった塊だけ描き直す", () => {
    const { rerender } = render(
      <Report reveal={false} turnId={1} markdown={"固定の段落\n\n可変の段落1"} />,
    )
    calls = []

    rerender(<Report reveal={false} turnId={1} markdown={"固定の段落\n\n可変の段落2"} />)

    expect(calls).toEqual(["可変の段落2"])
  })

  it("何も変わらなければ、どの塊も再描画しない", () => {
    const { rerender } = render(<Report reveal={false} turnId={1} markdown={"段落A\n\n段落B"} />)
    calls = []

    rerender(<Report reveal={false} turnId={1} markdown={"段落A\n\n段落B"} />)

    expect(calls).toEqual([])
  })
})
