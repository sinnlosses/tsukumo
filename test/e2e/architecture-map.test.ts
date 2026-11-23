import { sampleMap } from "../server/architecture-map/sample-map.ts"
import { expect, test } from "./room-fixture.ts"
import { advanceClockUntilVisible } from "./scenario-wait.ts"

// ADR 0082 のアーキテクチャの地図。
// サイドバーの「地図」のタブ → 広げる → 大の箱へ潜る → 拡大 → 地のドラッグで動かす → パンくずで戻る → ⎋ で閉じる、を実ブラウザで1本通す。
// 地図は架空の `.architecture-map.json`（作業ディレクトリに置く）。判定は倍率と位置の数値なので、期待値のファイルには撮らず `expect` に書く。

test.describe("アーキテクチャの地図", () => {
  test("地図のタブから広げ、潜り、拡大し、動かし、パンくずで戻り、⎋ で閉じる", async ({ run }) => {
    const room = await run.open({
      scenario: "architecture-map",
      scene: "none",
      viewport: "wide",
      domRoots: ["sidebar"],
      cwdFiles: [{ path: ".architecture-map.json", content: JSON.stringify(sampleMap()) }],
    })
    const page = room.page

    // 時計を止めているので、問い合わせの結果を React へ渡す setTimeout が進まない。タブが出るまで進める。
    const mapTab = page.getByRole("tab", { name: "地図" })
    await advanceClockUntilVisible(page, mapTab)
    await mapTab.click()
    await page.getByRole("button", { name: "広げる" }).click()

    const surface = page.getByRole("dialog", { name: "アーキテクチャの地図" })
    await surface.waitFor()
    await expect(surface.getByText("このリポジトリは何で")).toBeVisible()

    await surface.getByRole("button", { name: "アプリ", exact: true }).click()
    await expect(surface.getByRole("button", { name: "app/view" })).toBeVisible()
    await expect(surface.getByText("この機能は何を受け持ち")).toBeVisible()

    const content = surface.getByTestId("architecture-map-stage").locator("> div")
    const scaleOf = async () => Number(await content.getAttribute("data-scale"))
    const before = await scaleOf()
    await surface.getByRole("button", { name: "拡大" }).click()
    await expect.poll(scaleOf).toBeGreaterThan(before)

    const transformBefore = await content.evaluate((element) => element.style.transform)
    const stage = await surface.getByTestId("architecture-map-stage").boundingBox()
    if (stage === null) {
      throw new Error("地図の枠の位置が取れない")
    }
    await page.mouse.move(stage.x + 20, stage.y + 20)
    await page.mouse.down()
    await page.mouse.move(stage.x + 90, stage.y + 60, { steps: 4 })
    await page.mouse.up()
    await expect
      .poll(() => content.evaluate((element) => element.style.transform))
      .not.toBe(transformBefore)

    await surface
      .getByRole("navigation", { name: "地図の段" })
      .getByRole("button", { name: "全体" })
      .click()
    await expect(surface.getByRole("button", { name: "server", exact: true })).toBeVisible()
    await expect(surface.getByRole("button", { name: "app/view" })).toBeHidden()

    await page.keyboard.press("Escape")
    await expect(surface).toBeHidden()
  })
})
