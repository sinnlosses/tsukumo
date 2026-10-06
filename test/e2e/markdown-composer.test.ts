import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 入力欄のマークダウンエディタ（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面は名指しせず（`opening` のまま）、道具の行のボタンで面を切り替える。
// 下書きが2つの面の間で引き継がれること・エディタでも `/` の補完が Enter で確定すること・
// エディタで Enter が改行・Command+Enter が送信になること・日本語の変換の確定を、DOM の構造とメッセージの列で確かめる。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

const TOGGLE_NAME = "マークダウンエディタで書く"

describe("入力欄のマークダウンエディタ", () => {
  it("切り替えても下書きは1つのまま、`/` の補完は Enter で確定だけし、Enter は改行、Command+Enter で送ると prompt が流れる", async () => {
    const room = await run.open({
      scenario: "markdown-composer-send",
      scene: "none",
      viewport: "wide",
      domRoots: ["dispatch"],
    })
    const { page } = room
    const toggle = page.getByRole("button", { name: TOGGLE_NAME })
    const editor = page.locator(".cm-content")

    await toggle.click()
    await editor.click()
    await page.keyboard.type("/c")
    await page.getByText("/compact", { exact: true }).waitFor()
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    expect(await editor.innerText()).toBe("/compact ")

    await page.keyboard.press("ControlOrMeta+a")
    await page.keyboard.type("## 架空の依頼")
    await page.keyboard.press("Enter")
    await page.keyboard.type("エディタから送る場面を見たい")
    await toggle.click()
    expect(await page.locator("textarea").inputValue()).toBe(
      "## 架空の依頼\nエディタから送る場面を見たい",
    )

    await toggle.click()
    expect(await editor.innerText()).toBe("架空の依頼\nエディタから送る場面を見たい")
    await editor.click()
    await page.keyboard.press("Meta+Enter")

    await room.waitForEvent("request")
    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("隠れた記号を含む行とその隣で、日本語の変換を確定しても文面が壊れない", async () => {
    const room = await run.open({
      scenario: "markdown-composer-ime",
      scene: "none",
      viewport: "wide",
      domRoots: ["dispatch"],
    })
    const { page } = room
    const lines = page.locator(".cm-line")
    const toggle = page.getByRole("button", { name: TOGGLE_NAME })
    const cdp = await page.context().newCDPSession(page)
    const compose = async (): Promise<void> => {
      for (const reading of ["に", "にほ", "にほん"]) {
        await cdp.send("Input.imeSetComposition", {
          text: reading,
          selectionStart: reading.length,
          selectionEnd: reading.length,
        })
      }
      expect(await lines.count()).toBe(CONCEALED_DRAFT.length)
      await cdp.send("Input.insertText", { text: "日本" })
    }
    await page.locator("textarea").fill(CONCEALED_DRAFT.join("\n"))
    await toggle.click()
    await page.locator(".cm-content").click()

    await page.keyboard.press("ControlOrMeta+Home")
    await page.keyboard.press("End")
    await compose()
    expect(await lines.nth(0).textContent()).toBe("# 架空の見出し日本")

    await page.keyboard.press("ControlOrMeta+Home")
    for (const _ of [1, 2, 3]) {
      await page.keyboard.press("ArrowDown")
    }
    await page.keyboard.press("End")
    await compose()
    expect(await lines.allTextContents()).toEqual([
      "架空の見出し日本",
      ...CONCEALED_LINES.slice(1, 3),
      "- 架空の箇条日本",
      ...CONCEALED_LINES.slice(4),
    ])

    await page.keyboard.press("ControlOrMeta+Home")
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Home")
    for (const _ of [1, 2, 3, 4]) {
      await page.keyboard.press("ArrowRight")
    }
    await compose()
    await toggle.click()

    expect(await page.locator("textarea").inputValue()).toBe(
      [
        "# 架空の見出し日本",
        CONCEALED_DRAFT[1]?.replace("**太字**", "**太字日本**"),
        CONCEALED_DRAFT[2],
        "- 架空の箇条日本",
        ...CONCEALED_DRAFT.slice(4),
      ].join("\n"),
    )
  })
})

/** 隠す記号をひととおり含む下書き。キャレットは末尾の行に置いたまま切り替える。 */
const CONCEALED_DRAFT = [
  "# 架空の見出し",
  "**太字** *斜体* ~~取り消し~~ `コード` [リンク](https://example.test)",
  "> 架空の引用",
  "- 架空の箇条",
  "```ts",
  "架空のコード",
  "```",
  "末尾",
] as const

/** `CONCEALED_DRAFT` の、キャレットが末尾の行にあるときに見える字。 */
const CONCEALED_LINES = [
  "架空の見出し",
  "太字 斜体 取り消し コード リンク",
  "架空の引用",
  "• 架空の箇条",
  "",
  "架空のコード",
  "",
  "末尾",
] as const
