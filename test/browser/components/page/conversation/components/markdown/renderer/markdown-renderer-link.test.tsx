import { cleanup, fireEvent, render } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Markdown } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/markdown-renderer.tsx"
import { RepositoryFileLinkContext } from "../../../../../../../../src/browser/components/page/conversation/components/repository-link/repository-link.tsx"
import { UNREADABLE_FILE_EXCERPT } from "../../../../../../../../src/shared/repository/file-excerpt.ts"
import { reportSectionsMarkdown } from "../../../../../../../fixture/report-sections-markdown.ts"
import { typedElement } from "../../../../../../../typed-element.ts"

afterEach(() => {
  cleanup()
})

describe("Markdown（レポートのパスを押して Orca のエディタで開く）", () => {
  /**
   * `<RepositoryFileLinkProvider>` の実データ（`useQuery` / `useSession`）は使わず、
   * Context だけを直接差し込む（部品のテストを軽くするため。`MainView` が実データを配る）。 */
  function withFiles(
    paths: readonly string[],
    open: (path: string) => void,
  ): (children: ReactNode) => ReactNode {
    return (children) => (
      <RepositoryFileLinkContext.Provider
        value={{
          files: new Set(paths),
          open,
          readExcerpt: () => Promise.resolve(UNREADABLE_FILE_EXCERPT),
        }}
      >
        {children}
      </RepositoryFileLinkContext.Provider>
    )
  }

  it("一覧にある inline code（file_path:line_number）が押せるボタンになり、押すと裸のパスで1回開く", () => {
    const opened: string[] = []
    const wrap = withFiles(["src/foo.ts"], (path) => opened.push(path))
    const { container } = render(wrap(<Markdown text="見て `src/foo.ts:12` を直した" />))

    const button = container.querySelector('[role="button"]')
    expect(button?.textContent).toBe("src/foo.ts:12")
    // 表示の `:12` は残る（行番号へは飛べないので運ばない）。
    fireEvent.click(typedElement(button, HTMLElement, "押せるパス"))
    expect(opened).toEqual(["src/foo.ts"])
  })

  it("押せるパスは `/` の直後にだけ折り返しの機会（wbr）を持ち、字は変わらず、押すと同じパスで開く", () => {
    const opened: string[] = []
    const wrap = withFiles(["src/a/b.ts"], (path) => opened.push(path))
    const { container } = render(wrap(<Markdown text="見て `src/a/b.ts:3` を直した" />))

    const button = typedElement(
      container.querySelector('[role="button"]'),
      HTMLElement,
      "押せるパス",
    )
    expect(button.querySelectorAll("wbr")).toHaveLength(2)
    expect(button.innerHTML).toContain("src/<wbr>a/<wbr>b.ts:3")
    expect(button.textContent).toBe("src/a/b.ts:3")
    fireEvent.click(button)
    expect(opened).toEqual(["src/a/b.ts"])
  })

  it("押せるパスはハイフンの直後に結合子の span を持ち、字は変わらない", () => {
    const wrap = withFiles(["src/report-notation.module.css"], () => {})
    const { container } = render(
      wrap(<Markdown text="見て `src/report-notation.module.css` を直した" />),
    )

    const button = typedElement(
      container.querySelector('[role="button"]'),
      HTMLElement,
      "押せるパス",
    )
    const glues = button.querySelectorAll("span")
    expect(glues).toHaveLength(1)
    expect(glues[0]?.previousSibling?.textContent).toBe("report-")
    expect(button.querySelectorAll("wbr")).toHaveLength(1)
    expect(button.textContent).toBe("src/report-notation.module.css")
  })

  it("files の塊のパスもハイフンの直後に結合子の span を持ち、字は変わらない", () => {
    const wrap = withFiles(["src/a-b/c-d.ts"], () => {})
    const text = reportSectionsMarkdown([
      {
        heading: "",
        shapeTag: "unspecified",
        blocks: [
          {
            kind: "files",
            items: [{ path: "src/a-b/c-d.ts", change: "modified", note: "" }],
            title: "",
            fold: "",
            aside: "",
          },
        ],
      },
    ])
    const { container } = render(wrap(<Markdown text={text} />))

    const button = typedElement(
      container.querySelector('[role="button"]'),
      HTMLElement,
      "押せるパス",
    )
    expect(button.textContent).toBe("c-d.ts")
    const folder = container.querySelector("div[class*='file-folder']")
    expect(folder?.textContent).toBe("src/a-b/")
    const emptySpans = (root: Element | null | undefined) =>
      [...(root?.querySelectorAll("span") ?? [])].filter((span) => span.childNodes.length === 0)
    expect(emptySpans(button)).toHaveLength(1)
    expect(emptySpans(folder)).toHaveLength(1)
  })

  it("押せるパスは tabindex を持つ role=button の span で、Enter と Space で開き、ほかのキーでは開かない", () => {
    const opened: string[] = []
    const wrap = withFiles(["src/foo.ts"], (path) => opened.push(path))
    const { container } = render(wrap(<Markdown text="見て `src/foo.ts:12` を直した" />))

    const target = typedElement(
      container.querySelector('[role="button"]'),
      HTMLElement,
      "押せるパス",
    )
    expect(target.tagName).toBe("SPAN")
    expect(target.getAttribute("tabindex")).toBe("0")
    fireEvent.keyDown(target, { key: "a" })
    expect(opened).toEqual([])
    fireEvent.keyDown(target, { key: "Enter" })
    fireEvent.keyDown(target, { key: " " })
    expect(opened).toEqual(["src/foo.ts", "src/foo.ts"])
  })

  it("文字を選んだままの click ではパスを開かない", () => {
    const opened: string[] = []
    const wrap = withFiles(["src/foo.ts"], (path) => opened.push(path))
    const { container } = render(wrap(<Markdown text="見て `src/foo.ts` を直した" />))
    const target = typedElement(
      container.querySelector('[role="button"]'),
      HTMLElement,
      "押せるパス",
    )

    const range = document.createRange()
    range.selectNodeContents(target)
    document.getSelection()?.addRange(range)
    fireEvent.click(target)
    expect(opened).toEqual([])

    document.getSelection()?.removeAllRanges()
    fireEvent.click(target)
    expect(opened).toEqual(["src/foo.ts"])
  })

  it("files の塊のパスは HTML の中の code でも、一覧にあれば押せるボタンになる", () => {
    const opened: string[] = []
    const wrap = withFiles(["src/foo.ts"], (path) => opened.push(path))
    const text = reportSectionsMarkdown([
      {
        heading: "",
        shapeTag: "unspecified",
        blocks: [
          {
            kind: "files",
            items: [
              { path: "src/foo.ts", change: "modified", note: "架空の注記" },
              { path: "src/gone.ts", change: "deleted", note: "" },
            ],
            title: "",
            fold: "",
            aside: "",
          },
        ],
      },
    ])
    const { container } = render(wrap(<Markdown text={text} />))

    // 行の子は種別・パス・注記の順（CSS が行を subgrid にして列を揃える）。
    const rows = container.querySelectorAll("div.report-files > div.report-file")
    expect(rows).toHaveLength(2)
    expect([...(rows[0]?.children ?? [])].map((child) => child.tagName)).toEqual([
      "SPAN",
      "SPAN",
      "SPAN",
    ])
    // 表示はファイル名だけで、押すとフルパス（`data-file-path`）で開く。
    const button = typedElement(
      rows[0]?.querySelector('[role="button"]'),
      HTMLElement,
      "押せるパス",
    )
    expect(button.textContent).toBe("foo.ts")
    fireEvent.click(button)
    expect(opened).toEqual(["src/foo.ts"])
    // 一覧に無いパス（消したファイル）は素の code のまま。
    expect(rows[1]?.querySelector('[role="button"]')).toBeNull()
    expect(rows[1]?.querySelector("code")?.textContent).toBe("gone.ts")
  })

  it("一覧に無い inline code はボタンにならない（素の <code> のまま）", () => {
    const wrap = withFiles(["src/foo.ts"], () => {})
    const { container } = render(wrap(<Markdown text="`src/bar.ts:3` は無い" />))

    expect(container.querySelector('[role="button"]')).toBeNull()
    expect(container.querySelector("code")?.textContent).toBe("src/bar.ts:3")
  })

  it("一覧にあるフェンスのファイル名が押せるボタンになる", () => {
    const opened: string[] = []
    const wrap = withFiles([".tw/tasks.json"], (path) => opened.push(path))
    const { container } = render(
      wrap(<Markdown text={"```diff .tw/tasks.json\n-  1\n+  2\n```"} />),
    )

    const label = container.querySelector(".code-file-name")
    const button = label?.querySelector('[role="button"]')
    expect(button?.textContent).toBe(".tw/tasks.json")
    fireEvent.click(typedElement(button, HTMLElement, "押せるパス"))
    expect(opened).toEqual([".tw/tasks.json"])
  })

  it("一覧に無いフェンスのファイル名は素のテキストのまま（別に出るボタンはコピーのボタンだけ）", () => {
    const wrap = withFiles([".tw/tasks.json"], () => {})
    const { container } = render(wrap(<Markdown text={"```diff src/nope.ts\n-a\n+b\n```"} />))

    const label = container.querySelector(".code-file-name")
    expect(
      [...(label?.querySelectorAll("button") ?? [])].map((button) => button.textContent),
    ).toEqual(["コピー"])
    expect(label?.textContent).toContain("src/nope.ts")
  })

  it("一覧にある相対リンクが押せるボタンになり、ページは遷移しない", () => {
    const opened: string[] = []
    const wrap = withFiles(["src/foo.ts"], (path) => opened.push(path))
    const { container } = render(wrap(<Markdown text="[直した](src/foo.ts)" />))

    expect(container.querySelector("a")).toBeNull()
    const button = container.querySelector('[role="button"]')
    expect(button?.textContent).toBe("直した")
    fireEvent.click(typedElement(button, HTMLElement, "押せるパス"))
    expect(opened).toEqual(["src/foo.ts"])
  })

  it("ファイルを指さない相対リンクは <a> にならず、押しても何も起きない", () => {
    const wrap = withFiles(["src/foo.ts"], () => {})
    const { container } = render(wrap(<Markdown text="[無い](src/nope.ts)" />))

    expect(container.querySelector("a")).toBeNull()
    expect(container.querySelector('[role="button"]')).toBeNull()
    expect(container.textContent).toContain("無い")
  })

  it("外部リンク・脚注の `#` リンクはこれまでどおり <a> のまま", () => {
    const wrap = withFiles(["src/foo.ts"], () => {})
    const { container } = render(
      wrap(<Markdown text={"[外部](https://example.com)\n\n結論[^1]\n\n[^1]: 補足。"} />),
    )

    const external = [...container.querySelectorAll("a")].find(
      (a) => a.getAttribute("href") === "https://example.com",
    )
    expect(external?.textContent).toBe("外部")
    expect(container.querySelector("sup > a")?.getAttribute("href")).toBe("#user-content-fn-1")
  })

  it("字がホスト名と同じ外部リンクだけ出典の札の class が付く", () => {
    const { container } = render(
      <Markdown text={"[example.com](https://example.com/a) と [解説](https://example.com/b)"} />,
    )

    const [source, plain] = [...container.querySelectorAll("a")]
    expect(source?.className).toContain("report-source")
    expect(plain?.className ?? "").not.toContain("report-source")
    expect(source?.getAttribute("rel")).toBe("noopener noreferrer")
  })

  it("ページ内のリンクを押すと、location.hash を書かずに飛び先の要素へ転がす", () => {
    const { container } = render(
      <Markdown text={'<a href="#架空の先">飛ぶ</a>\n\n<div id="架空の先">先</div>'} />,
    )
    const target = typedElement(container.querySelector("div[id]"), HTMLDivElement, "飛び先")
    const scrolled = vi.fn()
    target.scrollIntoView = scrolled
    const hashBefore = window.location.hash

    fireEvent.click(typedElement(container.querySelector("a"), HTMLAnchorElement, "リンク"))

    expect(scrolled).toHaveBeenCalledWith({ block: "start" })
    expect(window.location.hash).toBe(hashBefore)
  })

  it("Provider が無い場（既存のレポートの多く）では、一致するパスが無いのでファイルを開くボタンは出ない（コピーのボタンは別に出る）", () => {
    const { container } = render(
      <Markdown text={"`src/foo.ts:1` と [x](src/foo.ts) と ```diff src/foo.ts\n-a\n+b\n```"} />,
    )

    const buttons = [...container.querySelectorAll("button")]
    expect(buttons.map((button) => button.textContent)).toEqual(["コピー"])
  })
})
