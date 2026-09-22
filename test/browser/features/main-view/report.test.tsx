import { afterAll, afterEach, describe, expect, it, mock } from "bun:test"

import { cleanup, render } from "@testing-library/react"

// `Markdown`（本物は react-markdown 一式で重い）を、呼ばれた回数と引数だけ記録する代役に
// 差し替える。**`Report` が「変わらない塊は再描画しない」（`docs/design.md` 6.3）ことは、
// 本物の unified の出力では確かめづらい**（同じ入力なら同じ出力になるため、再描画したか
// どうかが DOM からは見分けられない）。呼ばれたかどうかを直接数えるのが確実。
//
// **`mock.module` はプロセス全体に効き、`mock.restore()` でも他のファイルへの漏れは止まらない**
// （素の `bun test` だと `test/browser/features/main-view/markdown/markdown.test.tsx` が代役の `Markdown` を見て10件落ちる。
// 実測）。**そのため `package.json` の `test` / `check` は `bun test --isolate` にして
// ある**（テストファイルごとにプロセスを分ける。実測で 1.1 秒 → 2.4 秒）。ここを素の `bun test`
// に戻すなら、先にこのファイルの差し替えをやめる必要がある。
let calls: string[] = []

mock.module("../../../../src/browser/features/main-view/markdown/markdown.tsx", () => ({
  Markdown: (props: { readonly text: string }) => {
    calls.push(props.text)
    return <div data-markdown-stub="yes">{props.text}</div>
  },
}))

const { Report } = await import("../../../../src/browser/features/main-view/report.tsx")

afterEach(() => {
  cleanup()
  calls = []
})

afterAll(() => {
  mock.restore()
})

describe("Report（空行で塊に割り、塊ごとに memo）", () => {
  it("最初の描画では、すべての塊を1回ずつ描く", () => {
    render(<Report reveal={false} markdown={"固定の段落\n\n可変の段落1"} />)

    expect(calls).toEqual(["固定の段落", "可変の段落1"])
  })

  it("変わらない塊は再描画せず、変わった塊だけ描き直す", () => {
    const { rerender } = render(<Report reveal={false} markdown={"固定の段落\n\n可変の段落1"} />)
    calls = []

    rerender(<Report reveal={false} markdown={"固定の段落\n\n可変の段落2"} />)

    expect(calls).toEqual(["可変の段落2"])
  })

  it("何も変わらなければ、どの塊も再描画しない", () => {
    const { rerender } = render(<Report reveal={false} markdown={"段落A\n\n段落B"} />)
    calls = []

    rerender(<Report reveal={false} markdown={"段落A\n\n段落B"} />)

    expect(calls).toEqual([])
  })
})
