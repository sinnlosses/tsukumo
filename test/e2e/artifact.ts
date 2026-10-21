// E2E の成果物。DOM とメッセージの列を書き、期待値と比べ、食い違った回を残す。
// 形の正典は `docs/architecture/testing.md`「E2E の成果物と再現」。

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { expect } from "vitest"

/** 走らせた結果とスクリーンショットの置き場（リポジトリの外。毎回書き直す）。 */
export const OUTPUT_ROOT = "/tmp/tsukumo-e2e"

export const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "")

export type ArtifactKind = "dom" | "messages"

/**
 * 成果物を書き、書いた文字列を返す。書く前に置き換え（絶対パス・トークン・ポート）を通す。
 */
export function writeArtifact(
  scenario: string,
  kind: ArtifactKind,
  value: unknown,
  replacements: readonly (readonly [string, string])[],
  outDir: string,
): string {
  const text = `${replaceAll(JSON.stringify(value, undefined, 2), replacements)}\n`
  writeFileSync(path.join(outDir, `${scenario}.${kind}.json`), text, "utf8")
  return text
}

/**
 * 書いた成果物を期待値と比べる。期待値が無ければ落とす（黙って書かない）。
 * `E2E_UPDATE=1` なら期待値を書き直す。
 */
export function matchArtifact(
  scenario: string,
  kind: ArtifactKind,
  text: string,
  outDir: string,
): void {
  const fileName = `${scenario}.${kind}.json`
  const expectedPath = path.join(EXPECTED_ROOT, fileName)
  if (UPDATE_EXPECTED) {
    mkdirSync(EXPECTED_ROOT, { recursive: true })
    writeFileSync(expectedPath, text, "utf8")
    return
  }
  if (!existsSync(expectedPath)) {
    throw new Error(
      `期待値が無い: ${path.relative(REPOSITORY_ROOT, expectedPath)}（pnpm run test:e2e:update で書き、git diff で中身を確かめる）`,
    )
  }
  const expectedText = readFileSync(expectedPath, "utf8")
  try {
    expect(JSON.parse(text)).toEqual(JSON.parse(expectedText))
  } catch (error) {
    const failureDir = recordFailure(scenario, outDir)
    writeFileSync(path.join(failureDir, `${scenario}.${kind}.expected.json`), expectedText, "utf8")
    writeFileSync(
      path.join(failureDir, `${scenario}.${kind}.diff.txt`),
      lineDiff(expectedText, text),
      "utf8",
    )
    throw new Error(`${kind} が期待値と食い違った。その回の成果物と差分を残した: ${failureDir}`, {
      cause: error,
    })
  }
}

export function assertNoMessagesExpected(scenario: string): void {
  const expectedPath = path.join(EXPECTED_ROOT, `${scenario}.messages.json`)
  if (UPDATE_EXPECTED || !existsSync(expectedPath)) {
    return
  }
  throw new Error(
    `比べないメッセージの列の期待値が残っている: ${path.relative(REPOSITORY_ROOT, expectedPath)}（比べるなら場面で settleAndMatchWithMessages を呼び、比べないなら git rm で消す）`,
  )
}

/** 期待値と食い違った回を、シナリオごとに直近何回まで `failures/` の下へ残すか。 */
const FAILURE_RETENTION_COUNT = 5

/** 期待値の置き場（リポジトリに入れる）。 */
const EXPECTED_ROOT = fileURLToPath(new URL("./expected", import.meta.url))

/** 期待値を書き直すか（`pnpm run test:e2e:update`）。 */
const UPDATE_EXPECTED = process.env["E2E_UPDATE"] === "1"

function replaceAll(text: string, replacements: readonly (readonly [string, string])[]): string {
  return replacements.reduce((current, [from, to]) => current.split(from).join(to), text)
}

/**
 * 期待値と食い違った回の `outDir`（DOM・メッセージの列・スクリーンショット）を、あとで通った
 * 回に上書きされない場所へコピーし、シナリオごとに直近 `FAILURE_RETENTION_COUNT` 回だけ残す。
 */
function recordFailure(scenario: string, outDir: string): string {
  // `outDir`（`OUTPUT_ROOT/<シナリオ>/`）の外に置く。中に置くと、この回のコピーが
  // 自分自身を含んでしまう。
  const failuresRoot = path.join(OUTPUT_ROOT, "failures", scenario)
  const stamp = Temporal.Now.instant().toString().replaceAll(":", "-")
  const failureDir = path.join(failuresRoot, stamp)
  mkdirSync(failureDir, { recursive: true })
  for (const name of readdirSync(outDir)) {
    cpSync(path.join(outDir, name), path.join(failureDir, name))
  }
  pruneOldFailures(failuresRoot, stamp)
  return failureDir
}

function pruneOldFailures(failuresRoot: string, keptStamp: string): void {
  const stamps = readdirSync(failuresRoot)
    .filter((name) => name !== keptStamp)
    .toSorted()
  const overflow = stamps.length - (FAILURE_RETENTION_COUNT - 1)
  for (const stamp of stamps.slice(0, Math.max(overflow, 0))) {
    rmSync(path.join(failuresRoot, stamp), { recursive: true, force: true })
  }
}

/**
 * 期待値と実際の行の共通の前後を落とし、食い違った真ん中だけを `-`/`+` で並べる。JSON を
 * 整形して比べているので、局所的な食い違いなら読める差分になる。
 */
function lineDiff(expectedText: string, actualText: string): string {
  const expectedLines = expectedText.split("\n")
  const actualLines = actualText.split("\n")
  let prefix = 0
  while (
    prefix < expectedLines.length &&
    prefix < actualLines.length &&
    expectedLines[prefix] === actualLines[prefix]
  ) {
    prefix += 1
  }
  let expectedEnd = expectedLines.length
  let actualEnd = actualLines.length
  while (
    expectedEnd > prefix &&
    actualEnd > prefix &&
    expectedLines[expectedEnd - 1] === actualLines[actualEnd - 1]
  ) {
    expectedEnd -= 1
    actualEnd -= 1
  }
  return [
    `@@ ${String(prefix + 1)} 行目から`,
    ...expectedLines.slice(prefix, expectedEnd).map((line) => `- ${line}`),
    ...actualLines.slice(prefix, actualEnd).map((line) => `+ ${line}`),
  ].join("\n")
}
