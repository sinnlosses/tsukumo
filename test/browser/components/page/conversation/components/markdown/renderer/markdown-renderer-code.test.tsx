import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Markdown } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/markdown-renderer.tsx"
import { encodeMarks } from "../../../../../../../../src/shared/report/code-mark.ts"
import { stubIntersectionObserver } from "../../../../../../../fixture/intersection.ts"
import { reportSectionsMarkdown } from "../../../../../../../fixture/report-sections-markdown.ts"
import { typedElement } from "../../../../../../../typed-element.ts"

// jsdom には canvas が無く、色のトークンも解けない。
vi.mock(
  "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/theme-color.ts",
  () => ({
    resolveColor: () => "rgb(0, 0, 0)",
    resolveHex: () => "#000000",
  }),
)

beforeEach(() => {
  stubIntersectionObserver(true)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("Markdown（unified への置き換えが求める記法）", () => {
  it("MermaidBlock は失敗したら mermaid のエラー図を描かず、コードとエラー文を出す", async () => {
    // この環境（happy-dom。実際のネットワークが無い）では同梱スクリプトの読み込み自体が失敗する。
    // mermaid のグローバルを差し替えて構文エラーを再現する代わりに、この自然に起きる失敗を
    // 「壊れたときの経路」として検証する（読み込み失敗も構文エラーも MermaidBlock は同じ catch
    // で受け止める設計のため）。
    const { container } = render(<Markdown text={"```mermaid\nflowchart TD\nA --> B\n```"} />)

    await waitFor(() => {
      expect(container.querySelector(".mermaid-broken")).not.toBeNull()
    })

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

  it("```diff フェンスの足した行・消した行が色分けされる", () => {
    // 規約が \`\`\`diff を勧めている根拠（`REPORT_NOTATION_PROMPT` のコードの行）。
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

  it("```diff の -/+ の対は、行の中の違う語だけが .code-diff-removed / .code-diff-added になり、行の字は変わらない", () => {
    const { container } = render(<Markdown text={"```diff\n-const a = 1\n+const a = 2\n```"} />)

    expect(
      [...container.querySelectorAll(".hljs-deletion .code-diff-removed")].map(
        (n) => n.textContent,
      ),
    ).toEqual(["1"])
    expect(
      [...container.querySelectorAll(".hljs-addition .code-diff-added")].map((n) => n.textContent),
    ).toEqual(["2"])
    expect(container.querySelector(".hljs-addition")?.textContent).toBe("+const a = 2")
  })

  it("```diff の数の違う塊と、語が 200 を超える行には語の地が付かない", () => {
    const many = (last: string): string => `${"!".repeat(200)}${last}`
    const words = ".code-diff-added, .code-diff-removed"
    const unpaired = render(<Markdown text={"```diff\n-a\n-b\n+c\n```"} />)
    expect(unpaired.container.querySelector(words)).toBeNull()

    const long = render(<Markdown text={`\`\`\`diff\n-${many("a")}\n+${many("b")}\n\`\`\``} />)
    expect(long.container.querySelector(words)).toBeNull()
  })

  it("```diff の足した行・消した行は、対が無くても行の器に追加・削除の class が付き、行頭の字が記号の span になる", () => {
    const { container } = render(<Markdown text={"```diff\n-a\n-b\n+c\n d\n```"} />)

    const rows = [...container.querySelectorAll("pre code .code-line")]
    expect(rows.map((row) => row.classList.contains("code-line-removed"))).toEqual([
      true,
      true,
      false,
      false,
    ])
    expect(rows.map((row) => row.classList.contains("code-line-added"))).toEqual([
      false,
      false,
      true,
      false,
    ])
    expect(container.querySelector(".code-line-added .code-line-sign")?.textContent).toBe("+")
    expect(rows.map((row) => row.textContent)).toEqual(["-a", "-b", "+c", " d"])
  })

  it("フェンスに書いたファイル名がブロックの左上のラベルになる", () => {
    // 言語名のあとのファイル名は mdast では `code` の `data.meta` に入り、rehype-raw が
    // 木を書き出して読み直す時点で落ちる。属性へ移す `rehypeCodeFileName` とサニタイザの
    // 許可（`code`）が両方効いていないと、ここでラベルが出ない。
    const { container } = render(<Markdown text={"```diff .tw/tasks.json\n-  1\n+  2\n```"} />)

    const block = container.querySelector("div.code-file")
    expect(block).not.toBeNull()
    // ラベルは <pre> より前（左上）に置く。
    expect(block?.firstElementChild?.className).toBe("code-file-name")
    expect(block?.firstElementChild?.textContent).toContain(".tw/tasks.json")
    expect(block?.querySelector("pre code.language-diff")?.textContent).toContain("+  2")
  })

  it("ファイル名の無いフェンスもコピーのボタンの帯は出る（ラベルは無い）", () => {
    const { container } = render(<Markdown text={"```diff\n-const a = 1\n+const a = 2\n```"} />)

    const label = container.querySelector("div.code-file > .code-file-name")
    expect(label).not.toBeNull()
    // ラベルの文字は無く、コピーのボタンだけが帯に出る。
    expect(label?.textContent).toBe("コピー")
    expect(container.querySelector("pre code.language-diff")).not.toBeNull()
  })

  it("info の末尾の marks= の語はファイル名に混ざらず、印の行として描かれる", () => {
    const marks = [{ lines: "1", label: "架空の印" }]
    const token = encodeMarks(marks)
    const { container } = render(<Markdown text={`\`\`\`ts src/a.ts ${token}\na\nb\n\`\`\``} />)

    const label = container.querySelector(".code-file-name")
    expect(label?.textContent).toContain("src/a.ts")
    expect(label?.textContent).not.toContain("marks=")
    expect(container.querySelector("pre code.language-ts .code-line-mark")?.textContent).toContain(
      "a",
    )
    expect(container.querySelector(".code-mark-label")?.textContent).toBe("架空の印")
  })

  it("ファイル名は文字として出る（HTML として解釈しない）", () => {
    const { container } = render(<Markdown text={"```diff <b>src/foo.ts</b>\n-a\n+b\n```"} />)

    const label = container.querySelector(".code-file-name")
    expect(label?.textContent).toContain("<b>src/foo.ts</b>")
    expect(label?.querySelector("b")).toBeNull()
  })
})

describe("Markdown（code の marks）", () => {
  const lines = (count: number): string[] =>
    Array.from(
      { length: count },
      (_, index) => `const v${String(index + 1)} = ${String(index + 1)}`,
    )
  const fenceWith = (
    sourceLines: readonly string[],
    marks: readonly { lines: string; label: string }[],
  ): string => `\`\`\`ts ${encodeMarks(marks)}\n${sourceLines.join("\n")}\n\`\`\``

  it("印の行に印のクラスが付き、ラベルは印の最初の行の右端に出る", () => {
    const { container } = render(
      <Markdown text={fenceWith(lines(6), [{ lines: "2-3", label: "架空の印" }])} />,
    )

    const rows = [...container.querySelectorAll("pre .code-line")]
    expect(rows).toHaveLength(6)
    expect(rows.map((row) => row.classList.contains("code-line-mark"))).toEqual([
      false,
      true,
      true,
      false,
      false,
      false,
    ])
    expect(rows[1]?.querySelector(".code-mark-label")?.textContent).toBe("架空の印")
    expect(container.querySelectorAll(".code-mark-label")).toHaveLength(1)
    expect(rows[0]?.textContent).toBe("const v1 = 1")
  })

  it("言語が空の塊でも、report の塊から組んだ marks は印の行として届く", () => {
    const block = {
      kind: "code",
      language: "",
      path: "",
      source: "a\nb\n",
      marks: [{ lines: "2", label: "架空の印" }],
      fold: "",
      aside: "",
    } as const
    const { container } = render(
      <Markdown
        text={reportSectionsMarkdown([{ heading: "", shapeTag: "unspecified", blocks: [block] }])}
      />,
    )

    expect(container.querySelectorAll(".code-line-mark")).toHaveLength(1)
    expect(container.querySelector(".code-mark-label")?.textContent).toBe("架空の印")
  })

  it("marks の無い塊は行に分けず、20行を超えても畳まない", () => {
    const { container } = render(<Markdown text={"```ts\n" + lines(40).join("\n") + "\n```"} />)

    expect(container.querySelector(".code-line")).toBeNull()
    expect(container.querySelector(".code-fold")).toBeNull()
  })

  it("印の 3 行外が20行を超える範囲は「n 行を畳んだ」の 1 行になり、押すと中身が出る", () => {
    const { container } = render(
      <Markdown text={fenceWith(lines(40), [{ lines: "1", label: "架空の印" }])} />,
    )

    const fold = typedElement(container.querySelector(".code-fold"), HTMLButtonElement, "畳みの行")
    expect(fold.textContent).toBe("36 行を畳んだ")
    expect(fold.getAttribute("aria-expanded")).toBe("false")
    expect(container.querySelectorAll(".code-line")).toHaveLength(4)

    fireEvent.click(fold)

    expect(container.querySelector(".code-fold")).toBeNull()
    expect(container.querySelectorAll(".code-line")).toHaveLength(40)
  })

  it("離れた行が20行ちょうどなら畳まない", () => {
    const { container } = render(
      <Markdown text={fenceWith(lines(24), [{ lines: "1", label: "架空の印" }])} />,
    )

    expect(container.querySelector(".code-fold")).toBeNull()
    expect(container.querySelectorAll(".code-line")).toHaveLength(24)
  })

  it("コピーは畳みと印に関わらず全文を写す", async () => {
    const calls: string[] = []
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: (text: string) => Promise.resolve(calls.push(text)).then(() => {}) },
      configurable: true,
    })
    const source = lines(40)
    const { container } = render(
      <Markdown text={fenceWith(source, [{ lines: "1", label: "架空の印" }])} />,
    )

    await act(async () => {
      fireEvent.click(
        typedElement(container.querySelector(".code-copy"), HTMLButtonElement, "コピーのボタン"),
      )
      await Promise.resolve()
    })

    expect(calls).toEqual([source.join("\n")])
  })
})

describe("Markdown（shell の塊）", () => {
  const copiedText = async (text: string): Promise<string[]> => {
    const calls: string[] = []
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: (value: string) => Promise.resolve(calls.push(value)).then(() => {}) },
      configurable: true,
    })
    const { container } = render(<Markdown text={text} />)
    await act(async () => {
      fireEvent.click(
        typedElement(container.querySelector(".code-copy"), HTMLButtonElement, "コピーのボタン"),
      )
      await Promise.resolve()
    })
    return calls
  }

  it("コマンドと出力の行が分かれ、出力の行にだけ出力のクラスが付く", () => {
    const { container } = render(
      <Markdown text={"```bash\n$ pnpm run check\ntypecheck ok\nlint ok\n```"} />,
    )

    const rows = [...container.querySelectorAll("pre .code-line")]
    expect(rows.map((row) => row.classList.contains("code-line-output"))).toEqual([
      false,
      true,
      true,
    ])
  })

  it("コピーはコマンドの行だけを `$ ` を外して写す", async () => {
    expect(await copiedText("```bash\n$ pnpm run check\ntypecheck ok\n$ pwd\n/tmp\n```")).toEqual([
      "pnpm run check\npwd",
    ])
  })

  it("shell でない言語の `$ ` 始まりは分けず、全文を写す", async () => {
    const text = "```ts\n$ not a command\nout\n```"
    const { container } = render(<Markdown text={text} />)
    expect(container.querySelector(".code-line")).toBeNull()
    expect(await copiedText(text)).toEqual(["$ not a command\nout"])
  })

  it("コマンドが 1 行も無い shell の塊は分けず、全文を写す", async () => {
    const text = "```bash\nls -la\ncd /tmp\n```"
    const { container } = render(<Markdown text={text} />)
    expect(container.querySelector(".code-line")).toBeNull()
    expect(await copiedText(text)).toEqual(["ls -la\ncd /tmp"])
  })
})

describe("Markdown（フェンス付きコードブロックのコピーのボタン）", () => {
  /** `navigator.clipboard` は happy-dom に無いので、押した引数だけ拾う偽物に差し替える。 */
  function stubClipboardWriteText(): { readonly calls: string[] } {
    const calls: string[] = []
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: (text: string) => Promise.resolve(calls.push(text)).then(() => {}) },
      configurable: true,
    })
    return { calls }
  }

  it("フェンス付きコードブロックにコピーのボタンが出て、押すと（shell の塊を除き）塊の中身そのままを写す（行番号・ラベル・ボタンの文字は含まない）", async () => {
    const { calls } = stubClipboardWriteText()
    const { container } = render(
      <Markdown text={"```diff .tw/tasks.json\n-const a = 1\n+const a = 2\n```"} />,
    )

    const button = typedElement(
      container.querySelector(".code-copy"),
      HTMLButtonElement,
      "コピーのボタン",
    )
    await act(async () => {
      fireEvent.click(button)
      await Promise.resolve()
    })

    expect(calls).toEqual(["-const a = 1\n+const a = 2"])
  })

  it("写すとボタンの文字が短いあいだ「コピーした」に変わり、やがて戻る", async () => {
    vi.useFakeTimers()
    try {
      stubClipboardWriteText()
      const { container } = render(<Markdown text={"```ts\nconst a = 1\n```"} />)
      const button = typedElement(
        container.querySelector(".code-copy"),
        HTMLButtonElement,
        "コピーのボタン",
      )

      expect(button.textContent).toBe("コピー")
      await act(async () => {
        fireEvent.click(button)
        await Promise.resolve()
      })
      expect(button.textContent).toBe("コピーした")

      act(() => {
        vi.advanceTimersByTime(1500)
      })
      expect(button.textContent).toBe("コピー")
    } finally {
      vi.useRealTimers()
    }
  })

  it("mermaid / chart のフェンスにはコピーのボタンを付けない（図・グラフの入れ物になるため）", () => {
    const { container } = render(<Markdown text={"```chart\n{}\n```"} />)

    expect(container.querySelector(".code-copy")).toBeNull()
  })
})
