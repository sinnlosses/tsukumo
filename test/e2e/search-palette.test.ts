import type { Page } from "playwright-core"

import { expect, type ScenarioRun, test } from "./room-fixture.ts"
import type { ScenarioRoom } from "./scenario-open.ts"

// 探す（⌘K）の開閉でのフォーカスの戻りと、選んだ行の追従（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面は名指しせず（`none`）、開いた先のフォーカスだけを実ブラウザの `activeElement` で確かめる。

/** 行の矩形と一覧の矩形の比べで許す端数（px）。選ばなかったときのずれは行1つ分（約37px）を超える。 */
const SUBPIXEL = 1

async function openRoom(run: ScenarioRun): Promise<ScenarioRoom> {
  return run.open({
    scenario: "search-palette",
    scene: "none",
    viewport: "wide",
    domRoots: [],
  })
}

function searchField(page: Page) {
  return page.getByRole("combobox", { name: "探す" })
}

test.describe("探す", () => {
  test("入力欄から ⌘K で開いて Esc で閉じると、入力欄にフォーカスが戻る", async ({ run }) => {
    const room = await openRoom(run)
    const textArea = room.page.locator("textarea")
    await textArea.focus()

    await room.page.keyboard.press("ControlOrMeta+K")
    await expect(searchField(room.page)).toBeFocused()
    await room.page.keyboard.press("Escape")

    await expect(searchField(room.page)).toHaveCount(0)
    await expect(textArea).toBeFocused()
  })

  test("サイドバーの検索の入口を押して開き Esc で閉じると、その入口のボタンにフォーカスが戻る", async ({
    run,
  }) => {
    const room = await openRoom(run)
    const entrance = room.page.getByRole("button", { name: /検索/ })

    await entrance.click()
    await expect(searchField(room.page)).toBeFocused()
    await room.page.keyboard.press("Escape")

    await expect(searchField(room.page)).toHaveCount(0)
    await expect(entrance).toBeFocused()
  })

  test("「設定」で絞って Enter で選ぶと、開いた設定の紙の中にフォーカスがある", async ({ run }) => {
    const room = await openRoom(run)
    await room.page.locator("textarea").focus()

    await room.page.keyboard.press("ControlOrMeta+K")
    await searchField(room.page).fill("設定")
    await room.page.keyboard.press("Enter")

    const sheet = room.page.getByRole("dialog", { name: "設定" })
    await expect(sheet).toBeVisible()
    await expect(searchField(room.page)).toHaveCount(0)
    await expect
      .poll(() => sheet.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true)
  })

  test("低い画面で↓と Ctrl+N を最後の行まで押すと、選んだ行がいつも一覧の見える範囲に入る", async ({
    run,
  }) => {
    const room = await openRoom(run)
    await room.page.setViewportSize({ width: 1400, height: 520 })
    await room.page.locator("textarea").focus()
    await room.page.keyboard.press("ControlOrMeta+K")
    const list = room.page.getByRole("listbox", { name: "探す" })
    await expect(list).toBeVisible()
    const rows = list.getByRole("option")
    const count = await rows.count()
    expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)

    const selectedInsideList = async (): Promise<boolean> => {
      const selected = await list.getByRole("option", { selected: true }).boundingBox()
      const box = await list.boundingBox()
      if (selected === null || box === null) {
        return false
      }
      return (
        selected.y >= box.y - SUBPIXEL &&
        selected.y + selected.height <= box.y + box.height + SUBPIXEL
      )
    }
    // 描き直しを待ってから次を押す（待たないと、前の選択を読んだまま次のキーが処理される）
    const pressAndExpectSelected = async (key: string, index: number): Promise<void> => {
      await room.page.keyboard.press(key)
      await expect(rows.nth(index)).toHaveAttribute("aria-selected", "true")
      await expect.poll(selectedInsideList).toBe(true)
    }
    for (let index = 1; index < count; index += 1) {
      await pressAndExpectSelected("ArrowDown", index)
    }
    for (let index = count - 2; index >= 0; index -= 1) {
      await pressAndExpectSelected("ArrowUp", index)
    }
    for (let index = 1; index < count; index += 1) {
      await pressAndExpectSelected("Control+n", index)
    }
    for (let index = count - 2; index >= 0; index -= 1) {
      await pressAndExpectSelected("Control+p", index)
    }
  })
})
