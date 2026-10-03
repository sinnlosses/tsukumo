// Claude Code 自身が持つアカウントの控え（`CLAUDE_CONFIG_DIR`、無ければ `~` の `.claude.json` の `oauthAccount`）から、契約の段を読む口。
// プランの名前をどう決めるかは `planName` で、ここは読むだけ。
//
// 読んで返すのは契約の段を表す2つの鍵だけ（`organizationType` / `organizationRateLimitTier`）。
// 同じファイルには利用者を特定する値（メールアドレス・組織の名前・UUID）も入っているが、戻り値に乗らないので外へ出る経路が無い。
//
// これは tsukumo の持ち物ではなく Claude Code の内部のファイルで、形が変わっても知らせは来ない。
// 読めない・鍵が無い・形が違うときは「無い」を返し、呼ぶ側が SDK の値へ落ちる。

import { homedir } from "node:os"
import { join } from "node:path"

import { isPlainObject } from "remeda"

import { optionalString } from "../../../shared/utils/optional-string.ts"
import { readJsonFile } from "../../adapter/lib/json-file.ts"
import type { ClaudeAccountTier } from "../core/plan.ts"

const ACCOUNT_FILE_NAME = ".claude.json"

/** どちらの鍵も読めなかったときの形。 */
const UNKNOWN_TIER = {
  organizationType: undefined,
  rateLimitTier: undefined,
} satisfies ClaudeAccountTier

/** 設定ディレクトリの控えから契約の段を読む。無いときは `~` の控えで、そのときだけ `homedir()` を読む。 */
export function readClaudeAccountTier(configDir: string | undefined): ClaudeAccountTier {
  const parsed = readJsonFile(join(configDir ?? homedir(), ACCOUNT_FILE_NAME))
  if (!isPlainObject(parsed) || !isPlainObject(parsed.oauthAccount)) {
    return UNKNOWN_TIER
  }
  const account = parsed.oauthAccount
  return {
    organizationType: optionalString(account.organizationType),
    rateLimitTier: optionalString(account.organizationRateLimitTier),
  }
}
