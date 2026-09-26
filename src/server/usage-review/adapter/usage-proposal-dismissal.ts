// 見送った提案の識別子（{@link usageProposalKey}。`docs/glossary.md`「提案」）の一覧。見直しが
// 次の段に入るたびにここを読み直し（`usage_review_stage` の戻り値に混ぜる）、結果の検査も
// 同じ一覧を見る（`src/server/usage-review/core/usage-review-tool.ts` の `dismissedKeys`）。
//
// 取り消す口は作らない（見本に無い）。取り消したくなったら、このファイルの `keys` から
// 手で1件消す。
//
// ファイルに触るのはここだけ（原則3）。置き場は `~/.tsukumo/usage-review-dismissed.json`。

import { join } from "node:path"

import { z } from "zod"

import { readJsonFile, writeJsonFile } from "../../adapter/lib/json-file.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"

const DISMISSED_USAGE_PROPOSAL_FILE_NAME = "usage-review-dismissed.json"

/** ファイルの形の版。形を変えたら上げる。 */
const DISMISSED_USAGE_PROPOSAL_FORMAT_VERSION = 1 satisfies number

const dismissedUsageProposalFileSchema = z.object({
  v: z.literal(DISMISSED_USAGE_PROPOSAL_FORMAT_VERSION),
  keys: z.array(z.string()),
})

/** 書き込んでよいのはこの1ファイルだけ。 */
export function dismissedUsageProposalPath(): string {
  return join(tsukumoHomeDir(), DISMISSED_USAGE_PROPOSAL_FILE_NAME)
}

/**
 * 見送った識別子を読む。ファイルが無い・壊れている・版や形が違うときは空——一度も
 * 見送っていないのと同じ扱いになる（`usage-review-tool.ts` はこれをそのまま
 * `dismissedKeys()` として使う）。
 *
 * `path` は差し替えられる（既定は {@link dismissedUsageProposalPath}）。
 */
export function readDismissedUsageProposalKeys(
  path: string = dismissedUsageProposalPath(),
): readonly string[] {
  const parsed = dismissedUsageProposalFileSchema.safeParse(readJsonFile(path))
  return parsed.success ? parsed.data.keys : []
}

/**
 * 識別子を1つ見送りに足す。すでに入っていれば増やさない（同じ札を重ねて見送っても
 * 1件のまま）。失敗しても例外を投げない。
 */
export function writeDismissedUsageProposalKey(
  key: string,
  path: string = dismissedUsageProposalPath(),
): void {
  const existing = readDismissedUsageProposalKeys(path)
  if (existing.includes(key)) {
    return
  }
  writeJsonFile(path, {
    v: DISMISSED_USAGE_PROPOSAL_FORMAT_VERSION,
    keys: [...existing, key],
  })
}
