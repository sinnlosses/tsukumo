import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// モデル・effort・許可モードの操作子（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面は名指しせず（`opening` のまま）。広い窓のサイドバー下端と、中くらいの窓幅の柱の両方で、
// クリック・キーボードで吊り札を開閉でき、選ぶと `session.setModel` 等のコマンドが流れることを確かめる。
//
// 値が変わったかどうかは `waitForEvent` の回数ではなく `<select>` の value を見て判定する
// （`opening` の最初の一巡でも `session-info` が1回流れるため、回数を数える待ちは数えズレる）。

const run = useScenarioRun()

const ELAPSED_MS = 60_000

describe("モデル・effort・許可モードの操作子", () => {
  it("広い窓のサイドバー下端で、クリックで吊り札が開き、選ぶと session.setModel が流れ、Esc で閉じる", async () => {
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

    await room.settleAndMatch(ELAPSED_MS)
  })

  it("中くらいの窓幅の柱でも、クリックで吊り札が開き、選ぶと session.setEffort が流れる", async () => {
    const room = await run.open({
      scenario: "run-setting-rail-select",
      scene: "none",
      viewport: "medium",
      domRoots: [],
    })

    const combobox = room.page.getByRole("combobox", { name: /^effort /u })
    const comboboxBox = await combobox.boundingBox()
    await combobox.click()
    const option = room.page.getByRole("option", { name: "High", exact: true })
    await option.waitFor()
    const optionBox = await option.boundingBox()

    // 柱では吊り札を横へ吊る（決まっていること）。右端の柱では窓の外へ出ないよう左右どちらかへ
    // 寄るので、縦に重ねて下へ積まれていないことだけを見る。
    expect(comboboxBox).not.toBeNull()
    expect(optionBox).not.toBeNull()
    if (comboboxBox !== null && optionBox !== null) {
      const hangsToSide =
        optionBox.x + optionBox.width <= comboboxBox.x ||
        optionBox.x >= comboboxBox.x + comboboxBox.width
      expect(hangsToSide).toBe(true)
    }

    await option.click()
    await expect
      .poll(() =>
        combobox.evaluate((element) => (element instanceof HTMLSelectElement ? element.value : "")),
      )
      .toBe("high")

    await room.settleAndMatch(ELAPSED_MS)
  })
})
