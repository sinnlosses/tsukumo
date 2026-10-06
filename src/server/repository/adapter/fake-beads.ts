// 疑似セッションの Beads の口。`bd` を起こさず、cwd の決まった名前のファイル（`bd list --json` の出力と同じ形の配列）を読む。
// ファイルは E2E の足場が部屋を開いたあとに置く。
// ファイルが無い・読めないときは `failed`（`.beads` が無いときと同じ「不明」）。例外を投げない。

import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { beadsOutcomeOf, type BeadsOutcome } from "./beads.ts"

/** 課題を置くファイルの、cwd からの相対パス。 */
export const FAKE_BEADS_ISSUES_PATH = ".tsukumo/fake-beads-issues.json"

export async function readFakeBeadsIssues(cwd: string): Promise<BeadsOutcome> {
  try {
    return beadsOutcomeOf(await readFile(join(cwd, FAKE_BEADS_ISSUES_PATH), "utf8"))
  } catch {
    return { kind: "failed" }
  }
}

/** 変化の印は持たない（読み元は見回りのたびにファイルを読み直す）。 */
export function createFakeBeadsStampReader(): () => Promise<string | undefined> {
  return () => Promise.resolve(undefined)
}
