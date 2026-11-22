import type { Locator, Page } from "playwright-core"

import { expectReadable } from "./readability-scan.ts"
import { expect, test } from "./room-fixture.ts"
import { LONG_TOOL_OCCURRENCE, nowStatementOf, phaseStates, stripOf } from "./work-strip-probe.ts"

// 進み具合のプログレスバー（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面 `work-strip-running` は1つ目の手順のあと間を空け、4つ目の手順（長い Bash）が十数秒走るので、そこで撮る。
// `work-strip-ask`・`work-strip-question` は答え待ちが届いたまま 20 秒止まる。
// `work-strip-long-report-quick` は `turn-finished` まで流す。

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

test.describe("進み具合のプログレスバー", () => {
  test("フェーズが進む・ツールが走るたびに書き換わり、本文をスクロールしても動かない", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "work-strip-running",
      scene: "work-strip-running",
      viewport: "large",
      domRoots: ["work-strip"],
    })
    const strip = stripOf(room.page)

    await expect.poll(() => strip.getAttribute("data-work-strip")).toBe("working")
    await expect
      .poll(() => phaseStates(strip))
      .toEqual(["current", "upcoming", "upcoming", "upcoming"])
    await expect.poll(() => strip.textContent()).toContain("今の形を調べる")
    await expect.poll(() => nowStatementText(room.page)).toContain("/tmp/dummy/metric")

    await room.waitForEvent("tool-started", LONG_TOOL_OCCURRENCE)
    await expect.poll(() => phaseStates(strip)).toEqual(["done", "current", "upcoming", "upcoming"])
    await expect.poll(() => strip.textContent()).toContain("集計の関数とスクリプト")
    await expect
      .poll(() => nowStatementText(room.page))
      .toMatch(/pnpm exec vitest run\s*\/tmp\/dummy\/metric/u)

    const topBefore = await topOf(strip)
    await scrollMainToBottom(room.page)
    expect(await topOf(strip)).toBe(topBefore)

    await room.settleAndMatchPicked(ELAPSED_MS)

    await room.page.getByRole("button", { name: /手順/ }).waitFor()
    await expectReadable(room.page)
  })

  test("「手順」を押すと全体の詳細が帯の左右の端にそろって重なり、流れの頭の位置と帯の高さは動かず、外を押すと閉じる", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "work-strip-running",
      scene: "work-strip-running",
      viewport: "large",
      domRoots: ["work-strip"],
    })
    const strip = stripOf(room.page)
    await room.waitForEvent("tool-started", LONG_TOOL_OCCURRENCE)
    const flowHead = room.page.locator('[data-region="main"] [class*="request-block"]').first()
    const stripBefore = await boxOf(strip)
    const flowTopBefore = (await boxOf(flowHead)).top

    await strip.getByRole("button", { name: /^手順 \d+件$/ }).click()

    // 面を描く場所は Astryx の層が決めるので、帯の中ではなくページから引く。置き場所は開いて測ってから決まるので、そろうまで待つ。
    const list = room.page.getByRole("region", { name: "依頼の手順" })
    await expect(list).toBeVisible()
    const stripBox = await boxOf(strip)
    await expect
      .poll(async () => {
        const listBox = await boxOf(list)
        return {
          below: listBox.top > stripBox.bottom,
          left: Math.abs(listBox.left - stripBox.left) <= 1,
          right: Math.abs(listBox.right - stripBox.right) <= 1,
        }
      })
      .toEqual({ below: true, left: true, right: true })
    expect(stripBox.height).toBe(stripBefore.height)
    expect((await boxOf(flowHead)).top).toBe(flowTopBefore)

    await room.page.mouse.click(stripBox.left + stripBox.width / 2, stripBox.bottom + 400)
    await expect(list).toHaveCount(0)
  })

  test("1000x800 でも、いまの手順の一文は対象の頭だけが縮み、最後の語と秒が右端で切れない", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "work-strip-running",
      scene: "work-strip-running",
      viewport: "large",
      domRoots: ["work-strip"],
    })
    await room.waitForEvent("tool-started", LONG_TOOL_OCCURRENCE)
    await expect
      .poll(() => nowStatementText(room.page))
      .toMatch(/pnpm exec vitest run\s*\/tmp\/dummy\/metric/u)
    await room.resize({ width: 1000, height: 800 })

    await expect.poll(() => clippedTextOf(nowStatementOf(room.page))).toEqual([])
  })

  test("状態が作業中からバックグラウンドで作業中に替わっても、下線の区間の並びの左端は動かず、今の区間の線は伸び続ける", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "work-strip-background",
      scene: "work-strip-background",
      viewport: "large",
      domRoots: ["work-strip"],
    })
    const strip = stripOf(room.page)
    const track = strip.locator("ol").first()

    await expect.poll(() => strip.getAttribute("data-work-strip")).toBe("working")
    await expect.poll(() => phaseStates(strip)).toEqual(["done", "current", "upcoming"])
    const workingLeft = await leftOf(track)

    await room.waitForEvent("turn-finished")
    await expect
      .poll(() => strip.locator("[data-result]").getAttribute("data-result"))
      .toBe("background")
    expect(await leftOf(track)).toBe(workingLeft)

    await room.page.emulateMedia({ reducedMotion: "no-preference" })
    await expect.poll(() => currentLineAnimationOf(strip)).toContain("work-strip-segment-fill")
  })

  test("1024x768 で許可の答え待ちが届くと、今の区間が答え待ちになり、一文は無く、札の口は覆われない", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "work-strip-ask-medium",
      scene: "work-strip-ask",
      viewport: "medium",
      domRoots: ["work-strip"],
    })
    const strip = stripOf(room.page)

    await expect.poll(() => phaseStates(strip)).toEqual(["done", "asking"])
    await expect(nowStatementOf(room.page)).toHaveCount(0)
    const inquiry = room.page.getByRole("region", { name: "お伺い" })
    for (const name of ["許可", "拒否"]) {
      await expectUncovered(inquiry.getByRole("radio", { name }))
    }
    await expectUncovered(inquiry.getByRole("button", { name: /これで答える/ }))

    await room.settleAndMatchPicked(ELAPSED_MS)
  })

  test("1024x768 でも、質問の選択肢と「次へ」は帯にも札にも覆われない", async ({ run }) => {
    const room = await run.open({
      scenario: "work-strip-question",
      scene: "work-strip-question",
      viewport: "medium",
      domRoots: ["main"],
    })
    const main = room.page.locator('[data-region="main"]')

    await expect.poll(() => phaseStates(stripOf(room.page))).toEqual(["done", "asking", "upcoming"])
    const options = main.locator("label:has(input[type=radio])")
    expect(await options.count()).toBe(3)
    for (const option of await options.all()) {
      await expectUncovered(option)
    }
    await expectUncovered(main.getByRole("button", { name: "次へ", exact: true }))
  })

  test("長いレポートの末尾まで転がすと、最後の段落は帯に覆われない", async ({ run }) => {
    const room = await run.open({
      scenario: "work-strip-long-report",
      scene: "work-strip-long-report-quick",
      viewport: "medium",
      domRoots: ["main"],
    })
    await room.waitForEvent("turn-finished")
    await expect.poll(() => stripOf(room.page).getAttribute("data-work-strip")).toBe("finished")

    await scrollMainToBottom(room.page)
    await expectUncovered(
      room.page.locator('[data-region="main"] p', { hasText: "これが本文の最後の段落" }),
    )
  })
})

async function nowStatementText(page: Page): Promise<string> {
  return (await nowStatementOf(page).textContent()) ?? ""
}

/**
 * 一文の中で、右端が一文の器からはみ出している字の塊。
 * 頭の字と添え書き（「…」で縮める塊）は除き、残り（最後の語・つなぎ・動詞・秒）を測る。
 */
async function clippedTextOf(now: Locator): Promise<readonly string[]> {
  return now.evaluate((container) => {
    const sentence = container.lastElementChild
    if (sentence === null) return ["(一文なし)"]
    const limit = container.getBoundingClientRect().right + 0.5
    const leaves = [...sentence.querySelectorAll("span")].filter(
      (span) => span.children.length === 0,
    )
    const fixed = leaves.filter((span) => getComputedStyle(span).textOverflow !== "ellipsis")
    return fixed
      .filter((span) => span.getBoundingClientRect().right > limit)
      .map((span) => span.textContent ?? "")
  })
}

async function topOf(locator: Locator): Promise<number> {
  return locator.evaluate((element) => element.getBoundingClientRect().top)
}

async function leftOf(locator: Locator): Promise<number> {
  return locator.evaluate((element) => element.getBoundingClientRect().left)
}

async function boxOf(locator: Locator): Promise<{
  top: number
  bottom: number
  right: number
  height: number
  width: number
  left: number
}> {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return {
      top: box.top,
      bottom: box.bottom,
      right: box.right,
      left: box.left,
      height: box.height,
      width: box.width,
    }
  })
}

/** 今の区間の線の上を伸びる線（`::after`）の動きの名前。動いていなければ "none"。 */
async function currentLineAnimationOf(strip: Locator): Promise<string> {
  return strip
    .locator("[data-segment-state='current'] > span")
    .first()
    .evaluate((line) => getComputedStyle(line, "::after").animationName)
}

async function scrollMainToBottom(page: Page): Promise<void> {
  await page.locator('[data-region="main"]').evaluate((region) => {
    region.scrollTop = region.scrollHeight
  })
}

/** 要素を見える位置へ転がしたあと、中心の点で当たる要素がその要素の中にある（帯にも札にも覆われていない）。 */
async function expectUncovered(locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded()
  const hit = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const found = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return found !== null && element.contains(found)
  })
  expect(hit).toBe(true)
}
