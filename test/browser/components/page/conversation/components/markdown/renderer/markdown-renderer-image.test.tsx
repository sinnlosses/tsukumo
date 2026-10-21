import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { Markdown } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/markdown-renderer.tsx"
import { reportSectionsMarkdown } from "../../../../../../../fixture/report-sections-markdown.ts"
import { typedElement } from "../../../../../../../typed-element.ts"

afterEach(() => {
  cleanup()
})

describe("Markdown（image の塊の画像）", () => {
  const MISSING_SELECTOR = 'span[role="img"].report-image-missing'

  function withPageToken(run: () => void): void {
    const before = window.location.href
    window.history.replaceState(null, "", "/?t=fictional-token")
    try {
      run()
    } finally {
      window.history.replaceState(null, "", before)
    }
  }

  it("棚の画像は起動トークンを付けて読み、説明の1行が添う", () => {
    withPageToken(() => {
      const text = reportSectionsMarkdown([
        {
          heading: "",
          shapeTag: "unspecified",
          blocks: [
            {
              kind: "image",
              path: "架空/after.png",
              caption: "架空の画面",
              notes: [],
              fold: "",
              aside: "",
            },
          ],
        },
      ])
      const { container } = render(<Markdown text={text} />)

      const image = typedElement(
        container.querySelector("div.report-captioned > button > img"),
        HTMLImageElement,
        "画像",
      )
      expect(image.getAttribute("src")).toBe(
        "/report-image/fictional-report/%E6%9E%B6%E7%A9%BA%2Fafter.png?t=fictional-token",
      )
      expect(image.alt).toBe("架空の画面")
      expect(container.querySelector("div.report-caption")?.textContent).toBe("図 1架空の画面")
    })
  })

  it("notes は画像の横に番号つきで並び、読めなかった画像でも札の横に並ぶ", () => {
    withPageToken(() => {
      const text = reportSectionsMarkdown([
        {
          heading: "",
          shapeTag: "unspecified",
          blocks: [
            {
              kind: "image",
              path: "架空/after.png",
              caption: "架空の画面",
              notes: ["架空の1つ目 `code`", "架空の2つ目"],
              fold: "",
              aside: "",
            },
          ],
        },
      ])
      const { container } = render(<Markdown text={text} />)

      const notes = container.querySelector("div.report-image-notes")
      expect(notes?.querySelector("img")).not.toBeNull()
      const items = [...(notes?.querySelectorAll("ol > li") ?? [])]
      expect(items.map((item) => item.querySelector("[class*=number]")?.textContent)).toEqual([
        "1",
        "2",
      ])
      expect(items[0]?.querySelector("code")?.textContent).toBe("code")
      expect(items[1]?.textContent).toContain("架空の2つ目")

      fireEvent.error(typedElement(notes?.querySelector("img") ?? null, HTMLImageElement, "画像"))
      expect(container.querySelector(MISSING_SELECTOR)).not.toBeNull()
      expect(container.querySelectorAll("div.report-image-notes ol > li")).toHaveLength(2)
    })
  })

  it("外部の URL・data:・ほかのパスの画像は img にならず「出せない」の札になる", () => {
    const { container } = render(
      <Markdown
        text={[
          '<img src="https://example.invalid/a.png" alt="外">',
          "![外](https://example.invalid/b.png)",
          "![手元](/tmp/a.png)",
          '<img src="data:image/png;base64,AAAA" alt="埋め込み">',
        ].join("\n\n")}
      />,
    )

    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelectorAll(MISSING_SELECTOR)).toHaveLength(4)
    expect(container.innerHTML).not.toContain("example.invalid")
    expect(container.innerHTML).not.toContain("data:image")
  })

  it("読めなかった画像は「出せない」の札に替わる", () => {
    const text = reportSectionsMarkdown([
      {
        heading: "",
        shapeTag: "unspecified",
        blocks: [
          { kind: "image", path: "架空.png", caption: "架空", notes: [], fold: "", aside: "" },
        ],
      },
    ])
    const { container } = render(<Markdown text={text} />)

    fireEvent.error(typedElement(container.querySelector("img"), HTMLImageElement, "画像"))

    expect(container.querySelector("img")).toBeNull()
    const missing = container.querySelector(MISSING_SELECTOR)
    expect(missing?.getAttribute("aria-label")).toBe("架空")
    expect(missing?.textContent).toContain("画像を出せない")
    expect(missing?.textContent).toContain("読めなかったか、tsukumo を起こし直して手放した")
  })

  describe("前後の画像の見せ方", () => {
    const imagesText = reportSectionsMarkdown([
      {
        heading: "",
        shapeTag: "unspecified",
        blocks: [
          {
            kind: "beforeAfter",
            title: "架空の前後",
            before: { kind: "image", path: "架空/before.png" },
            after: { kind: "image", path: "架空/after.png" },
            fold: "",
            aside: "",
          },
        ],
      },
    ])

    function swapRoot(container: HTMLElement): HTMLElement {
      return typedElement(
        container.querySelector("div.report-before-after-swap"),
        HTMLElement,
        "前後の包み",
      )
    }

    function button(container: HTMLElement, name: string): HTMLElement {
      const found = [...container.querySelectorAll("button")].find(
        (candidate) => candidate.textContent === name,
      )
      return typedElement(found ?? null, HTMLElement, name)
    }

    const VIEW_KEY = "tsukumo-before-after-view:v1"

    function zoomButton(container: HTMLElement): HTMLElement {
      return typedElement(
        container.querySelector('button[aria-label="この画像を拡大"]'),
        HTMLElement,
        "大きな1枚",
      )
    }

    function expectPressed(container: HTMLElement, name: string, pressed: string): void {
      expect(button(container, name).getAttribute("aria-pressed")).toBe(pressed)
    }

    beforeEach(() => {
      localStorage.removeItem(VIEW_KEY)
    })

    afterEach(() => {
      localStorage.removeItem(VIEW_KEY)
    })

    it("並べるから始まり、「重ねて見る」「並べて見る」の口も入れ替える口も出さない", () => {
      const { container } = render(<Markdown text={imagesText} />)
      const root = swapRoot(container)

      expect(root.dataset["view"]).toBe("side")
      expect(container.querySelectorAll('[role="group"][aria-label="見せ方"]')).toHaveLength(1)
      expectPressed(container, "並べる", "true")
      expectPressed(container, "切り替え", "false")
      expect(container.querySelectorAll("img")).toHaveLength(2)
      const names = [...container.querySelectorAll("button")].map((b) => b.textContent)
      expect(names).not.toContain("重ねて見る")
      expect(names).not.toContain("並べて見る")
    })

    it("切り替えを選ぶと見本が前・後の2つ出て、見本を押すと見える側が即時に替わり aria-pressed が追従する", () => {
      const { container } = render(<Markdown text={imagesText} />)
      const root = swapRoot(container)

      fireEvent.click(button(container, "切り替え"))
      expect(root.dataset["view"]).toBe("switch")
      expect(root.dataset["shown"]).toBe("before")
      expectPressed(container, "切り替え", "true")
      expectPressed(container, "前", "true")
      expectPressed(container, "後", "false")

      fireEvent.click(button(container, "後"))
      expect(root.dataset["shown"]).toBe("after")
      expectPressed(container, "前", "false")
      expectPressed(container, "後", "true")

      fireEvent.click(button(container, "前"))
      expect(root.dataset["shown"]).toBe("before")

      fireEvent.click(button(container, "並べる"))
      expect(root.dataset["view"]).toBe("side")
      expect(container.querySelectorAll("img")).toHaveLength(2)
    })

    it("切り替えで大きな1枚にフォーカスがあるときの Space で前と後がかわり、拡大は開かない", () => {
      const { container } = render(<Markdown text={imagesText} />)
      const root = swapRoot(container)
      fireEvent.click(button(container, "切り替え"))

      fireEvent.keyDown(zoomButton(container), { key: " " })
      expect(root.dataset["shown"]).toBe("after")
      expectPressed(container, "後", "true")
      expect(document.querySelector('[role="dialog"]')).toBeNull()

      fireEvent.keyDown(zoomButton(container), { key: " " })
      expect(root.dataset["shown"]).toBe("before")
    })

    it("見本の Space は大きな1枚の入れかえに数えず、並べるの間は Space で替わらない", () => {
      const { container } = render(<Markdown text={imagesText} />)
      const root = swapRoot(container)

      fireEvent.keyDown(zoomButton(container), { key: " " })
      expect(root.dataset["shown"]).toBe("before")

      fireEvent.click(button(container, "切り替え"))
      fireEvent.keyDown(button(container, "後"), { key: " " })
      expect(root.dataset["shown"]).toBe("before")
    })

    it("選んだ見せ方は覚え、描き直しても残る。壊れた値は並べるに落ちる", () => {
      const first = render(<Markdown text={imagesText} />)
      fireEvent.click(button(first.container, "切り替え"))
      expect(localStorage.getItem(VIEW_KEY)).toBe("switch")
      first.unmount()

      const second = render(<Markdown text={imagesText} />)
      expect(swapRoot(second.container).dataset["view"]).toBe("switch")
      expectPressed(second.container, "切り替え", "true")
      second.unmount()

      localStorage.setItem(VIEW_KEY, "stacked")
      const third = render(<Markdown text={imagesText} />)
      expect(swapRoot(third.container).dataset["view"]).toBe("side")
    })

    it("画像が片方でも読めなければ2つ組も見本も出さない（切り替えを覚えていても並べる）", () => {
      localStorage.setItem(VIEW_KEY, "switch")
      const { container } = render(<Markdown text={imagesText} />)
      expect(container.querySelectorAll("button").length).toBeGreaterThan(0)

      fireEvent.error(typedElement(container.querySelector("img"), HTMLImageElement, "画像"))

      expect(container.querySelector(MISSING_SELECTOR)).not.toBeNull()
      expect(container.querySelector('[role="group"][aria-label="見せ方"]')).toBeNull()
      const names = [...container.querySelectorAll("button")].map((b) => b.textContent)
      expect(names).not.toContain("切り替え")
      expect(names).not.toContain("前")
      expect(swapRoot(container).dataset["view"]).toBe("side")
    })

    describe("押して大きく見る", () => {
      function zoomButtons(container: HTMLElement): HTMLElement[] {
        return [...container.querySelectorAll<HTMLElement>('button[aria-label="この画像を拡大"]')]
      }

      function pairPressed(dialog: HTMLElement, name: string): string | null {
        const found = [...dialog.querySelectorAll("button")].find(
          (candidate) => candidate.textContent === name,
        )
        return found?.getAttribute("aria-pressed") ?? null
      }

      function beforeAfterDialog(): HTMLElement {
        return typedElement(
          document.querySelector("dialog.before-after-zoom"),
          HTMLElement,
          "前後の面",
        )
      }

      it("押した側から前後の面が開き、塊の題を添える", () => {
        const { container } = render(<Markdown text={imagesText} />)

        fireEvent.click(typedElement(zoomButtons(container)[1] ?? null, HTMLElement, "後の画像"))
        const dialog = beforeAfterDialog()
        expect(pairPressed(dialog, "後")).toBe("true")
        expect(pairPressed(dialog, "前")).toBe("false")
        expect(dialog.textContent).toContain("図 1")
        expect(dialog.textContent).toContain("架空の前後")
        expect(document.querySelector("dialog.image-zoom")).toBeNull()
      })

      it("前の画像を押すと前から開く", () => {
        const { container } = render(<Markdown text={imagesText} />)

        fireEvent.click(typedElement(zoomButtons(container)[0] ?? null, HTMLElement, "前の画像"))

        expect(pairPressed(beforeAfterDialog(), "前")).toBe("true")
      })

      it("切り替えでは、見せている側でなく押した画像の側から開く", () => {
        const { container } = render(<Markdown text={imagesText} />)
        fireEvent.click(button(container, "切り替え"))
        fireEvent.click(button(container, "後"))

        fireEvent.click(typedElement(zoomButtons(container)[0] ?? null, HTMLElement, "前の画像"))

        expect(pairPressed(beforeAfterDialog(), "前")).toBe("true")
      })

      it("面を閉じると、押した画像のボタンにフォーカスが戻る", () => {
        const { container } = render(<Markdown text={imagesText} />)
        const afterButton = typedElement(zoomButtons(container)[1] ?? null, HTMLElement, "後の画像")

        fireEvent.click(afterButton)
        fireEvent.click(
          typedElement(
            [...beforeAfterDialog().querySelectorAll("button")].find(
              (candidate) => candidate.getAttribute("aria-label") === "閉じる",
            ) ?? null,
            HTMLElement,
            "×",
          ),
        )

        expect(document.querySelector("dialog.before-after-zoom")).toBeNull()
        expect(document.activeElement).toBe(afterButton)
      })

      it("画像が片方札になった塊では、読めた側は今の面（画像ごとの拡大）を開く", () => {
        const { container } = render(<Markdown text={imagesText} />)
        fireEvent.error(typedElement(container.querySelector("img"), HTMLImageElement, "画像"))

        fireEvent.click(typedElement(zoomButtons(container)[0] ?? null, HTMLElement, "読めた画像"))

        expect(document.querySelector("dialog.image-zoom")).not.toBeNull()
        expect(document.querySelector("dialog.before-after-zoom")).toBeNull()
      })
    })

    it("片方が画像でない前後には口を出さない", () => {
      const text = reportSectionsMarkdown([
        {
          heading: "",
          shapeTag: "unspecified",
          blocks: [
            {
              kind: "beforeAfter",
              title: "",
              before: { kind: "image", path: "架空/before.png" },
              after: { kind: "points", points: ["架空"] },
              fold: "",
              aside: "",
            },
          ],
        },
      ])
      const { container } = render(<Markdown text={text} />)

      expect(container.querySelector("div.report-before-after-swap")).toBeNull()
      expect(container.querySelector('[role="group"][aria-label="見せ方"]')).toBeNull()
    })
  })

  describe("拡大", () => {
    const ZOOM_NAME = "この画像を拡大"

    function renderImage(): HTMLElement {
      const text = reportSectionsMarkdown([
        {
          heading: "",
          shapeTag: "unspecified",
          blocks: [
            { kind: "image", path: "架空.png", caption: "架空", notes: [], fold: "", aside: "" },
          ],
        },
      ])
      return render(<Markdown text={text} />).container
    }

    function zoomButton(container: HTMLElement): HTMLElement {
      return typedElement(
        container.querySelector(`button[aria-label="${ZOOM_NAME}"]`),
        HTMLButtonElement,
        "拡大のボタン",
      )
    }

    it("押すと拡大の面が開き、拡大の絵は小さい方と同じ URL を読む", () => {
      const container = renderImage()
      const small = typedElement(container.querySelector("img"), HTMLImageElement, "画像")

      fireEvent.click(zoomButton(container))

      const dialog = document.querySelector("dialog.image-zoom")
      expect(dialog?.hasAttribute("open")).toBe(true)
      expect(dialog?.querySelector("img")?.getAttribute("src")).toBe(small.getAttribute("src"))
    })

    it("「閉じる」で拡大の面が閉じる", () => {
      const container = renderImage()
      fireEvent.click(zoomButton(container))

      const close = typedElement(
        document.querySelector("dialog.image-zoom button:last-of-type"),
        HTMLButtonElement,
        "閉じるボタン",
      )
      expect(close.textContent).toBe("閉じる")
      fireEvent.click(close)

      expect(document.querySelector("dialog.image-zoom")).toBeNull()
    })

    it("読めなかった画像には拡大の入口が出ない", () => {
      const container = renderImage()

      fireEvent.error(typedElement(container.querySelector("img"), HTMLImageElement, "画像"))

      expect(container.querySelector(`button[aria-label="${ZOOM_NAME}"]`)).toBeNull()
    })
  })
})

describe("Markdown（svg の塊の拡大）", () => {
  const FIGURE_NAME = "この図を拡大"

  function renderSvg(): HTMLElement {
    const text = reportSectionsMarkdown([
      {
        heading: "",
        shapeTag: "unspecified",
        blocks: [
          {
            kind: "svg",
            title: "架空",
            width: 160,
            height: 720,
            shapes: [
              {
                kind: "rect",
                x: 1,
                y: 1,
                width: 10,
                height: 10,
                label: "架空",
                emphasis: false,
                labelAt: "center",
              },
            ],
            fold: "",
            aside: "",
          },
        ],
      },
    ])
    return render(<Markdown text={text} />).container
  }

  it("押せる図で、押すと拡大の面が開き、Esc 相当の閉じるで閉じる", () => {
    const container = renderSvg()
    const figure = typedElement(
      container.querySelector(`[role="button"][aria-label="${FIGURE_NAME}"]`),
      HTMLElement,
      "押せる図",
    )

    fireEvent.click(figure)

    const dialog = document.querySelector("dialog.image-zoom")
    expect(dialog?.querySelector("img")?.getAttribute("src")).toContain("data:image/svg+xml")

    fireEvent.click(
      typedElement(
        document.querySelector("dialog.image-zoom button:last-of-type"),
        HTMLButtonElement,
        "閉じるボタン",
      ),
    )
    expect(document.querySelector("dialog.image-zoom")).toBeNull()
  })

  it("Enter でも開く", () => {
    const container = renderSvg()
    const figure = typedElement(
      container.querySelector(`[role="button"][aria-label="${FIGURE_NAME}"]`),
      HTMLElement,
      "押せる図",
    )

    fireEvent.keyDown(figure, { key: "Enter" })

    expect(document.querySelector("dialog.image-zoom")).not.toBeNull()
  })
})
