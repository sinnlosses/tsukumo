import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Markdown } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/markdown-renderer.tsx"

afterEach(() => {
  cleanup()
})

describe("Markdown（unified への置き換えが求める記法）", () => {
  it("<sup> が上付きとして通り、<sub> はタグが落ちて中身の文字だけ残る", () => {
    const { container } = render(<Markdown text="x<sup>2</sup> と H<sub>2</sub>O" />)

    expect(container.querySelector("sup")?.textContent).toBe("2")
    expect(container.querySelector("sub")).toBeNull()
    expect(container.textContent).toContain("H2O")
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

  it("Markdown の表（thead / tbody）は通る", () => {
    const { container } = render(<Markdown text={"| a | b |\n| --- | --- |\n| 1 | 2 |"} />)

    expect(container.querySelector("table > thead th")?.textContent).toBe("a")
    expect(container.querySelector("table > tbody td")?.textContent).toBe("1")
  })

  it("モデルが書いた生の SVG は、色・変形・グループの属性と要素が落ちる", () => {
    const { container } = render(
      <Markdown
        text={
          '<svg viewBox="0 0 10 10" width="10" height="10"><g transform="rotate(5)">' +
          '<rect x="1" y="1" width="4" height="4" fill="red" stroke="blue" style="fill:red"></rect>' +
          "</g></svg>"
        }
      />,
    )

    const rect = container.querySelector("svg rect")
    expect(rect?.getAttribute("width")).toBe("4")
    expect(rect?.getAttribute("fill")).toBeNull()
    expect(rect?.getAttribute("stroke")).toBeNull()
    expect(rect?.getAttribute("style")).toBeNull()
    expect(container.querySelector("svg g")).toBeNull()
  })

  it("tsukumo が棒に付ける style（幅・左の余白・flex）は通る", () => {
    const { container } = render(
      <Markdown
        text={
          '<span class="cell-bar" style="width: 89%"></span>\n\n' +
          '<span class="timeline-bar" style="margin-left: 10%; width: 20%"></span>'
        }
      />,
    )

    const styles = [...container.querySelectorAll("span[style]")].map((span) =>
      span.getAttribute("style"),
    )
    expect(styles).toHaveLength(2)
    expect(styles[0]).toContain("89%")
    expect(styles[1]).toContain("20%")
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

  it("記法に無い class 名は素通しで描かれ、tsukumo の形でない style は落ちる", () => {
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
    expect(improvised?.getAttribute("style")).toBeNull()
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

  it("dl / dt / dd はタグが落ちて中身の文字だけ残る", () => {
    const { container } = render(
      <Markdown text="<dl><dt>付喪神</dt><dd>長く使った道具に宿るもの</dd></dl>" />,
    )

    expect(container.querySelector("dl")).toBeNull()
    expect(container.textContent).toContain("付喪神")
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
