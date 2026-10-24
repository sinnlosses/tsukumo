// 進み具合の帯の取り方と読み取り。

import type { Locator, Page } from "playwright-core"

/** 長い Bash が、場面の中で何番目の `tool-started` か。 */
export const LONG_TOOL_OCCURRENCE = 4

export function stripOf(page: Page): Locator {
  return page.locator('[data-region="main"] section[aria-label="進み具合"]')
}

export async function phaseStates(strip: Locator): Promise<readonly (string | null)[]> {
  return strip
    .locator("[data-phase-state]")
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-phase-state")))
}
