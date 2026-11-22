import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  CodeFence,
  Markdown,
} from "../../../../../src/browser/features/report/renderer/markdown-renderer.tsx"
import { encodeMarks } from "../../../../../src/shared/report/code-mark.ts"
import { UNREADABLE_FILE_EXCERPT } from "../../../../../src/shared/repository/file-excerpt.ts"
import { stubIntersectionObserver } from "../../../../fixture/intersection.ts"
import { reportSectionsMarkdown } from "../../../../fixture/report-sections-markdown.ts"
import { stubRepositoryFileLink } from "../../../../fixture/repository-file-link.tsx"
import { typedElement } from "../../../../typed-element.ts"

// jsdom には canvas が無く、色のトークンも解けない。
vi.mock("../../../../../src/browser/features/report/renderer/theme-color.ts", () => ({
  resolveColor: () => "rgb(0, 0, 0)",
  resolveHex: () => "#000000",
  resolveHexOver: () => "#000000",
}))

beforeEach(() => {
  stubIntersectionObserver(true)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** CodeBlock の行の器（行番号は `data-line`）。 */
function codeRows(container: HTMLElement): readonly Element[] {
  return [...container.querySelectorAll("pre [data-line]")]
}

/** CodeBlock の頭の帯の字（ファイル名と言語名）。 */
function codeTitle(container: HTMLElement): Element | null {
  return container.querySelector("pre > div:not(:has([data-line]))")
}

/** `navigator.clipboard` は happy-dom に無いので、写した字だけ拾う偽物に差し替える。 */
function stubClipboardWriteText(): { readonly calls: string[] } {
  const calls: string[] = []
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: (text: string) => Promise.resolve(calls.push(text)).then(() => {}) },
    configurable: true,
  })
  return { calls }
}

async function clickButton(button: Element | null, name: string): Promise<void> {
  const target = typedElement(button, HTMLButtonElement, name)
  await act(async () => {
    fireEvent.click(target)
    await Promise.resolve()
  })
}

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

  it("```diff の足した行・消した行は、対が無くても行の器に追加・削除の印が付き、字は原文のまま", () => {
    const { container } = render(<Markdown text={"```diff\n-a\n-b\n+c\n d\n```"} />)

    const rows = codeRows(container)
    expect(rows.map((row) => row.getAttribute("data-diff"))).toEqual([
      "removed",
      "removed",
      "added",
      null,
    ])
    expect(rows.map((row) => row.textContent)).toEqual(["-a", "-b", "+c", " d"])
  })

  it("フェンスに書いたファイル名がブロックの頭の帯に出る", () => {
    // 言語名のあとのファイル名は mdast では `code` の `data.meta` に入り、rehype-raw が
    // 木を書き出して読み直す時点で落ちる。属性へ移す `rehypeCodeFileName` とサニタイザの
    // 許可（`code`）が両方効いていないと、ここでラベルが出ない。
    const { container } = render(<Markdown text={"```diff .tw/tasks.json\n-  1\n+  2\n```"} />)

    expect(codeTitle(container)?.textContent).toContain(".tw/tasks.json")
    expect(codeRows(container).map((row) => row.textContent)).toContain("+  2")
  })

  it("info の末尾の marks= の語はファイル名に混ざらず、印の行として描かれる", () => {
    const marks = [{ lines: "1", label: "架空の印" }]
    const token = encodeMarks(marks)
    const { container } = render(<Markdown text={`\`\`\`ts src/a.ts ${token}\na\nb\n\`\`\``} />)

    const title = codeTitle(container)?.textContent
    expect(title).toContain("src/a.ts")
    expect(title).not.toContain("marks=")
    const [first, second] = codeRows(container)
    expect(first?.className).not.toBe(second?.className)
    expect(container.querySelector("[role='list']")?.textContent).toContain("架空の印")
  })

  it("ファイル名は文字として出る（HTML として解釈しない）", () => {
    const { container } = render(<Markdown text={"```diff <b>src/foo.ts</b>\n-a\n+b\n```"} />)

    const title = codeTitle(container)
    expect(title?.textContent).toContain("<b>src/foo.ts</b>")
    expect(title?.querySelector("b")).toBeNull()
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

  it("印の行だけに印の地が付き、ラベルは塊の下に行の範囲と並ぶ", () => {
    const { container } = render(
      <Markdown text={fenceWith(lines(6), [{ lines: "2-3", label: "架空の印" }])} />,
    )

    const rows = codeRows(container)
    expect(rows).toHaveLength(6)
    const plain = rows[0]?.className
    expect(rows.map((row) => row.className !== plain)).toEqual([
      false,
      true,
      true,
      false,
      false,
      false,
    ])
    expect(rows[0]?.textContent).toBe("const v1 = 1")
    expect(container.querySelector("[role='list']")?.textContent).toBe("2–3 行架空の印")
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
      <Markdown text={reportSectionsMarkdown([{ heading: "", blocks: [block] }])} />,
    )

    const [first, second] = codeRows(container)
    expect(first?.className).not.toBe(second?.className)
    expect(container.querySelector("[role='list']")?.textContent).toBe("2 行架空の印")
  })

  it("始まりの行が分かる塊も、印の地は塊の中の行に付き、ラベルは行番号の列と同じ数で出る", async () => {
    const stub = stubRepositoryFileLink(["src/fictional.ts"], UNREADABLE_FILE_EXCERPT, {
      kind: "line",
      startLine: 10,
    })
    try {
      const { container } = render(
        stub.wrap(
          <CodeFence
            language="ts"
            path="src/fictional.ts"
            marks={[{ lines: "2", label: "架空の印" }]}
            source={lines(4).join("\n")}
            lineDiff={undefined}
          />,
        ),
      )

      await waitFor(() => {
        expect(codeRows(container)[0]?.getAttribute("data-line")).toBe("10")
      })
      const rows = codeRows(container)
      const plain = rows[0]?.className
      expect(rows.map((row) => row.className !== plain)).toEqual([false, true, false, false])
      expect(rows[1]?.getAttribute("data-line")).toBe("11")
      expect(container.querySelector("[role='list']")?.textContent).toBe("11 行架空の印")
    } finally {
      stub.restore()
    }
  })

  it("印のある長い塊も畳まず、全行を出す", () => {
    const { container } = render(
      <Markdown text={fenceWith(lines(40), [{ lines: "1", label: "架空の印" }])} />,
    )

    expect(codeRows(container)).toHaveLength(40)
  })

  it("コピーは印に関わらず全文を写す", async () => {
    const { calls } = stubClipboardWriteText()
    const source = lines(40)
    const { container } = render(
      <Markdown text={fenceWith(source, [{ lines: "1", label: "架空の印" }])} />,
    )

    await clickButton(container.querySelector("pre button"), "コピーのボタン")

    expect(calls).toEqual([source.join("\n")])
  })
})

describe("Markdown（shell の塊）", () => {
  const copiedText = async (text: string): Promise<string[]> => {
    const { calls } = stubClipboardWriteText()
    const { container } = render(<Markdown text={text} />)
    await clickButton(container.querySelector("pre button"), "コピーのボタン")
    return calls
  }

  it("コピーはコマンドの行だけを `$ ` を外して写す", async () => {
    expect(await copiedText("```bash\n$ pnpm run check\ntypecheck ok\n$ pwd\n/tmp\n```")).toEqual([
      "pnpm run check\npwd",
    ])
  })

  it("shell でない言語の `$ ` 始まりは分けず、全文を写す", async () => {
    expect(await copiedText("```ts\n$ not a command\nout\n```")).toEqual(["$ not a command\nout"])
  })

  it("言語なしの `$ ` 始まりは分けず、全文を写す", async () => {
    expect(await copiedText("```\n$ not a command\nout\n```")).toEqual(["$ not a command\nout"])
  })

  it("コマンドが 1 行も無い shell の塊は分けず、全文を写す", async () => {
    expect(await copiedText("```bash\nls -la\ncd /tmp\n```")).toEqual(["ls -la\ncd /tmp"])
  })

  it("写すとボタンの名前が短いあいだ「コピーした」に変わり、やがて戻る", async () => {
    vi.useFakeTimers()
    try {
      stubClipboardWriteText()
      const { container } = render(<Markdown text={"```bash\n$ pwd\n/tmp\n```"} />)
      const button = typedElement(
        container.querySelector("pre button"),
        HTMLButtonElement,
        "コピーのボタン",
      )

      expect(button.getAttribute("aria-label")).toBe("コピー")
      await clickButton(button, "コピーのボタン")
      expect(button.getAttribute("aria-label")).toBe("コピーした")

      act(() => {
        vi.advanceTimersByTime(1500)
      })
      expect(button.getAttribute("aria-label")).toBe("コピー")
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("Markdown（図の言語のフェンス）", () => {
  it("mermaid / chart のフェンスは CodeBlock にもコピーのボタンにもしない（図・グラフの入れ物になるため）", () => {
    const { container } = render(<Markdown text={"```chart\n{}\n```"} />)

    expect(container.querySelector("pre [data-line]")).toBeNull()
    expect(container.querySelector("button")).toBeNull()
  })
})
