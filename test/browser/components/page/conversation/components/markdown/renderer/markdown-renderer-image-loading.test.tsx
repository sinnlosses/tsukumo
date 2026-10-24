import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Markdown } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/markdown-renderer.tsx"
import type { ReportBlock } from "../../../../../../../../src/shared/report/report-block.ts"
import { reportSectionsMarkdown } from "../../../../../../../../src/shared/report/report-markdown.ts"
import { typedElement } from "../../../../../../../typed-element.ts"

afterEach(() => {
  cleanup()
})

describe("Markdown（image の塊の画像の読み方）", () => {
  it("棚の画像は遅延して読み、寸法が分かる画像にだけ width と height が付く", () => {
    const image = (path: string): ReportBlock => ({
      kind: "image",
      path,
      caption: path,
      notes: [],
      fold: "",
      aside: "",
    })
    const text = reportSectionsMarkdown(
      [
        {
          heading: "",
          shapeTag: "unspecified",
          blocks: [image("架空/a.png"), image("架空/b.png")],
        },
      ],
      {
        kind: "shelved",
        toolUseId: "fictional-report",
        sizes: [{ path: "架空/a.png", width: 320, height: 180 }],
        unshelved: [],
      },
    )
    const { container } = render(<Markdown text={text} />)

    const attributes = (alt: string) => {
      const element = typedElement(
        container.querySelector(`img[alt="${alt}"]`),
        HTMLImageElement,
        alt,
      )
      return ["width", "height", "loading", "decoding"].map((name) => element.getAttribute(name))
    }
    expect(attributes("架空/a.png")).toEqual(["320", "180", "lazy", "async"])
    expect(attributes("架空/b.png")).toEqual([null, null, "lazy", "async"])
  })

  it("棚に無いと運ばれたパスの画像は img を出さず、最初から「画像を出せない」の札で描く", () => {
    const text = reportSectionsMarkdown(
      [
        {
          heading: "",
          shapeTag: "unspecified",
          blocks: [
            {
              kind: "image",
              path: "架空/missing.png",
              caption: "架空の置いていない画像",
              notes: [],
              fold: "",
              aside: "",
            },
          ],
        },
      ],
      {
        kind: "shelved",
        toolUseId: "fictional-report",
        sizes: [],
        unshelved: ["架空/missing.png"],
      },
    )
    const { container } = render(<Markdown text={text} />)

    expect(container.querySelector("img")).toBeNull()
    const label = typedElement(
      container.querySelector('[role="img"]'),
      HTMLElement,
      "画像を出せない札",
    )
    expect(label.getAttribute("aria-label")).toBe("架空の置いていない画像")
    expect(label.textContent).toContain("画像を出せない")
  })
})
