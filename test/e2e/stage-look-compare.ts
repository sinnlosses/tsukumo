// 器の見た目の画（`test/e2e/expected/stage-look-*.png`）を画素で比べる。
// 比べ方の正典は `docs/architecture/testing/e2e-artifact-and-expectation.md`「器の見た目の画」。

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import pixelmatch from "pixelmatch"
import type { Locator, Page } from "playwright-core"
import { PNG } from "pngjs"

import { decodePng } from "../../scripts/capture/lib/png-pixel.ts"
import { describeStillDiff } from "../../scripts/capture/lib/still-diff.ts"
import { OUTPUT_ROOT, UPDATE_EXPECTED } from "./artifact.ts"

/** 画の期待値の名前の頭。この頭の PNG は、場面と幅の組から決まる名前のものだけを置く。 */
export const STAGE_LOOK_PREFIX = "stage-look-"

/** 色の違いを違いと見なす閾値（pixelmatch の `threshold`）。縁のなだらかさの違いは数えない。 */
const COLOR_THRESHOLD = 0.1

/** 通す違った画素の割合の上限。 */
const MAX_DIFF_RATIO = 0.002

/** 続けて撮った2枚が画素で同じになるまで撮る回数の上限。 */
const STILL_ATTEMPTS = 10

const EXPECTED_ROOT = fileURLToPath(new URL("./expected", import.meta.url))

/** 期待値の置き場にある画の名前（`stage-look-` で始まる PNG）。 */
export function expectedStageLookNames(): readonly string[] {
  return readdirSync(EXPECTED_ROOT).filter(
    (name) => name.startsWith(STAGE_LOOK_PREFIX) && name.endsWith(".png"),
  )
}

/**
 * ビューポートを撮り、続けて撮った2枚が画素で同じになったものを返す。
 * 上限まで揃わなければ、最後の2枚の違いを添えて落とす。
 */
export async function stillShot(page: Page, mask: readonly Locator[]): Promise<Buffer> {
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      Array.from(document.images)
        .filter((image) => !image.complete)
        .map(
          (image) =>
            new Promise((resolve) => {
              image.addEventListener("load", resolve, { once: true })
              image.addEventListener("error", resolve, { once: true })
            }),
        ),
    )
  })
  const shoot = (): Promise<Buffer> =>
    page.screenshot({ animations: "disabled", caret: "hide", mask: [...mask] })
  let previous = await shoot()
  for (let attempt = 1; attempt < STILL_ATTEMPTS; attempt++) {
    const next = await shoot()
    if (samePixels(previous, next)) {
      return next
    }
    previous = next
  }
  const last = await shoot()
  throw new Error(
    `${String(STILL_ATTEMPTS)} 回撮っても画が止まらなかった: ${describeStillDiff(previous, last)}`,
  )
}

/**
 * 撮った画を期待値（`expected/<name>`）と画素で比べる。期待値が無ければ落とす。
 * `E2E_UPDATE=1` なら期待値を書き直す。食い違えば差分の画と説明を `failures/` に残して落とす。
 */
export function matchStageLook(name: string, actual: Buffer): void {
  const expectedPath = path.join(EXPECTED_ROOT, name)
  if (UPDATE_EXPECTED) {
    writeFileSync(expectedPath, actual)
    return
  }
  if (!existsSync(expectedPath)) {
    throw new Error(
      `画の期待値が無い: test/e2e/expected/${name}（pnpm run test:e2e:update で撮り、画を目で確かめる）`,
    )
  }
  const expected = readFileSync(expectedPath)
  const a = decodePng(expected)
  const b = decodePng(actual)
  if (a.width !== b.width || a.height !== b.height) {
    const failureDir = recordStageLookFailure(name, expected, actual)
    throw new Error(
      `${name} の大きさが期待値と違う（${describeStillDiff(expected, actual)}）。残した: ${failureDir}`,
    )
  }
  const diff = new PNG({ width: a.width, height: a.height })
  const count = pixelmatch(a.pixels, b.pixels, diff.data, a.width, a.height, {
    threshold: COLOR_THRESHOLD,
    includeAA: false,
  })
  const ratio = count / (a.width * a.height)
  if (ratio <= MAX_DIFF_RATIO) {
    return
  }
  const failureDir = recordStageLookFailure(name, expected, actual, PNG.sync.write(diff))
  throw new Error(
    `${name} が期待値と ${(ratio * 100).toFixed(3)}% 違う（上限 ${String(MAX_DIFF_RATIO * 100)}%）: ${describeStillDiff(expected, actual)}。残した: ${failureDir}`,
  )
}

function samePixels(before: Buffer, after: Buffer): boolean {
  if (before.equals(after)) {
    return true
  }
  const a = decodePng(before)
  const b = decodePng(after)
  return (
    a.width === b.width &&
    a.height === b.height &&
    Buffer.from(a.pixels).equals(Buffer.from(b.pixels))
  )
}

function recordStageLookFailure(
  name: string,
  expected: Buffer,
  actual: Buffer,
  diff?: Buffer,
): string {
  const stamp = Temporal.Now.instant().toString().replaceAll(":", "-")
  const failureDir = path.join(OUTPUT_ROOT, "failures", name.replace(/\.png$/, ""), stamp)
  mkdirSync(failureDir, { recursive: true })
  writeFileSync(path.join(failureDir, "expected.png"), expected)
  writeFileSync(path.join(failureDir, "actual.png"), actual)
  if (diff !== undefined) {
    writeFileSync(path.join(failureDir, "diff.png"), diff)
  }
  writeFileSync(
    path.join(failureDir, "diff.txt"),
    `${describeStillDiff(expected, actual)}\n`,
    "utf8",
  )
  return failureDir
}
