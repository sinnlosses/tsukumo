import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render } from "@testing-library/react"
import { act } from "react"

import { Markdown } from "../../../src/ui/report/markdown.tsx"

afterEach(() => {
  cleanup()
})

/**
 * `MermaidBlock` / `ChartBlock` の `useEffect` は同梱スクリプトの読み込みを試み、この
 * テスト環境（happy-dom。実際のネットワークが無い）では失敗して1回だけ状態を更新する。
 * その1回分を `act()` の中で待ってから DOM を見る（`act` の外で起きる更新の警告を防ぐ）。
 */
async function flushEffects(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe("Markdown（unified への置き換え。T-063 が求める記法）", () => {
  it("引用 `> ` が <blockquote> になる", () => {
    const { container } = render(<Markdown text="> よそからの引用" />)

    expect(container.querySelector("blockquote")).not.toBeNull()
  })

  it("2段のネストしたリストが <ul> の入れ子になる", () => {
    const { container } = render(<Markdown text={"- 親\n  - 子"} />)

    expect(container.querySelector("ul > li > ul > li")).not.toBeNull()
  })

  it("`---` が <hr> になり、GFM テーブルの区切り行と衝突しない", () => {
    const { container } = render(
      <Markdown text={"段落\n\n---\n\n| a | b |\n| --- | --- |\n| 1 | 2 |"} />,
    )

    expect(container.querySelector("hr")).not.toBeNull()
    expect(container.querySelectorAll("table")).toHaveLength(1)
    // 区切り行そのものは表の一部として消費され、別の <hr> にはならない。
    expect(container.querySelectorAll("hr")).toHaveLength(1)
  })

  it("`:---:` が中央揃え、`---:` が右揃えの印を持つ", () => {
    const { container } = render(
      <Markdown text={"| 左 | 中 | 右 |\n| --- | :---: | ---: |\n| a | b | c |"} />,
    )

    // react-markdown（hast-util-to-jsx-runtime）は列揃えを `align` 属性ではなく
    // `style="text-align: ..."` として描く（React が `align` を非推奨として警告するため）。
    const cells = container.querySelectorAll("td")
    expect((cells[0] as HTMLTableCellElement).style.textAlign).toBe("")
    expect((cells[1] as HTMLTableCellElement).style.textAlign).toBe("center")
    expect((cells[2] as HTMLTableCellElement).style.textAlign).toBe("right")
  })

  it("note / badge / cols+card / details が通る", () => {
    const { container } = render(
      <Markdown
        text={
          '<div class="note note-warn">注意</div>\n\n' +
          '<span class="badge badge-ok">OK</span>\n\n' +
          '<div class="cols"><div class="card">A</div><div class="card">B</div></div>\n\n' +
          "<details><summary>見出し</summary>中身</details>"
        }
      />,
    )

    expect(container.querySelector("div.note.note-warn")).not.toBeNull()
    expect(container.querySelector("span.badge.badge-ok")).not.toBeNull()
    expect(container.querySelectorAll("div.cols > div.card")).toHaveLength(2)
    expect(container.querySelector("details > summary")).not.toBeNull()
  })

  it("script / iframe / on* 属性 / javascript: / style の url() が落ちる", () => {
    const { container } = render(
      <Markdown
        text={
          "<script>alert(1)</script>\n\n" +
          '<iframe src="https://example.invalid"></iframe>\n\n' +
          '<div onclick="alert(1)">中身</div>\n\n' +
          '<a href="javascript:alert(1)">危険なリンク</a>\n\n' +
          '<div style="background:url(https://example.invalid/x.png)">背景</div>'
        }
      />,
    )

    expect(container.querySelector("script")).toBeNull()
    expect(container.querySelector("iframe")).toBeNull()
    expect(container.innerHTML).not.toContain("onclick")
    // 危険なリンクの文字は残るが、タグとしての href は通らない。
    const dangerousLink = [...container.querySelectorAll("a")].find((a) =>
      a.textContent?.includes("危険なリンク"),
    )
    expect(dangerousLink?.getAttribute("href")).toBeFalsy()
    const styledDiv = [...container.querySelectorAll("div")].find(
      (div) => div.textContent === "背景",
    )
    expect(styledDiv?.getAttribute("style")).toBeFalsy()
  })

  it("コードスパンの中の HTML は文字のまま出る", () => {
    const { container } = render(<Markdown text="これは `<b>太字っぽい文字列</b>` です" />)

    const code = container.querySelector("code")
    expect(code?.textContent).toBe("<b>太字っぽい文字列</b>")
    expect(code?.querySelector("b")).toBeNull()
  })

  it("img は許可しない", () => {
    const { container } = render(<Markdown text="![代替テキスト](https://example.invalid/x.png)" />)

    expect(container.querySelector("img")).toBeNull()
  })

  it("```mermaid フェンスは MermaidBlock（pre.mermaid）に振り分けられる", async () => {
    const { container } = render(<Markdown text={"```mermaid\nflowchart TD\nA --> B\n```"} />)

    expect(container.querySelector("pre.mermaid")).not.toBeNull()
    expect(container.querySelector("pre.mermaid")?.textContent).toContain("flowchart TD")
    await flushEffects()
  })

  it("```chart フェンスは ChartBlock（.chart-block > canvas）に振り分けられる", async () => {
    const { container } = render(<Markdown text={'```chart\n{"type":"bar","data":{}}\n```'} />)

    expect(container.querySelector(".chart-block > canvas")).not.toBeNull()
    await flushEffects()
  })

  it("通常の言語名付きフェンスは色付け対象の <pre><code> のまま", () => {
    const { container } = render(<Markdown text={"```ts\nconst a = 1\n```"} />)

    const code = container.querySelector("pre code")
    expect(code).not.toBeNull()
    expect(code?.className).toContain("language-ts")
  })
})
