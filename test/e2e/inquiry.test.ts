import type { Locator, Page } from "playwright-core"
import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// お伺い（許可要求と質問。docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 許可は場面 `permission`、質問は `question-pair`（単一選択が1問ずつ）・`question-multi`（複数選択）・
// `question-long`（長いラベルと長い説明）・`question-preview`（選択肢ごとの比較）。
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

  it("許可は、入力欄の帯の「お伺いへ」から 2 と Enter で拒否できる（キー）", async () => {
    const room = await run.open({
      scenario: "inquiry-permission-keys",
      scene: "permission",
      viewport: "wide",
      domRoots: ["main"],
    })
    const inquiry = inquiryOf(room.page)

    await room.page.getByRole("button", { name: "お伺いへ" }).click()
    await expect
      .poll(() => room.page.evaluate(() => document.activeElement?.getAttribute("type")))
      .toBe("radio")
    await room.page.keyboard.press("2")
    expect(await inquiry.getByRole("radio", { name: /拒否/ }).isChecked()).toBe(true)
    await room.page.keyboard.press("Enter")

    await room.waitForEvent("pending-changed", 2)
    await expect.poll(() => inquiry.count()).toBe(0)
  })

  it("答え待ちのあいだ、入力欄の送るボタンは塗らず、札の頭に待っている時間が出る", async () => {
    const room = await run.open({
      scenario: "inquiry-question-pair",
      scene: "question-pair",
      viewport: "wide",
      domRoots: ["main", "dispatch"],
    })

    await room.waitForEvent("turn-finished")
    const send = room.page.locator('[data-region="dispatch"] button[type="submit"]')
    expect(await send.getAttribute("data-emphasis")).toBe("quiet")
    expect(await inquiryOf(room.page).textContent()).toContain("待って")

    await room.page.getByRole("textbox").fill("架空の自由な答え")
    expect(await send.getAttribute("data-emphasis")).toBe("solid")
    await room.page.getByRole("textbox").fill("")
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

  it("質問は、数字キーで選び Enter で進み、選ぶ前の Enter では進まない（キー）", async () => {
    const room = await run.open({
      scenario: "inquiry-question-keys",
      scene: "question-pair",
      viewport: "wide",
      domRoots: ["main"],
    })
    const inquiry = inquiryOf(room.page)

    await room.page.getByRole("button", { name: "お伺いへ" }).click()
    await room.page.keyboard.press("Enter")
    expect(await inquiry.textContent()).toContain("1 / 2")

    await room.page.keyboard.press("2")
    await room.page.keyboard.press("Enter")
    await expect.poll(() => inquiry.textContent()).toContain("2 / 2")
    await room.page.keyboard.press("1")
    await room.page.keyboard.press("Enter")

    await room.waitForEvent("question-answered")
    await expect.poll(() => inquiry.count()).toBe(0)
  })

  it("複数選択の質問は、数字キーで入り切りする（question-multi）", async () => {
    const room = await run.open({
      scenario: "inquiry-question-multi",
      scene: "question-multi",
      viewport: "wide",
      domRoots: ["main", "dispatch"],
    })
    const inquiry = inquiryOf(room.page)

    await room.waitForEvent("turn-finished")
    await room.page.getByRole("button", { name: "お伺いへ" }).click()
    await room.page.keyboard.press("1")
    await room.page.keyboard.press("2")
    await room.page.keyboard.press("1")
    const checked = await Promise.all(
      (await inquiry.getByRole("checkbox").all()).map((box) => box.isChecked()),
    )
    expect(checked.slice(0, 2)).toEqual([false, true])
    await room.settleAndMatch(ELAPSED_MS)
  })

  it.each([
    ["inquiry-question-long-large", "question-long", "large"],
    ["inquiry-question-long-medium", "question-long", "medium"],
    ["inquiry-question-preview-large", "question-preview", "large"],
    ["inquiry-question-preview-medium", "question-preview", "medium"],
  ] as const)(
    "%s: 札の「次へ」「これで答える」はメインビューの中にあり、転がさずに押せる",
    async (scenario, scene, viewport) => {
      const room = await run.open({ scenario, scene, viewport, domRoots: ["main"] })
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
