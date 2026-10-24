import type { Page } from "playwright-core"
import { expect } from "vitest"

import type { ScenarioOptions } from "./scenario-run.ts"

// レポートの本文の塊どうしのあきが、縦の格子 13px の倍数であること
// （docs/architecture/screen-design.md「レポートの塊のあき」）。寸法は実ブラウザでしか確かめられない。
// 期待値は撮らず、外れた隣り合う2つの塊の名前とあきを差分に出す。

/** 縦の格子の単位（px）。`--report-block-gap` と同じ値。 */
const GRID_PX = 13

/** 副画素の丸めで1px 未満はずれうる。 */
const TOLERANCE_PX = 0.6

/** 結論の見出し（h4）。その親の要素が、レポートの本文の塊を並べる。 */
const BODY_SELECTOR = '[data-main-view-content="report"] article h4'

type Gap = { readonly between: string; readonly gap: number }

export function spacingScenario(scene: string): ScenarioOptions {
  return { scenario: `report-spacing-${scene}`, scene, viewport: "wide", domRoots: [] }
}

/** 本文の隣り合う塊のあきがすべて格子に乗ることを確かめる。 */
export async function expectBlockGapsOnGrid(page: Page): Promise<void> {
  await page.locator(BODY_SELECTOR).first().waitFor()

  const gaps = await page.evaluate((selector): readonly Gap[] => {
    const body = document.querySelector(selector)?.parentElement ?? null
    if (body === null) {
      return []
    }
    const blocks = [...body.children]
    return blocks.slice(1).map((block, index) => {
      const previous = blocks[index]
      const label = (element: Element | undefined): string =>
        element === undefined ? "" : `${element.tagName.toLowerCase()}`
      return {
        between: `${index}:${label(previous)} → ${index + 1}:${label(block)}`,
        gap: block.getBoundingClientRect().top - (previous?.getBoundingClientRect().bottom ?? 0),
      }
    })
  }, BODY_SELECTOR)

  const offGrid = gaps
    .filter(({ gap }) => {
      const remainder = ((gap % GRID_PX) + GRID_PX) % GRID_PX
      return gap < -TOLERANCE_PX || Math.min(remainder, GRID_PX - remainder) > TOLERANCE_PX
    })
    .map(({ between, gap }) => `${between}: ${gap.toFixed(1)}px`)

  expect(gaps.length).toBeGreaterThan(0)
  expect(offGrid.join("\n")).toBe("")
}
