import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render } from "@testing-library/react"
import { act } from "react"

import { Markdown } from "../../../../../src/ui/features/main-view/markdown/markdown.tsx"

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

describe("Markdown（unified への置き換えが求める記法）", () => {
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

  it("`##` が見出し（h4）として描かれる（タグの落ちた素のテキストにならない）", () => {
    const { container } = render(<Markdown text="## みだし2" />)

    expect(container.querySelector("h4")?.textContent).toBe("みだし2")
    // ページ本体の依頼の見出し（h2.turn-request）と段を混同しないよう、DOM には h2 を残さない。
    expect(container.querySelector("h2")).toBeNull()
  })

  it("`###` が見出し（h5）として描かれる", () => {
    const { container } = render(<Markdown text="### みだし3" />)

    expect(container.querySelector("h5")?.textContent).toBe("みだし3")
    expect(container.querySelector("h3")).toBeNull()
  })

  it("表は横スクロールの器（div.table-scroll）に包まれる", () => {
    const { container } = render(<Markdown text={"| 見出し | 値 |\n| --- | --- |\n| あ | 1 |"} />)

    expect(container.querySelectorAll("div.table-scroll > table")).toHaveLength(1)
  })

  it("レポートが直接書いた <table> も同じ器に包まれる（rehype-raw と同じ木を通るため）", () => {
    const { container } = render(
      <Markdown text="<table><tbody><tr><td>あ</td></tr></tbody></table>" />,
    )

    expect(container.querySelectorAll("div.table-scroll > table")).toHaveLength(1)
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

  it("お願い（note-favor）が塊のまま通る（class が落ちると地の文に紛れる）", () => {
    const { container } = render(
      <Markdown text={'<div class="note note-favor">架空のお願いの文。</div>'} />,
    )

    // 「お願い」のラベルは CSS の ::before が付けるので、ここで見るのは class が残ることだけ。
    const favor = container.querySelector("div.note.note-favor")
    expect(favor).not.toBeNull()
    expect(favor?.textContent).toBe("架空のお願いの文。")
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

    // 表が <details> の外に出ると、畳まれずに常に見えてしまう（2026-09-15 のユーザーの報告
    // 「展開を押しても意味なく、最初から展開済みの文章が出てしまっている」）。
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

  it("```mermaid フェンスは MermaidBlock（pre.mermaid）に振り分けられる", async () => {
    const { container } = render(<Markdown text={"```mermaid\nflowchart TD\nA --> B\n```"} />)

    expect(container.querySelector("pre.mermaid")).not.toBeNull()
    expect(container.querySelector("pre.mermaid")?.textContent).toContain("flowchart TD")
    await flushEffects()
  })

  it("MermaidBlock は失敗したら mermaid のエラー図を描かず、コードとエラー文を出す", async () => {
    // この環境（happy-dom。実際のネットワークが無い）では同梱スクリプトの読み込み自体が失敗する
    // （上のテストの flushEffects と同じ経路）。mermaid のグローバルを差し替えて構文エラーを
    // 再現する代わりに、**この自然に起きる失敗を「壊れたときの経路」として検証する**
    // （読み込み失敗も構文エラーも MermaidBlock は同じ catch で受け止める設計のため）。
    const { container } = render(<Markdown text={"```mermaid\nflowchart TD\nA --> B\n```"} />)

    await flushEffects()

    // mermaid 自身のエラー図（pre.mermaid の中身が書き換わる形）ではなく、専用の表示に替わる。
    expect(container.querySelector("pre.mermaid")).toBeNull()
    const broken = container.querySelector(".mermaid-broken")
    expect(broken).not.toBeNull()
    // (b) 元のコードがそのまま読める。
    expect(broken?.querySelector("pre > code")?.textContent).toContain("flowchart TD")
    // (c) エラー文が出ている。
    const errorText = container.querySelector(".mermaid-error")?.textContent
    expect(errorText).toBeTruthy()
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

describe("Markdown（remark-cjk-friendly。CJK の強調が記法のまま出る事故の回帰）", () => {
  it("素の強調はそのまま太字になる", () => {
    const { container } = render(<Markdown text="これは**太字**です" />)

    expect(container.querySelector("strong")?.textContent).toBe("太字")
  })

  it("中身が「（かぎ括弧）で始まり・終わる強調が太字になる", () => {
    const { container } = render(<Markdown text="分離は**「呼んだか」**で決まる" />)

    expect(container.querySelector("strong")?.textContent).toBe("「呼んだか」")
  })

  it("中身が丸括弧で始まり・終わる強調が太字になる", () => {
    const { container } = render(<Markdown text="分離は**（呼んだか）**で決まる" />)

    expect(container.querySelector("strong")?.textContent).toBe("（呼んだか）")
  })

  it("中身が句点で終わる強調が太字になる", () => {
    const { container } = render(<Markdown text="分離は**決まる。**次へ" />)

    expect(container.querySelector("strong")?.textContent).toBe("決まる。")
  })

  it("閉じ側の直後が空白でも太字になる", () => {
    const { container } = render(<Markdown text="分離は**「呼んだか」** で決まる" />)

    expect(container.querySelector("strong")?.textContent).toBe("「呼んだか」")
  })

  it("中身がかぎ括弧の斜体が斜体になる", () => {
    const { container } = render(<Markdown text="これは*「斜体」*です" />)

    expect(container.querySelector("em")?.textContent).toBe("「斜体」")
  })

  // 既知の穴: remark-cjk-friendly は GFM の取り消し線（`~~`）の delimiter run を直さない
  // （パッケージの README が明記。直すには別パッケージ `remark-cjk-friendly-gfm-strikethrough`
  // が要るが、ユーザーが承認したのは `remark-cjk-friendly` 単体のみなので、この
  // ケースはここでは直さず、実際の（まだ直っていない）挙動を固定して次に見た人が気づけるようにする。
  it("中身がかぎ括弧の取り消し線はまだ直らない（別パッケージが要る既知の穴）", () => {
    const { container } = render(<Markdown text="これは~~「消し」~~です" />)

    expect(container.querySelector("del")).toBeNull()
    expect(container.textContent).toContain("~~「消し」~~")
  })

  it("コードスパンの中のかぎ括弧は変わらず通常どおり", () => {
    const { container } = render(<Markdown text="これは`「コード」`です" />)

    expect(container.querySelector("code")?.textContent).toBe("「コード」")
  })

  it("リンクテキストの中のかぎ括弧は変わらず通常どおり", () => {
    const { container } = render(<Markdown text="これは[「リンク」](https://example.com)です" />)

    const link = container.querySelector("a")
    expect(link?.textContent).toBe("「リンク」")
    expect(link?.getAttribute("href")).toBe("https://example.com")
  })
})
