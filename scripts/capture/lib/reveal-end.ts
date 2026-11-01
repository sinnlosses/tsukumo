// 書き上げの演出（`data-revealing`）が終わるのを待つ。

import { expect } from "@playwright/test"
import type { Page } from "playwright-core"

/** 書き上げの演出が終わるのを待つ上限（ミリ秒）。既定の速さで長いレポートが約10秒かかる実測の3倍。 */
const REVEAL_END_TIMEOUT_MS = 30_000

/**
 * 書き上げの演出（`data-revealing`）が消えるのを待つ。上限までに消えなくても throw せず進む
 * （上限を超えて演出が続くときは、続く静止の待ちが落とす）。
 */
export async function waitForRevealEnd(
  page: Pick<Page, "locator">,
  timeoutMs: number = REVEAL_END_TIMEOUT_MS,
): Promise<void> {
  await expect(page.locator("[data-revealing]"))
    .toHaveCount(0, { timeout: timeoutMs })
    .catch(() => undefined)
}
