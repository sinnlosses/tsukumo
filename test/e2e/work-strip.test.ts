import type { Locator, Page } from "playwright-core"
import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 進み具合の帯（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面 `work-strip-running` は1つ目の手順のあと間を空け、4つ目の手順（長い Bash）が 20 秒走るので、そこで撮る。
// `work-strip-ask`・`work-strip-question`・`work-strip-retry` は答え待ち・再試行が届いたまま 20 秒止まる。
// `work-plan-quick`・`work-strip-long-report-quick` は `turn-finished` まで流す。
// `work-strip-delegate-return` は3つ目の返却のあとの長い Bash が 20 秒走るので、そこで撮る。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

/** 長い Bash が、場面の中で何番目の `tool-started` か。 */
const LONG_TOOL_OCCURRENCE = 4

/** 場面 `work-strip-delegate-return` で、計画の返却のあとの委譲先の `SendMessage` が何番目の `tool-started` か。 */
const DELEGATE_MESSAGE_OCCURRENCE = 3

/** 場面 `work-strip-delegate-return` で、止めた返却が何番目の `tool-started` か。 */
const STOPPED_RETURN_OCCURRENCE = 5

/** 場面 `work-strip-delegate-return` で、3つ目の返却のあとに委譲先が走らせる長い Bash が何番目の `tool-started` か。 */
const DELEGATE_LONG_TOOL_OCCURRENCE = 7

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
    expect(await strip.textContent()).toContain("今の形を調べる")
    expect(await activityText(strip)).toContain("Read")

    await room.waitForEvent("tool-started", LONG_TOOL_OCCURRENCE)
    await expect.poll(() => phaseStates(strip)).toEqual(["done", "current", "upcoming", "upcoming"])
    expect(await strip.textContent()).toContain("集計の関数とスクリプト")
    await expect.poll(() => activityText(strip)).toContain("pnpm exec vitest run /tmp/dummy/metric")

    const topBefore = await topOf(strip)
    await scrollMainToBottom(room.page)
    expect(await topOf(strip)).toBe(topBefore)

    await room.settleAndMatch(ELAPSED_MS)
  })

  it("「手順 n」を押すと段ごとに区切った一覧が帯の下に開き、もう一度押すと閉じる", async () => {
    const room = await run.open({
      scenario: "work-strip-steps",
      scene: "work-strip-running",
      viewport: "large",
      domRoots: ["main"],
    })
    await room.waitForEvent("tool-started", LONG_TOOL_OCCURRENCE)
    const strip = stripOf(room.page)
    const toggle = strip.getByRole("button", { name: /^手順 4/ })

    await toggle.click()
    expect(await toggle.getAttribute("aria-expanded")).toBe("true")
    const list = strip.getByRole("region", { name: "依頼の手順" })
    expect(await list.textContent()).toContain("1/4 今の形を調べる")
    expect(await list.textContent()).toContain("2/4 集計の関数とスクリプト")
    expect(await list.textContent()).toContain("失敗")

    await toggle.click()
    expect(await toggle.getAttribute("aria-expanded")).toBe("false")
    expect(await list.count()).toBe(0)
  })

  it.each(["large", "medium"] as const)(
    "許可の答え待ちが届くと、今の段の丸が答え待ちになり、2行目が何を待っているかを言う（%s）",
    async (viewport) => {
      const room = await run.open({
        scenario: `work-strip-ask-${viewport}`,
        scene: "work-strip-ask",
        viewport,
        domRoots: ["main", "dispatch"],
      })
      const strip = stripOf(room.page)

      await expect.poll(() => phaseStates(strip)).toEqual(["done", "asking"])
      expect(await activityText(strip)).toContain(
        "お伺いが届いた · 許可: Bash  rm -rf /tmp/dummy/fake-home",
      )
      const inquiry = room.page.getByRole("region", { name: "お伺い" })
      for (const name of ["許可", "拒否"]) {
        await expectUncovered(inquiry.getByRole("radio", { name }))
      }
      await expectUncovered(inquiry.getByRole("button", { name: /これで答える/ }))

      await room.settleAndMatch(ELAPSED_MS)
    },
  )

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

  it("API の再試行は帯の2行目に出て、入力欄の行には経過も再試行も出ない", async () => {
    const room = await run.open({
      scenario: "work-strip-retry",
      scene: "work-strip-retry",
      viewport: "large",
      domRoots: ["main", "dispatch"],
    })
    const strip = stripOf(room.page)

    await expect.poll(() => activityText(strip)).toContain("再試行中 2/10")
    const dispatchText = await room.page.locator('[data-region="dispatch"]').textContent()
    expect(dispatchText).not.toContain("再試行中")
    expect(dispatchText).not.toContain("経過")

    await room.settleAndMatch(ELAPSED_MS)
  })

  it("レポートに入れ替わると帯は済んだ姿の1行で残り、レポートに進み具合を描かない", async () => {
    const room = await run.open({
      scenario: "work-strip-finished",
      scene: "work-plan-quick",
      viewport: "large",
      domRoots: ["main"],
    })
    await room.waitForEvent("turn-finished")
    const strip = stripOf(room.page)

    await expect.poll(() => strip.getAttribute("data-work-strip")).toBe("finished")
    expect(await strip.textContent()).toContain("3段すべて済み")
    expect(
      await room.page.locator('[data-main-view-content="report"]').textContent(),
    ).not.toContain("進み具合")

    await room.settleAndMatch(ELAPSED_MS)
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

  it("委譲先の返却1回ごとに、メインが呼ばなくても帯が1段だけ進み、途中の SendMessage と止めた返却では動かない", async () => {
    const room = await run.open({
      scenario: "work-strip-delegate-return",
      scene: "work-strip-delegate-return",
      viewport: "large",
      domRoots: ["main"],
    })
    const strip = stripOf(room.page)

    await room.waitForEvent("tool-started", DELEGATE_MESSAGE_OCCURRENCE)
    await expect
      .poll(() => phaseStates(strip))
      .toEqual(["done", "current", "upcoming", "upcoming", "upcoming"])
    expect(await strip.textContent()).toContain("2/5")

    await room.waitForEvent("tool-started", STOPPED_RETURN_OCCURRENCE)
    await expect
      .poll(() => phaseStates(strip))
      .toEqual(["done", "done", "current", "upcoming", "upcoming"])
    expect(await strip.textContent()).toContain("3/5")

    await room.waitForEvent("tool-started", DELEGATE_LONG_TOOL_OCCURRENCE)
    await expect
      .poll(() => phaseStates(strip))
      .toEqual(["done", "done", "done", "current", "upcoming"])
    expect(await strip.textContent()).toContain("4/5")

    await room.settleAndMatch(ELAPSED_MS)
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
