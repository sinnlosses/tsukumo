import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 入力欄のマークダウンエディタ（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面は名指しせず（`opening` のまま）、道具の行のボタンで面を切り替える。
// 下書きが2つの面の間で引き継がれること・エディタで Enter が改行・Command+Enter が送信になること・
// エディタでも `/` の補完が Enter で確定することを、DOM の構造とメッセージの列で確かめる。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

const TOGGLE_NAME = "マークダウンエディタで書く"

describe("入力欄のマークダウンエディタ", () => {
  it("切り替えても下書きは1つのまま、行き来した両方の面に同じ文面が出る", async () => {
    const room = await run.open({
      scenario: "markdown-composer-switch",
      scene: "none",
      viewport: "wide",
    })
    const toggle = room.page.getByRole("button", { name: TOGGLE_NAME })

    await room.page.locator("textarea").fill("# 架空の見出し")
    await toggle.click()
    const editor = room.page.locator(".cm-content")
    expect(await editor.innerText()).toBe("# 架空の見出し")

    await editor.click()
    await room.page.keyboard.press("End")
    await room.page.keyboard.press("Enter")
    await room.page.keyboard.type("**架空の太字**")
    await toggle.click()

    expect(await room.page.locator("textarea").inputValue()).toBe("# 架空の見出し\n**架空の太字**")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("エディタで Enter は改行、Command+Enter で送ると prompt が流れる", async () => {
    const room = await run.open({
      scenario: "markdown-composer-send",
      scene: "none",
      viewport: "wide",
    })

    await room.page.getByRole("button", { name: TOGGLE_NAME }).click()
    await room.page.locator(".cm-content").click()
    await room.page.keyboard.type("## 架空の依頼")
    await room.page.keyboard.press("Enter")
    await room.page.keyboard.type("エディタから送る場面を見たい")
    await room.page.keyboard.press("Meta+Enter")

    await room.waitForEvent("request")
    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("エディタでも `/` の補完が出て、Enter で確定だけする", async () => {
    const room = await run.open({
      scenario: "markdown-composer-suggestion",
      scene: "none",
      viewport: "wide",
    })

    await room.page.getByRole("button", { name: TOGGLE_NAME }).click()
    await room.page.locator(".cm-content").click()
    await room.page.keyboard.type("/c")
    await room.page.getByText("/compact", { exact: true }).waitFor()
    await room.page.keyboard.press("ArrowDown")
    await room.page.keyboard.press("Enter")

    expect(await room.page.locator(".cm-content").innerText()).toBe("/compact ")
    await room.settleAndMatch(ELAPSED_MS)
  })
})
