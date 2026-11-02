import { expect, test, VIEWPORTS } from "./room-fixture.ts"

// モデル・effort・許可モードの操作子（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面は名指しせず（`opening` のまま）。広いビューポートのサイドバー下端と、中くらいのビューポート幅の柱の両方で、
// クリック・キーボードで吊り下げのカードを開閉でき、選ぶと `session.setModel` 等のコマンドが流れることを確かめる。
//
// 値が変わったかどうかは `waitForEvent` の回数ではなく `<select>` の value を見て判定する
// （`opening` の最初の一巡でも `session-info` が1回流れるため、回数を数える待ちは数えズレる）。

const ELAPSED_MS = 60_000

test.describe("モデル・effort・許可モードの操作子", () => {
  test("広いビューポートのサイドバー下端で、クリックで吊り下げのカードが開き、選ぶと session.setModel が流れ、Esc で閉じる", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "run-setting-model-selected",
      scene: "none",
      viewport: "wide",
      domRoots: ["sidebar"],
    })

    const combobox = room.page.getByRole("combobox", { name: /^モデル /u })
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

    await room.resize(VIEWPORTS.medium)
    const effort = room.page.getByRole("combobox", { name: /^effort /u })
    const effortBox = await effort.boundingBox()
    await effort.click()
    const option = room.page.getByRole("option", { name: "High", exact: true })
    await option.waitFor()
    const optionBox = await option.boundingBox()

    // 柱では吊り下げのカードを横へ吊る（決まっていること）。右端の柱ではビューポートの外へ出ないよう左右どちらかへ
    // 寄るので、縦に重ねて下へ積まれていないことだけを見る。
    expect(effortBox).not.toBeNull()
    expect(optionBox).not.toBeNull()
    if (effortBox !== null && optionBox !== null) {
      const hangsToSide =
        optionBox.x + optionBox.width <= effortBox.x || optionBox.x >= effortBox.x + effortBox.width
      expect(hangsToSide).toBe(true)
    }

    await option.click()
    await expect
      .poll(() =>
        effort.evaluate((element) => (element instanceof HTMLSelectElement ? element.value : "")),
      )
      .toBe("high")
  })
})
