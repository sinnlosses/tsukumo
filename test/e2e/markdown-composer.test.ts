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
      domRoots: ["dispatch"],
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
      domRoots: ["dispatch"],
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
      domRoots: ["dispatch"],
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

  it("書式のボタンは選んだ範囲を記号で囲み、行の書式は行頭に付ける", async () => {
    const room = await run.open({
      scenario: "markdown-composer-format",
      scene: "none",
      viewport: "wide",
      domRoots: ["dispatch"],
    })
    const { page } = room
    const editor = page.locator(".cm-content")
    await page.getByRole("button", { name: TOGGLE_NAME }).click()
    await editor.click()

    const wraps = [
      ["太字", "**架空**"],
      ["斜体", "*架空*"],
      ["取り消し線", "~~架空~~"],
      ["コード", "`架空`"],
    ] as const
    for (const [name, expected] of wraps) {
      await page.keyboard.type("架空")
      await page.keyboard.press("Shift+Home")
      await page.getByRole("button", { name }).click()
      expect(await editor.innerText()).toBe(expected)
      await page.keyboard.press("ControlOrMeta+a")
      await page.keyboard.press("Backspace")
    }

    await page.keyboard.type("架空")
    await page.keyboard.press("Shift+Home")
    await page.getByRole("button", { name: "リンク" }).click()
    expect(await editor.innerText()).toBe("[架空](url)")
    await page.keyboard.type("https://example.test")
    expect(await editor.innerText()).toBe("[架空](https://example.test)")
    await page.keyboard.press("ControlOrMeta+a")
    await page.keyboard.press("Backspace")

    await page.getByRole("button", { name: "リンク" }).click()
    await page.keyboard.type("架空")
    expect(await editor.innerText()).toBe("[架空]()")
    await page.keyboard.press("ControlOrMeta+a")
    await page.keyboard.press("Backspace")

    await page.keyboard.type("一")
    await page.keyboard.press("Enter")
    await page.keyboard.type("二")
    await page.keyboard.press("ControlOrMeta+a")
    await page.getByRole("button", { name: "箇条書き" }).click()
    expect(await editor.innerText()).toBe("- 一\n- 二")
    await page.getByRole("button", { name: "引用" }).click()
    expect(await editor.innerText()).toBe("> - 一\n> - 二")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("範囲を選んで URL を貼るとリンクになる", async () => {
    const room = await run.open({
      scenario: "markdown-composer-link-paste",
      scene: "none",
      viewport: "wide",
      domRoots: ["dispatch"],
    })
    const { page } = room
    const editor = page.locator(".cm-content")
    const paste = (text: string): Promise<void> =>
      editor.evaluate((element, pasted) => {
        const data = new DataTransfer()
        data.setData("text/plain", pasted)
        element.dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
        )
      }, text)
    await page.getByRole("button", { name: TOGGLE_NAME }).click()
    await editor.click()

    await page.keyboard.type("架空")
    await page.keyboard.press("Shift+Home")
    await paste("https://example.test/a")
    expect(await editor.innerText()).toBe("[架空](https://example.test/a)")
  })

  it("キャレットの無い行は記号が隠れ、キャレットを入れた行では出る", async () => {
    const room = await run.open({
      scenario: "markdown-composer-conceal",
      scene: "none",
      viewport: "wide",
      domRoots: ["dispatch"],
    })
    const { page } = room
    const lines = page.locator(".cm-line")
    await page.locator("textarea").fill(CONCEALED_DRAFT.join("\n"))
    await page.getByRole("button", { name: TOGGLE_NAME }).click()

    expect(await lines.allTextContents()).toEqual(CONCEALED_LINES)
    expect(await lines.nth(1).locator('[title="https://example.test"]').textContent()).toBe(
      "リンク",
    )

    await page.locator(".cm-content").click()
    await page.keyboard.press("ControlOrMeta+Home")
    expect(await lines.allTextContents()).toEqual(revealedAt(0))
    await page.keyboard.press("ArrowDown")
    expect(await lines.allTextContents()).toEqual(revealedAt(1))
    for (const _ of [2, 3, 4, 5]) {
      await page.keyboard.press("ArrowDown")
    }
    expect(await lines.allTextContents()).toEqual(
      CONCEALED_LINES.map((line, index) =>
        index >= 4 && index <= 6 ? (CONCEALED_DRAFT[index] ?? "") : line,
      ),
    )
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

/** `index` の行にキャレットを入れたときに見える字。 */
function revealedAt(index: number): readonly string[] {
  return CONCEALED_LINES.map((line, at) => (at === index ? (CONCEALED_DRAFT[at] ?? "") : line))
}
