import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Markdown } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/markdown-renderer.tsx"

afterEach(() => {
  cleanup()
})

describe("Markdown（unified への置き換えが求める記法）", () => {
  it("<sup> / <sub> が上付き・下付きとして通る", () => {
    const { container } = render(<Markdown text="x<sup>2</sup> と H<sub>2</sub>O" />)

    expect(container.querySelector("sup")?.textContent).toBe("2")
    expect(container.querySelector("sub")?.textContent).toBe("2")
  })

  it("脚注の節の見出しが日本語で出る（英語の Footnotes が本文に見えない）", () => {
    const { container } = render(<Markdown text={"結論[^1]\n\n[^1]: 補足の一行。"} />)

    expect(container.textContent).not.toContain("Footnotes")
    const label = container.querySelector("#footnote-label")
    expect(label?.textContent).toBe("脚注")
    // 見出しは `##` と同じく h4 に落ちる（依頼の見出しと段が被らない）。
    expect(label?.tagName.toLowerCase()).toBe("h4")
    // 参照の番号は <sup> で上付きに出る（許可リストに sup が無いと数字が地の文に紛れる）。
    expect(container.querySelector("sup > a")?.getAttribute("href")).toBe("#user-content-fn-1")
  })

  it("表の脚（tfoot）が通る", () => {
    const { container } = render(
      <Markdown
        text={
          "<table><tbody><tr><td>あ</td></tr></tbody>" +
          "<tfoot><tr><td>合計</td></tr></tfoot></table>"
        }
      />,
    )

    expect(container.querySelector("tfoot > tr > td")?.textContent).toBe("合計")
  })

  it("mark は許可リストに無いので落ちる（強調の道具を増やさない）", () => {
    // 既定の黄地に黒文字はこの配色から浮き、当て直すと strong / badge と並んで3通りになる
    // （meter / progress を載せない理由と同じ。`REPORT_NOTATION_PROMPT`）。
    const { container } = render(<Markdown text="<mark>目立たせたい語</mark>" />)

    expect(container.querySelector("mark")).toBeNull()
    expect(container.textContent).toContain("目立たせたい語")
  })

  it("数のバー（meter / progress）は許可リストに無いので落ちる", () => {
    // 数の見せ方を stats/stat の1通りに保つための線引き（`REPORT_NOTATION_PROMPT`）。
    // タグは落ちるが中身の文字は残るので、書いても数そのものは読める。
    const { container } = render(
      <Markdown
        text={'<meter value="0.6">60%</meter>\n\n<progress value="60" max="100">60%</progress>'}
      />,
    )

    expect(container.querySelector("meter")).toBeNull()
    expect(container.querySelector("progress")).toBeNull()
    expect(container.textContent).toContain("60%")
  })

  it("記法に無い class 名と style 属性は、素通しして描かれる", () => {
    // 記法の変換は足し算だけで、規約の表に無い見せ方（モデルの即興）を落とさない
    // （危ない経路は `REPORT_SANITIZE_SCHEMA` が別に見ている）。
    const { container } = render(
      <Markdown
        text={
          '<div class="zzz">知らない印</div>\n\n' +
          '<div style="display:grid;grid-template-columns:1fr 1fr">即興の段組み</div>'
        }
      />,
    )

    expect(container.querySelector("div.zzz")?.textContent).toBe("知らない印")
    const improvised = [...container.querySelectorAll("div")].find(
      (div) => div.textContent === "即興の段組み",
    )
    expect(improvised?.style.display).toBe("grid")
    expect(improvised?.style.gridTemplateColumns).toBe("1fr 1fr")
  })

  it("<details> の中の Markdown が、空行を挟めば <details> の中で解釈される", () => {
    const { container } = render(
      <Markdown
        text={
          "<details>\n<summary>長い根拠</summary>\n\n" +
          "| a | b |\n| --- | --- |\n| 1 | 2 |\n\n" +
          "</details>"
        }
      />,
    )

    // 表が <details> の外に出ると、畳まれずに常に見えてしまう
    // （「展開を押しても意味なく、最初から展開済みの文章が出てしまっている」という報告）。
    expect(container.querySelector("details table")).not.toBeNull()
    expect(container.querySelector("details > summary")?.textContent).toBe("長い根拠")
  })

  it("用語と説明の対（dl / dt / dd）が通る", () => {
    const { container } = render(
      <Markdown text="<dl><dt>付喪神</dt><dd>長く使った道具に宿るもの</dd></dl>" />,
    )

    expect(container.querySelector("dl > dt")?.textContent).toBe("付喪神")
    expect(container.querySelector("dl > dd")?.textContent).toBe("長く使った道具に宿るもの")
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
})
