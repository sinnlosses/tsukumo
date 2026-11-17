import { expect, test } from "./room-fixture.ts"

// 仕事の流れのセリフを押すと、立ち絵がその時の表情になる（docs/architecture/display/main-view.md「いまの一言」）。
// 場面 `report-tool-quick` は最後まで流れると、立ち絵は締めのセリフの表情（`proud`）で、
// 閉じた「作業の経過」の中に過去のセリフ「見てくるね。」（`default`）が入る。
// 開いて押すと立ち絵が `default` になり、留めた行から Esc で `proud` へ戻る。

const PORTRAIT = "[data-character-stage] [data-expression]"

test.describe("仕事の流れのセリフを押すと遡る", () => {
  test("過去のセリフを押すとその表情になり、留めた行の Esc で最新へ戻る", async ({ run }) => {
    const room = await run.open({
      scenario: "speech-pin",
      scene: "report-tool-quick",
      viewport: "wide",
      domRoots: ["main"],
    })
    await room.waitForEvent("turn-finished")
    const portrait = room.page.locator(PORTRAIT)
    await expect(portrait).toHaveAttribute("data-expression", "proud")

    await room.page.locator('[data-region="main"] details > summary').first().click()
    const row = room.page.locator('[data-speaker="character"]', { hasText: "見てくるね。" })
    await row.click()

    await expect(portrait).toHaveAttribute("data-expression", "default")
    await expect(row).toHaveAttribute("aria-pressed", "true")

    await room.page.keyboard.press("Escape")

    await expect(portrait).toHaveAttribute("data-expression", "proud")
    await expect(row).toHaveAttribute("aria-pressed", "false")
  })
})
