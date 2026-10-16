import type { Locator, Page } from "playwright-core"
import { describe, expect, it } from "vitest"

import { expectReadable } from "./readability-scan.ts"
import { useScenarioRun } from "./scenario-run.ts"

// 進み具合の帯（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面 `work-strip-running` は1つ目の手順のあと間を空け、4つ目の手順（長い Bash）が十数秒走るので、そこで撮る。
// `work-strip-ask`・`work-strip-question` は答え待ちが届いたまま 20 秒止まる。
// `work-strip-long-report-quick` は `turn-finished` まで流す。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

/** 長い Bash が、場面の中で何番目の `tool-started` か。 */
const LONG_TOOL_OCCURRENCE = 4

describe("進み具合の帯", () => {
  it("段が進む・ツールが走るたびに書き換わり、本文を転がしても動かない", async () => {
    const room = await run.open({
      scenario: "work-strip-running",
      scene: "work-strip-running",
      viewport: "large",
      domRoots: ["main", "dispatch"],
    })
    const strip = stripOf(room.page)

    await expect.poll(() => strip.getAttribute("data-work-strip")).toBe("working")
    await expect
      .poll(() => phaseStates(strip))
      .toEqual(["current", "upcoming", "upcoming", "upcoming"])
    await expect.poll(() => strip.textContent()).toContain("今の形を調べる")
    await expect.poll(() => activityText(strip)).toContain("Read")

    await room.waitForEvent("tool-started", LONG_TOOL_OCCURRENCE)
    await expect.poll(() => phaseStates(strip)).toEqual(["done", "current", "upcoming", "upcoming"])
    await expect.poll(() => strip.textContent()).toContain("集計の関数とスクリプト")
    await expect.poll(() => activityText(strip)).toContain("pnpm exec vitest run /tmp/dummy/metric")

    const topBefore = await topOf(strip)
    await scrollMainToBottom(room.page)
    expect(await topOf(strip)).toBe(topBefore)

    await room.settleAndMatch(ELAPSED_MS)

    await room.page.getByRole("button", { name: /手順/ }).waitFor()
    await expectReadable(room.page)
  })

  it("済んだ段の丸を押すと吹き出しが出て、「この段の手順へ」で依頼の手順の一覧が開く", async () => {
    const room = await run.open({
      scenario: "work-strip-phase-popover",
      scene: "work-strip-running",
      viewport: "large",
      domRoots: ["main"],
    })
    const strip = stripOf(room.page)
    await room.waitForEvent("tool-started", LONG_TOOL_OCCURRENCE)
    await expect.poll(() => phaseStates(strip)).toEqual(["done", "current", "upcoming", "upcoming"])

    await strip.getByRole("button", { name: /今の形を調べる/ }).click()
    const popover = strip.getByRole("dialog")
    await popover.waitFor()
    expect(await popover.textContent()).toContain("済み · 所要")
    await popover.getByRole("button", { name: "この段の手順へ" }).click()

    await strip.getByRole("region", { name: "依頼の手順" }).waitFor()
    expect(await strip.getByRole("dialog").count()).toBe(0)
  })

  it("1024x768 で許可の答え待ちが届くと、今の段の丸が答え待ちになり、2行目が何を待っているかを言い、札の口は覆われない", async () => {
    const room = await run.open({
      scenario: "work-strip-ask-medium",
      scene: "work-strip-ask",
      viewport: "medium",
      domRoots: ["main", "dispatch"],
    })
    const strip = stripOf(room.page)

    await expect.poll(() => phaseStates(strip)).toEqual(["done", "asking"])
    await expect
      .poll(() => activityText(strip))
      .toContain("お伺いが届いた · 許可: Bash  rm -rf /tmp/dummy/fake-home")
    const inquiry = room.page.getByRole("region", { name: "お伺い" })
    for (const name of ["許可", "拒否"]) {
      await expectUncovered(inquiry.getByRole("radio", { name }))
    }
    await expectUncovered(inquiry.getByRole("button", { name: /これで答える/ }))

    await room.settleAndMatch(ELAPSED_MS)
  })

  it("1024x768 でも、質問の選択肢と「次へ」は帯にも札にも覆われない", async () => {
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

  it("長いレポートの末尾まで転がすと、最後の段落は帯に覆われない", async () => {
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

function stripOf(page: Page): Locator {
  return page.locator('[data-region="main"] section[aria-label="進み具合"]')
}

async function phaseStates(strip: Locator): Promise<readonly (string | null)[]> {
  return strip
    .locator("[data-phase-state]")
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-phase-state")))
}

async function activityText(strip: Locator): Promise<string> {
  return (await strip.locator("p").first().textContent()) ?? ""
}

async function topOf(locator: Locator): Promise<number> {
  return locator.evaluate((element) => element.getBoundingClientRect().top)
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
