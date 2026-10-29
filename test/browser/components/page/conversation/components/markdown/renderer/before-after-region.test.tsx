import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Markdown } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/markdown-renderer.tsx"
import { reportSectionsMarkdown } from "../../../../../../../fixture/report-sections-markdown.ts"

afterEach(() => {
  cleanup()
})

const REGION = { left: 29.6, top: 44.6, width: 40.5, height: 10.6 }

function renderBeforeAfter(regions: {
  readonly before?: typeof REGION
  readonly after?: typeof REGION
}): HTMLElement {
  const text = reportSectionsMarkdown([
    {
      heading: "",
      blocks: [
        {
          kind: "beforeAfter",
          title: "架空の前後",
          before: {
            kind: "image",
            path: "架空/before.png",
            ...(regions.before === undefined ? {} : { region: regions.before }),
          },
          after: {
            kind: "image",
            path: "架空/after.png",
            ...(regions.after === undefined ? {} : { region: regions.after }),
          },
          fold: "",
          aside: "",
        },
      ],
    },
  ])
  return render(<Markdown text={text} />).container
}

function frames(root: ParentNode): readonly HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("span.region-frame")]
}

describe("Markdown（前後の画像の変わった場所の枠）", () => {
  it("region のある側の画像にだけ、飾りの枠が画像に対する%の位置で出る", () => {
    const container = renderBeforeAfter({ after: REGION })

    const found = frames(container)
    expect(found).toHaveLength(1)
    const frame = found[0]
    expect(frame?.getAttribute("aria-hidden")).toBe("true")
    expect(frame?.dataset["side"]).toBe("after")
    expect(frame?.style.left).toBe("29.6%")
    expect(frame?.style.top).toBe("44.6%")
    expect(frame?.style.width).toBe("40.5%")
    expect(frame?.style.height).toBe("10.6%")
    expect(frame?.closest("button")?.querySelector("img")?.alt).toContain("後の画面")
  })

  it("前の側の枠は前の側の画像に出て、region の無い側には出ない", () => {
    const container = renderBeforeAfter({ before: REGION })

    const found = frames(container)
    expect(found).toHaveLength(1)
    expect(found[0]?.dataset["side"]).toBe("before")
    expect(found[0]?.closest("button")?.querySelector("img")?.alt).toContain("前の画面")
  })

  it("region が無ければどちらにも枠を出さない", () => {
    expect(frames(renderBeforeAfter({}))).toHaveLength(0)
  })
})
