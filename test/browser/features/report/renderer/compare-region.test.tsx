import { cleanup, fireEvent } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { loadMarkdown } from "../../../../../src/browser/features/report/markdown.tsx"
import { PLAIN_LEAF_VALUE, renderDirectLeaf } from "../../../../fixture/direct-leaf-compare.tsx"

const SIDE = 100
const CHANGED = { left: 10, top: 20, width: 30, height: 5 }

/** canvas の境界だけを差し替える。後の画に描かれた画像だけ、CHANGED の範囲を白くする。 */
function stubCanvas(changed: boolean) {
  const readPixels = vi.fn<() => void>()
  let drawn = ""
  const fake = {
    drawImage: (image: HTMLImageElement) => {
      drawn = image.alt
    },
    getImageData: () => {
      readPixels()
      const data = new Uint8ClampedArray(SIDE * SIDE * 4)
      if (changed && drawn.includes("後の画面")) {
        for (let y = CHANGED.top; y < CHANGED.top + CHANGED.height; y += 1) {
          for (let x = CHANGED.left; x < CHANGED.left + CHANGED.width; x += 1) {
            data.fill(255, (y * SIDE + x) * 4, (y * SIDE + x) * 4 + 4)
          }
        }
      }
      return { data }
    },
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- 使う2つのメソッドだけの代役を、構造的に合わない canvas の文脈として差し込むため
  const context = fake as unknown as CanvasRenderingContext2D
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(SIDE)
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(SIDE)
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context)
  return readPixels
}

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const REGION = { left: 29.6, top: 44.6, width: 40.5, height: 10.6 }

const SHELF = { kind: "shelved", toolUseId: "fictional-report", sizes: [], unshelved: [] } as const

/** 見比べの包み（見せ方の口）は題の番号のある部品だけが持つ。 */
const FIGURE_VALUE = {
  ...PLAIN_LEAF_VALUE,
  captionNumber: { kind: "figure", ordinal: 1 },
} as const

function renderComparePair(
  regions: {
    readonly before?: typeof REGION
    readonly after?: typeof REGION
  },
  relation: "before-after" | "versus" = "before-after",
): HTMLElement {
  return renderDirectLeaf(
    {
      id: "b1",
      component: "Compare",
      title: "架空の前後",
      relation,
      sides: [
        {
          heading: "",
          kind: "image",
          path: "架空/before.png",
          ...(regions.before === undefined ? {} : { region: regions.before }),
        },
        {
          heading: "",
          kind: "image",
          path: "架空/after.png",
          ...(regions.after === undefined ? {} : { region: regions.after }),
        },
      ],
      fold: "",
      aside: "",
    },
    SHELF,
    FIGURE_VALUE,
  ).container
}

function frames(root: ParentNode): readonly HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("span.region-frame")]
}

describe("前後の画像の変わった場所の枠", () => {
  it("region のある側の画像にだけ、飾りの枠が画像に対する%の位置で出る", () => {
    const container = renderComparePair({ after: REGION })

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
    const container = renderComparePair({ before: REGION })

    const found = frames(container)
    expect(found).toHaveLength(1)
    expect(found[0]?.dataset["side"]).toBe("before")
    expect(found[0]?.closest("button")?.querySelector("img")?.alt).toContain("前の画面")
  })

  it("region が無ければどちらにも枠を出さない", () => {
    expect(frames(renderComparePair({}))).toHaveLength(0)
  })
})

function loadAll(root: ParentNode): void {
  for (const image of root.querySelectorAll("img")) {
    fireEvent.load(image)
  }
}

describe("region が無い前後の対を画素で比べた枠", () => {
  it("両方が読めたら1回だけ比べ、見つかった範囲を後の側に囲む", () => {
    const readPixels = stubCanvas(true)
    const container = renderComparePair({})

    loadAll(container)
    loadAll(container)

    expect(readPixels).toHaveBeenCalledTimes(2)
    const found = frames(container)
    expect(found).toHaveLength(1)
    expect(found[0]?.dataset["side"]).toBe("after")
    expect(found[0]?.style.left).toBe("10%")
    expect(found[0]?.style.height).toBe("5%")
  })

  it("比べて見つからなければ囲まない", () => {
    stubCanvas(false)
    const container = renderComparePair({})

    loadAll(container)

    expect(frames(container)).toHaveLength(0)
  })

  it("書き手が region を渡した対は比べず、渡された枠のまま描く", () => {
    const readPixels = stubCanvas(true)
    const container = renderComparePair({ after: REGION })

    loadAll(container)

    expect(readPixels).not.toHaveBeenCalled()
    expect(frames(container)[0]?.style.left).toBe("29.6%")
  })

  it("versus の対は比べず、囲まない", () => {
    const readPixels = stubCanvas(true)
    const container = renderComparePair({}, "versus")

    loadAll(container)

    expect(readPixels).not.toHaveBeenCalled()
    expect(frames(container)).toHaveLength(0)
  })

  it("片方しか読めていない間は比べない", () => {
    const readPixels = stubCanvas(true)
    const container = renderComparePair({})

    const first = container.querySelector("img")
    if (first !== null) {
      fireEvent.load(first)
    }

    expect(readPixels).not.toHaveBeenCalled()
  })
})
