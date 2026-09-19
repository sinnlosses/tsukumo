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

    // class 名は `notation.tsx` が tsukumo の名前に付け替える（notation.test.tsx が対応表を見る）。
    expect(container.querySelector("div.report-note.report-note-warn")).not.toBeNull()
    expect(container.querySelector("span.report-badge.report-badge-ok")).not.toBeNull()
    expect(container.querySelectorAll("div.report-cols > div.report-card")).toHaveLength(2)
    expect(container.querySelector("details > summary")).not.toBeNull()
  })

  it("数の要約（stats / stat）が塊のまま通る", () => {
    const { container } = render(
      <Markdown
        text={
          '<div class="stats"><div class="stat"><b>312</b>通ったテスト</div>' +
          '<div class="stat"><strong>0</strong>失敗</div></div>'
        }
      />,
    )

    // 器と枚数（class が落ちると数が地の文に並ぶだけになる）。
    expect(container.querySelectorAll("div.report-stats > div.report-stat")).toHaveLength(2)
    // 数の側は <b> でも <strong> でも同じ見た目になる（CSS はどちらも受ける）。
    expect(container.querySelector("div.report-stat > b")?.textContent).toBe("312")
    expect(container.querySelector("div.report-stat > strong")?.textContent).toBe("0")
  })

  it("数のバー（meter / progress）は許可リストに無いので落ちる", () => {
    // 数の見せ方を stats/stat の1通りに保つための線引き（src/core/report-notation.ts）。
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

  it("チェックリストの `- [ ]` と `- [x]` が、済みと未了の分かる印になる", () => {
    const { container } = render(<Markdown text={"- [ ] まだ\n- [x] 済み"} />)

    // 操作できる要素は許可リストに無い（task-check.ts が静的な印の span に畳む）。
    expect(container.querySelector("input")).toBeNull()
    const marks = container.querySelectorAll("span.report-task-check")
    expect(marks).toHaveLength(2)
    // 未了は空の枠、済みは枠の中の印（色ではなく文字で見分ける）。
    expect(marks[0]?.textContent).toBe("")
    expect(marks[0]?.className).not.toContain("report-task-check-done")
    expect(marks[1]?.textContent).toBe("✓")
    expect(marks[1]?.className).toContain("report-task-check-done")
    // 行頭の点と印が二重に並ばないようにする class（CSS が list-style を消す）。
    expect(container.querySelectorAll("li.report-task-item")).toHaveLength(2)
  })

  it("レポートが直接書いたチェックボックスも印になり、それ以外の input は落ちる", () => {
    const { container } = render(
      <Markdown
        text={
          '<p><input type="checkbox" checked> 済みの行</p>\n\n' +
          '<p><input type="text"> 入力欄のつもり</p>'
        }
      />,
    )

    expect(container.querySelector("input")).toBeNull()
    expect(container.querySelector("span.report-task-check-done")?.textContent).toBe("✓")
    expect(container.textContent).toContain("入力欄のつもり")
  })

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
    // （meter / progress を載せない理由と同じ。src/core/report-notation.ts）。
    const { container } = render(<Markdown text="<mark>目立たせたい語</mark>" />)

    expect(container.querySelector("mark")).toBeNull()
    expect(container.textContent).toContain("目立たせたい語")
  })

  it("お願い（note-favor）が塊のまま通る（class が落ちると地の文に紛れる）", () => {
    const { container } = render(
      <Markdown text={'<div class="note note-favor">架空のお願いの文。</div>'} />,
    )

    // ラベル（「お願い」）は `notation.tsx` が足すので、本文はそのあとに続く。
    const favor = container.querySelector("div.report-note.report-note-favor")
    expect(favor).not.toBeNull()
    expect(favor?.textContent).toBe("お願い架空のお願いの文。")
  })

  it("記法に無い class 名と style 属性は、素通しして描かれる", () => {
    // 記法の変換は足し算だけで、規約の表に無い見せ方（モデルの即興）を落とさない
    // （危ない経路は sanitize-schema.ts が別に見ている）。
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

  it("```diff フェンスの足した行・消した行が色分けされる", () => {
    // 規約が \`\`\`diff を勧めている根拠（src/core/report-notation.ts のコードの行）。
    // rehype-highlight（lowlight の common に diff が入っている）が付ける class と、
    // テーマ（highlight.js の github-dark）の .hljs-addition / .hljs-deletion が対。
    const { container } = render(<Markdown text={"```diff\n-const a = 1\n+const a = 2\n```"} />)

    expect(container.querySelector("pre code.language-diff .hljs-addition")?.textContent).toBe(
      "+const a = 2",
    )
    expect(container.querySelector("pre code.language-diff .hljs-deletion")?.textContent).toBe(
      "-const a = 1",
    )
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
