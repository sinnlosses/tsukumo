import type { Locator } from "playwright-core"
import { describe, expect, it } from "vitest"

import { fictionalPng } from "../../scripts/shared/fictional-png.ts"
import { useScenarioRun } from "./scenario-run.ts"

// レポートの画像の寸法（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 縦長の画像の描画の比（`report-tall-figure`）と、読み込みの前後で次の要素の位置が動かないこと（`report-image`）を、
// 実ブラウザの寸法で確かめる。判定は期待値のファイルに撮らず `expect` に書く。

const run = useScenarioRun()

const REPORT_IMAGE_ROUTE = "**/report-image/**"

describe("レポートの画像の寸法", () => {
  it("縦長の画像は高さの上限に当たっても、属性の縦横比のまま描かれる", async () => {
    const room = await run.open({
      scenario: "image-layout-tall",
      scene: "report-tall-figure",
      viewport: "phone",
      domRoots: ["main"],
      cwdFiles: [{ path: "report-image-fixture/tall.png", content: fictionalPng(180, 900) }],
    })

    const image = room.page.getByAltText("架空の縦に長い画面")
    await image.waitFor()
    await expect.poll(() => naturalWidthOf(image)).toBeGreaterThan(0)

    const box = await image.boundingBox()
    expect(box).not.toBeNull()
    const { width, height } = box ?? { width: 0, height: 0 }
    // 高さの上限（70cqh）に当たっている（当たらないと比の崩れる条件が成り立たない）。
    expect(height).toBeLessThan(900)
    // 潰れると比は倍近く外れる。幅が数十 px なので、画素の丸めの分だけ余裕を持たせる。
    expect(Math.abs(width / height - 180 / 900) / (180 / 900)).toBeLessThan(0.05)
  })

  it("画像の読み込みの前後で、画像の次の要素の位置が動かない", async () => {
    const room = await run.open({
      scenario: "image-layout-shift",
      scene: "report-image",
      viewport: "wide",
      domRoots: ["main"],
      cwdFiles: [{ path: "report-image-fixture/after.png", content: fictionalPng(8, 4) }],
    })
    let release: () => void = () => undefined
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    await room.page.route(REPORT_IMAGE_ROUTE, async (route) => {
      await released
      await route.continue()
    })

    const image = room.page.getByAltText("架空の札の見出しが 21px になった画面")
    await image.waitFor()
    const before = await nextElementTop(image)
    expect(await naturalWidthOf(image)).toBe(0)

    release()
    await expect.poll(() => naturalWidthOf(image)).toBeGreaterThan(0)
    const after = await nextElementTop(image)
    expect(after).toBeCloseTo(before, 0)
  })
})

function naturalWidthOf(image: Locator): Promise<number> {
  return image.evaluate((element) =>
    element instanceof HTMLImageElement ? element.naturalWidth : 0,
  )
}

/** 画像から祖先をたどって最初に見つかる「次の兄弟」の、窓の上端からの位置。 */
function nextElementTop(image: Locator): Promise<number> {
  return image.evaluate((element) => {
    for (let node: Element | null = element; node !== null; node = node.parentElement) {
      if (node.nextElementSibling !== null) {
        return node.nextElementSibling.getBoundingClientRect().top
      }
    }
    return Number.NaN
  })
}
