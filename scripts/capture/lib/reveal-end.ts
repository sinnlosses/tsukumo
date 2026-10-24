// 書き上げの演出（`data-revealing`）が終わるのを待つ。

/** 書き上げの演出が終わるのを待つ上限（ミリ秒）。既定の速さで長いレポートが約10秒かかる実測の3倍。 */
const REVEAL_END_TIMEOUT_MS = 30_000

/**
 * 書き上げの演出（`data-revealing`）が消えるのを待つ。上限までに消えなくても throw せず進む
 * （上限を超えて演出が続くときは、続く静止の待ちが落とす）。
 */
export async function waitForRevealEnd(
  page: {
    readonly waitForSelector: (
      selector: string,
      options: { readonly state: "detached"; readonly timeout: number },
    ) => Promise<unknown>
  },
  timeoutMs: number = REVEAL_END_TIMEOUT_MS,
): Promise<void> {
  await page
    .waitForSelector("[data-revealing]", { state: "detached", timeout: timeoutMs })
    .catch(() => undefined)
}
