import { expect, test, VIEWPORTS } from "./room-fixture.ts"

// モデル・effort・許可モードの札（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面は名指しせず（`opening` のまま）。広いビューポートの入力欄の下の行で、
// クリック・キーボードで吊り下げのカードを開閉でき、選ぶと `session.setModel` 等のコマンドが流れることを確かめる。
// 中くらいのビューポート幅でも札は入力欄の1か所だけで、柱には出ない。
//
// 値が変わったかどうかは `waitForEvent` の回数ではなく `<select>` の value を見て判定する
// （`opening` の最初の一巡でも `session-info` が1回流れるため、回数を数える待ちは数えズレる）。

const ELAPSED_MS = 60_000

test.describe("モデル・effort・許可モードの札", () => {
  test("広いビューポートの入力欄で、クリックで吊り下げのカードが開き、選ぶと session.setModel が流れ、Esc で閉じる", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "run-setting-model-selected",
      scene: "none",
      viewport: "wide",
      domRoots: ["dispatch"],
    })

    const combobox = room.page.getByRole("combobox", { name: /^モデル /u })
    await combobox.click()
    await room.page.getByRole("option", { name: "Sonnet" }).click()

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

    await room.resize(VIEWPORTS.medium)
    await expect(room.page.getByRole("combobox", { name: /^effort /u })).toHaveCount(1)
    const effort = room.page.getByRole("combobox", { name: /^effort /u })
    await effort.click()
    const option = room.page.getByRole("option", { name: "High", exact: true })
    await option.waitFor()
    await option.click()
    await expect
      .poll(() =>
        effort.evaluate((element) => (element instanceof HTMLSelectElement ? element.value : "")),
      )
      .toBe("high")
  })
})
