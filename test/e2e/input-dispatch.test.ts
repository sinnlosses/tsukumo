import { expect, test } from "./room-fixture.ts"

// 入力欄から送る（docs/architecture/testing.md「E2E のシナリオの一覧」）。場面は名指しせず
// （`opening` のまま）、入力欄に文面を書いて ⌘Enter で送る。送った `prompt` コマンドが
// `request` イベントとして戻り、依頼を受けた疑似セッションの `turns` の先頭（`report`）が
// 続けて流れることを、DOM の構造とメッセージの列で確かめる。

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

test.describe("入力欄から送る", () => {
  test("入力欄に書いて ⌘Enter で送ると prompt が流れ、request が戻って続きの場面が流れる", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "input-dispatch",
      scene: "none",
      viewport: "wide",
      domRoots: ["paper", "dock"],
    })

    const textArea = room.page.locator("textarea")
    await textArea.fill("入力欄から送る場面を見たい（架空の依頼）")
    await textArea.press("Meta+Enter")

    await room.waitForEvent("request")
    await room.waitForEvent("turn-finished")
    await room.settleAndMatchPickedWithMessages(ELAPSED_MS)
  })

  test("Mac では入力欄の行頭の Ctrl+K で探すが開かずに行末まで消え、⌘K では探すが開く", async ({
    run,
  }) => {
    test.skip(process.platform !== "darwin", "Ctrl+K を OS の編集コマンドに写すのは macOS だけ")
    const room = await run.open({
      scenario: "input-dispatch",
      scene: "none",
      viewport: "wide",
      domRoots: [],
    })

    const textArea = room.page.locator("textarea")
    await textArea.fill("行末まで消す場面（架空の依頼）")
    await textArea.focus()
    await room.page.keyboard.press("Home")
    await room.page.keyboard.press("Control+K")

    await expect(textArea).toHaveValue("")
    expect(await room.page.getByRole("combobox", { name: "探す" }).count()).toBe(0)

    await room.page.keyboard.press("Meta+K")
    await expect(room.page.getByRole("combobox", { name: "探す" })).toBeVisible()
  })

  test("渡すの姿勢で入力欄から Esc で出て / を押すと、入力欄にフォーカスが戻り、下書きは空のまま", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "input-dispatch",
      scene: "none",
      viewport: "wide",
      domRoots: [],
    })

    const textArea = room.page.locator("textarea")
    await textArea.focus()
    await room.page.keyboard.press("Escape")
    await expect(textArea).not.toBeFocused()

    await room.page.keyboard.press("/")

    await expect(textArea).toBeFocused()
    await expect(textArea).toHaveValue("")
  })

  test("入力欄に打っている最中に Esc を押すと、フォーカスが入力欄から外れる", async ({ run }) => {
    const room = await run.open({
      scenario: "input-dispatch",
      scene: "none",
      viewport: "wide",
      domRoots: [],
    })

    const textArea = room.page.locator("textarea")
    await textArea.fill("Esc で外す場面を見たい（架空の依頼）")
    await textArea.focus()
    await room.page.keyboard.press("Escape")

    await expect
      .poll(() => room.page.evaluate(() => document.activeElement?.tagName === "TEXTAREA"))
      .toBe(false)
  })
})
