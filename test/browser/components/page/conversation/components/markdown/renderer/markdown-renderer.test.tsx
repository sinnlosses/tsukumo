import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Markdown } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/markdown-renderer.tsx"
import { reportSectionsMarkdown } from "../../../../../../../fixture/report-sections-markdown.ts"
import { typedElement } from "../../../../../../../typed-element.ts"

afterEach(() => {
  cleanup()
})

describe("Markdown（unified への置き換えが求める記法）", () => {
  it("`:---:` が中央揃え、`---:` が右揃えの印を持つ", () => {
    const { container } = render(
      <Markdown text={"| 左 | 中 | 右 |\n| --- | :---: | ---: |\n| a | b | c |"} />,
    )

    // react-markdown（hast-util-to-jsx-runtime）は列揃えを `align` 属性ではなく
    // `style="text-align: ..."` として描く（React が `align` を非推奨として警告するため）。
    const cells = container.querySelectorAll("td")
    expect(typedElement(cells[0], HTMLTableCellElement, "1列目のセル").style.textAlign).toBe("")
    expect(typedElement(cells[1], HTMLTableCellElement, "2列目のセル").style.textAlign).toBe(
      "center",
    )
    expect(typedElement(cells[2], HTMLTableCellElement, "3列目のセル").style.textAlign).toBe(
      "right",
    )
  })

  it("表は横スクロールの器（div.table-scroll）に包まれる", () => {
    const { container } = render(<Markdown text={"| 見出し | 値 |\n| --- | --- |\n| あ | 1 |"} />)

    expect(container.querySelectorAll("div.table-scroll > table")).toHaveLength(1)
  })

  it("表の rest の行は、表の器（div.table-scroll）の直後の兄弟になる（CSS が :has(+ ...) で最後の行の罫を残すため）", () => {
    const { container } = render(
      <Markdown
        text={
          '| 見出し | 値 |\n| --- | --- |\n| あ | 1 |\n\n<div class="table-rest">ほか 3 件</div>'
        }
      />,
    )

    expect(container.querySelectorAll("div.table-scroll + div.report-table-rest")).toHaveLength(1)
  })

  it("傍注のある塊は、包みの直の子に本文の段落と余白の柱が並び、傍注の aside が許可リストで落ちない", () => {
    const text = reportSectionsMarkdown([
      {
        heading: "",
        blocks: [
          { kind: "text", text: "架空の **本文**。", fold: "", aside: "出どころ: `a.ts:3`" },
          { kind: "note", tone: "memo", text: "架空の覚え書き。", fold: "", aside: "" },
        ],
      },
    ])
    const { container } = render(<Markdown text={text} />)

    expect(
      [...container.querySelectorAll("div.report-with-gutter > *")].map((child) => child.tagName),
    ).toEqual(["P", "DIV"])
    expect(
      [...container.querySelectorAll("div.report-gutter > aside.report-gutter-note")].map((aside) =>
        aside.textContent.trim(),
      ),
    ).toEqual(["出どころ: a.ts:3", "メモ架空の覚え書き。"])
    expect(container.querySelector(".report-gutter-note-label")?.textContent).toBe("メモ")
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

    // class 名は `NotationBlock` / `NotationInline` が tsukumo の名前に付け替える。
    expect(container.querySelector("div.report-note.report-note-warn")).not.toBeNull()
    expect(container.querySelector("span.report-badge.report-badge-ok")).not.toBeNull()
    expect(container.querySelectorAll("div.report-cols > div.report-card")).toHaveLength(2)
    expect(container.querySelector("details > summary")).not.toBeNull()
  })

  it("見比べ（compare）は2つの側が見出しと箇条のまま残る", () => {
    const text = reportSectionsMarkdown([
      {
        heading: "",
        blocks: [
          {
            kind: "compare",
            title: "",
            sides: [
              { heading: "変更前", points: ["架空の一", "架空の二"] },
              { heading: "変更後", points: ["架空の三"] },
            ],
            fold: "",
            aside: "",
          },
        ],
      },
    ])
    const { container } = render(<Markdown text={text} />)

    const sides = [...container.querySelectorAll("div.report-compare > div.report-compare-side")]
    expect(sides).toHaveLength(2)
    expect(sides.map((side) => side.querySelector(".report-compare-heading")?.textContent)).toEqual(
      ["変更前", "変更後"],
    )
    expect(sides.map((side) => side.querySelectorAll("ul > li").length)).toEqual([2, 1])
  })

  it("前後（beforeAfter）は前の側・矢印・後の側の順に並び、側の中のコードはコードの塊として残る", () => {
    const text = reportSectionsMarkdown([
      {
        heading: "",
        blocks: [
          {
            kind: "beforeAfter",
            title: "",
            before: { kind: "points", points: ["架空の一", "架空の二"] },
            after: { kind: "code", language: "ts", source: "const 架空 = 1" },
            fold: "",
            aside: "",
          },
        ],
      },
    ])
    const { container } = render(<Markdown text={text} />)

    const parts = [...(container.querySelector("div.report-before-after")?.children ?? [])]
    expect(parts.map((part) => part.className)).toEqual([
      "report-before-after-side",
      "report-before-after-arrow",
      "report-before-after-side",
    ])
    expect(
      [parts[0], parts[2]].map(
        (side) => side?.querySelector(".report-before-after-label")?.textContent,
      ),
    ).toEqual(["前", "後"])
    expect(parts[1]?.getAttribute("aria-hidden")).toBe("true")
    expect(parts[0]?.querySelectorAll("ul > li")).toHaveLength(2)
    expect(parts[2]?.querySelector("pre code")?.textContent).toBe("const 架空 = 1\n")
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

  it("stats の割合の帯は許可リストを通り、幅と aria-hidden が DOM に残る", () => {
    const { container } = render(
      <Markdown
        text={
          '<div class="stats"><div class="stat"><b>25<span class="stat-total"> / 28</span></b>' +
          '<span class="stat-meter" aria-hidden="true"><span class="stat-meter-fill" style="width: 89%"></span></span>通った</div>' +
          '<div class="stat"><b>0</b>失敗</div></div>'
        }
      />,
    )

    const meter = container.querySelector("div.report-stat > span.report-stat-meter")
    expect(meter?.getAttribute("aria-hidden")).toBe("true")
    expect(meter?.querySelector("span.report-stat-meter-fill")?.getAttribute("style")).toBe(
      "width: 89%;",
    )
    expect(container.querySelector("b > span.report-stat-total")?.textContent).toBe(" / 28")
  })

  it("stats の折れ線は許可リストを通り、svg・polyline・circle と class が DOM に残る", () => {
    const { container } = render(
      <Markdown
        text={
          '<div class="stats"><div class="stat"><span class="stat-before stat-better">12 →</span>' +
          '<b><svg viewBox="0 0 48 12" aria-hidden="true">' +
          '<polyline points="1.5,10.5 24,1.5 46.5,6"/>' +
          '<circle cx="46.5" cy="6" r="1.2"/></svg>8</b>通った</div>' +
          '<div class="stat"><b>0</b>失敗</div></div>'
        }
      />,
    )

    const svg = container.querySelector("div.report-stat > b > svg")
    expect(svg?.getAttribute("viewBox")).toBe("0 0 48 12")
    expect(svg?.getAttribute("aria-hidden")).toBe("true")
    expect(svg?.querySelector("polyline")?.getAttribute("points")).toBe("1.5,10.5 24,1.5 46.5,6")
    expect(svg?.querySelector("circle")?.getAttribute("r")).toBe("1.2")
    expect(container.querySelector("span.report-stat-before.report-stat-better")).not.toBeNull()
  })

  it("名前のある list は、項目ごとに印・名前・説明が li の直下に並び、説明の inline の記法が効く", () => {
    const text = reportSectionsMarkdown([
      {
        heading: "",
        blocks: [
          {
            kind: "list",
            style: "check",
            items: [
              {
                label: "架空の名前",
                text: "架空の **説明**",
                done: true,
                source: "",
                branch: "",
                branchTone: "warn",
              },
              {
                label: "",
                text: "架空の説明だけ",
                done: false,
                source: "",
                branch: "",
                branchTone: "warn",
              },
            ],
            fold: "",
            aside: "",
          },
        ],
      },
    ])
    const { container } = render(<Markdown text={text} />)

    // CSS が li を subgrid にして名前と説明の列を揃えるので、この3つが li の直下に無いと列が崩れる。
    const items = container.querySelectorAll("div.report-labeled-list > ul > li")
    expect(items).toHaveLength(2)
    expect([...(items[0]?.children ?? [])].map((child) => child.className.split(" ")[0])).toEqual([
      "report-task-check",
      "report-list-label",
      "report-list-text",
    ])
    expect(items[0]?.querySelector("span.report-list-text > strong")?.textContent).toBe("説明")
  })

  it("対応表（matrix）は格子の中に role=img と aria-label を持つ印が残り、凡例の印は読み上げから外れる", () => {
    const text = reportSectionsMarkdown([
      {
        heading: "",
        blocks: [
          {
            kind: "matrix",
            title: "",
            columns: ["列A", "列B"],
            rows: [{ name: "行1", cells: ["ok", "ng"] }],
            fold: "",
            aside: "",
          },
        ],
      },
    ])
    const { container } = render(<Markdown text={text} />)

    const marks = [...container.querySelectorAll("div.report-matrix td [role='img']")]
    expect(marks.map((mark) => mark.getAttribute("aria-label"))).toEqual(["OK", "NG"])
    expect(marks.map((mark) => mark.className.split(" ")[0])).toEqual([
      "report-matrix-mark",
      "report-matrix-mark",
    ])
    expect(
      container.querySelectorAll("div.report-matrix-legend [aria-hidden='true']"),
    ).toHaveLength(2)
  })

  it("チェックリストの `- [ ]` と `- [x]` が、済みと未了の分かる印になる", () => {
    const { container } = render(<Markdown text={"- [ ] まだ\n- [x] 済み"} />)

    // 操作できる要素は許可リストに無い（`rehypeTaskCheck` が静的な印の span に畳む）。
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
})

describe("Markdown（remark-cjk-friendly。CJK の強調が記法のまま出る事故の回帰）", () => {
  it.each([
    ["素の強調", "これは**太字**です", "太字"],
    ["中身が「（かぎ括弧）で始まり・終わる強調", "分離は**「呼んだか」**で決まる", "「呼んだか」"],
    ["中身が丸括弧で始まり・終わる強調", "分離は**（呼んだか）**で決まる", "（呼んだか）"],
    ["中身が句点で終わる強調", "分離は**決まる。**次へ", "決まる。"],
    ["閉じ側の直後が空白の強調", "分離は**「呼んだか」** で決まる", "「呼んだか」"],
  ])("%sが太字になる", (_name, text, bold) => {
    const { container } = render(<Markdown text={text} />)

    expect(container.querySelector("strong")?.textContent).toBe(bold)
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
})

describe("Markdown（色を指す inline code をその色の地で見せる）", () => {
  it("カラーコードだけの inline code は、その色が地になり、明るい地には暗い字が載る", () => {
    const { container } = render(<Markdown text="色は `#bca0ec`。" />)

    const code = container.querySelector("code")
    expect(code?.style.background).toBe("#bca0ec")
    expect(code?.className).toContain("report-color-ink-dark")
  })

  it("文中に色が混ざった inline code と、フェンスの中のカラーコードは地にしない", () => {
    const { container } = render(<Markdown text={"`color: #fff`\n\n```\n#bca0ec\n```"} />)

    const styles = [...container.querySelectorAll("code")].map((code) => code.getAttribute("style"))
    expect(styles).toEqual([null, null])
  })
})
