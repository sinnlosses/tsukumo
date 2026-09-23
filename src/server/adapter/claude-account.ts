// Claude Code 自身が持つアカウントの控え（`~/.claude.json` の `oauthAccount`）から、契約の段を
// 読む口。**プランの名前をどう決めるかは `src/server/core/plan.ts`** で、ここは読むだけ。
//
// **読んで返すのは契約の段を表す2つの鍵だけ**（`organizationType` / `organizationRateLimitTier`）。
// 同じファイルには利用者を特定する値（メールアドレス・組織の名前・UUID）も入っているが、
// **戻り値に乗らないので外へ出る経路が無い**（`docs/coding-standards.md`「会話内容の扱い」と
// 同じ線の引き方）。
//
// **これは tsukumo の持ち物ではなく Claude Code の内部のファイル**で、形が変わっても知らせは
// 来ない。読めない・鍵が無い・形が違うときは「無い」を返し、呼ぶ側が SDK の値へ落ちる
// （`docs/coding-standards.md`「エラーハンドリング」の「動作中の一時的な失敗」）。

import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

import { isPlainObject } from "remeda"

import { type ClaudeAccountTier } from "../core/plan.ts"

const ACCOUNT_FILE_NAME = ".claude.json"

/** どちらの鍵も読めなかったときの形。 */
const UNKNOWN_TIER = {
  organizationType: undefined,
  rateLimitTier: undefined,
} satisfies ClaudeAccountTier

/**
 * 控えから契約の段を読む。**呼んだときだけ `homedir()` を読む**（モジュールのトップレベルでは
 * 触らない）。
 */
export function readClaudeAccountTier(): ClaudeAccountTier {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(join(homedir(), ACCOUNT_FILE_NAME), { encoding: "utf8" }),
    )
    if (!isPlainObject(parsed) || !isPlainObject(parsed.oauthAccount)) {
      return UNKNOWN_TIER
    }
    const account = parsed.oauthAccount
    return {
      organizationType: optionalString(account.organizationType),
      rateLimitTier: optionalString(account.organizationRateLimitTier),
    }
  } catch {
    return UNKNOWN_TIER
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}
