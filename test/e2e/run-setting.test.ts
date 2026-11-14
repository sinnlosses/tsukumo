import { expect, test } from "./room-fixture.ts"

// 新しいセッションの既定のモデル・effort の操作子（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面は名指しせず（`opening` のまま）。部屋の右上の「設定」で設定の紙を開き、
// クリック・キーボードで吊り下げのカードを開閉でき、選ぶと既定を書くコマンドが流れることを確かめる。
//
// 値が変わったかどうかは `waitForEvent` の回数ではなく `<select>` の value を見て判定する。

const ELAPSED_MS = 60_000

test.describe("新しいセッションの既定のモデル・effort の操作子", () => {
  test("設定の紙で、クリックで吊り下げのカードが開き、↓ と Enter で選ぶと既定のモデルが変わり、Esc で閉じる", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "run-setting-model-selected",
      scene: "none",
      viewport: "wide",
      domRoots: [],
    })

    await room.page
      .locator('[data-region="room-tools"]')
      .getByRole("link", { name: "設定", exact: true })
      .click()
    const combobox = room.page.getByRole("combobox", { name: "新しいセッションの既定のモデル" })
    await combobox.click()
    await room.page.getByRole("option", { name: "Sonnet" }).waitFor()
    await room.page.keyboard.press("ArrowDown")
    await room.page.keyboard.press("Enter")

    await expect
      .poll(() =>
        combobox.evaluate((element) => (element instanceof HTMLSelectElement ? element.value : "")),
      )
      .toBe("sonnet")

    await combobox.click()
    await room.page.getByRole("option", { name: "Fable" }).waitFor()
    await room.page.keyboard.press("Escape")
    await expect
      .poll(() => room.page.getByRole("option", { name: "Fable" }).isVisible())
      .toBe(false)

    await room.settleAndMatchPickedWithMessages(ELAPSED_MS)
  })
})
