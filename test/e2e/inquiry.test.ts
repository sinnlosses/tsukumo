import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import type { Locator, Page } from "playwright-core"
import { describe, expect, it } from "vitest"

import { fictionalPng } from "../../scripts/lib/fictional-png.ts"
import { useScenarioRun } from "./scenario-run.ts"

// お伺い（許可要求と質問。docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 許可は場面 `permission`、質問は `question-pair`（単一選択が1問ずつ）・
// `question-long`（長いラベルと長い説明）・`question-preview`（選択肢ごとの比較）・
// `question-preview-image`（preview に書いた手元の画像と、描かない画像）。
// どの場面も答え待ちを出したまま、答えると次の `pending-changed` が流れる。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("お伺い", () => {
  it("許可は、カードを選んで「これで答える」を押すと答えが流れ、札が消える（マウス）", async () => {
    const room = await run.open({
      scenario: "inquiry-permission-mouse",
      scene: "permission",
      viewport: "wide",
      domRoots: ["main", "dispatch"],
    })
    const inquiry = inquiryOf(room.page)

    // 場面の手が流れ終わってから押す（押して流れる `pending-changed` を場面の手と競わせない）。
    await room.waitForEvent("turn-finished")
    await inquiry.getByRole("radio", { name: /許可/ }).click()
    await inquiry.getByRole("button", { name: /これで答える/ }).click()
    await room.waitForEvent("pending-changed", 2)
    await expect.poll(() => inquiry.count()).toBe(0)
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("質問は、カードを選んで「次へ」「これで答える」で1問ずつ答える（マウス）", async () => {
    const room = await run.open({
      scenario: "inquiry-question-mouse",
      scene: "question-pair",
      viewport: "wide",
      domRoots: ["main"],
    })
    const inquiry = inquiryOf(room.page)

    await inquiry.getByText("道具B（架空）").click()
    await inquiry.getByRole("button", { name: /次へ/ }).click()
    await expect.poll(() => inquiry.textContent()).toContain("2 / 2")
    await inquiry.getByText("土台（架空）").click()
    await inquiry.getByRole("button", { name: /これで答える/ }).click()

    await room.waitForEvent("question-answered")
    await expect.poll(() => inquiry.count()).toBe(0)
  })

  it.each([
    ["inquiry-question-long-medium", "question-long"],
    ["inquiry-question-preview-medium", "question-preview"],
  ] as const)(
    "%s: 札の「次へ」「これで答える」はメインビューの中にあり、転がさずに押せる",
    async (scenario, scene) => {
      const room = await run.open({ scenario, scene, viewport: "medium", domRoots: ["main"] })
      const main = room.page.locator('[data-region="main"]')
      const answer = inquiryOf(room.page).getByRole("button", { name: /次へ|これで答える/ })

      await expect.poll(() => insideOf(answer, main)).toBe(true)
      const hit = await answer.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const found = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        )
        return found !== null && element.contains(found)
      })
      expect(hit).toBe(true)
    },
  )

  it("preview に書いた手元の画像は棚の経路で札の中に出て、外部の URL・data:・置いていない画像は「画像を出せない」の札になる", async () => {
    const room = await run.open({
      scenario: "inquiry-question-preview-image",
      scene: "question-preview-image",
      viewport: "wide",
      domRoots: ["main"],
    })
    // 場面の質問より先に、preview が指す画像を cwd に置く（置いていないほうの画像は置かない）。
    mkdirSync(join(room.cwd, "report-image-fixture"))
    writeFileSync(join(room.cwd, "report-image-fixture", "after.png"), fictionalPng(8, 4))
    writeFileSync(join(room.cwd, "report-image-fixture", "tall.png"), fictionalPng(4, 40))
    const inquiry = inquiryOf(room.page)

    await room.waitForPending("fake-ask-preview-image")
    for (const alt of ["架空の横長の画面", "架空の縦長の画面"]) {
      const image = inquiry.getByAltText(alt)
      expect(await image.getAttribute("src")).toMatch(
        /^\/report-image\/fake-ask-preview-image\/report-image-fixture%2F/,
      )
      await expect
        .poll(() =>
          image.evaluate((element) =>
            element instanceof HTMLImageElement ? element.naturalWidth : 0,
          ),
        )
        .toBeGreaterThan(0)
    }
    for (const name of ["架空の外部の画像", "架空の埋め込みの画像", "架空の置いていない画像"]) {
      await expect
        .poll(() => inquiry.getByRole("img", { name }).evaluate((e) => e.tagName))
        .toBe("SPAN")
    }
    await room.settleAndMatch(ELAPSED_MS)
  })
})

function inquiryOf(page: Page): Locator {
  return page.getByRole("region", { name: "お伺い" })
}

/** `inner` の矩形が `outer` の矩形に収まっているか（転がり終わるのを poll で待つ）。 */
async function insideOf(inner: Locator, outer: Locator): Promise<boolean> {
  const [innerBox, outerBox] = await Promise.all([inner.boundingBox(), outer.boundingBox()])
  if (innerBox === null || outerBox === null) {
    return false
  }
  return (
    innerBox.y >= outerBox.y &&
    innerBox.y + innerBox.height <= outerBox.y + outerBox.height &&
    innerBox.x >= outerBox.x &&
    innerBox.x + innerBox.width <= outerBox.x + outerBox.width
  )
}
