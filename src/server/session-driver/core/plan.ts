// プラン（`docs/glossary.md`「プラン」）の名前を決める。**出どころが2つある**ので、どちらを
// 採るかの判断をここに置く（読むのは `src/server/session-driver/adapter/claude-account.ts`、流すのは
// `src/server/session-driver/adapter/sdk-driver.ts`）。
//
// **契約の段は Claude Code 自身の控えのほうが正しい。** SDK の `accountInfo()` が返す
// `subscriptionType` は、Max の契約でも `"Claude Pro"` を返すことがある（実測）。控えには
// 段（`claude_max`）と枠（`default_claude_max_20x`）が別々に入っているので、そちらから
// 組み立てられるならそれを使い、**組み立てられないときだけ SDK の値へ落ちる**。
//
// **知らない綴りを訳さない。** 当てはまる形でなければ何も返さず、呼ぶ側が SDK の値を使う
// （知らない段に勝手な名前を付けると、画面の値が実態と違っていても気づけない）。

/**
 * Claude Code の控えが持つ契約の段。**外のファイルを写した直後の形**なので、どちらの鍵も
 * 無いことがある（`docs/coding-standards.md`「「無いかもしれない」値」の例外1）。
 */
export type ClaudeAccountTier = {
  /** 段（`claude_max` / `claude_pro` など）。 */
  readonly organizationType: string | undefined
  /** 枠（`default_claude_max_20x` など。段に倍率が付く）。 */
  readonly rateLimitTier: string | undefined
}

/**
 * 画面に出すプランの名前。**控え → SDK の順**に見て、どちらからも決まらなければ何も返さない
 * （画面は札を出さない）。
 */
export function planName(
  tier: ClaudeAccountTier,
  subscriptionType: string | undefined,
): string | undefined {
  return tierName(tier) ?? blankToUndefined(subscriptionType)
}

/** 控えから組み立てた名前（枠に倍率があればそれも付ける）。 */
function tierName(tier: ClaudeAccountTier): string | undefined {
  const limited = LIMIT_TIER.exec(tier.rateLimitTier ?? "")
  if (limited?.[1] !== undefined) {
    const multiplier = limited[2]
    return multiplier === undefined
      ? gradeName(limited[1])
      : `${gradeName(limited[1])} ${multiplier}`
  }
  const organization = ORGANIZATION_TYPE.exec(tier.organizationType ?? "")
  return organization?.[1] === undefined ? undefined : gradeName(organization[1])
}

/** 段の綴り（`max`）を画面の言葉（`Max`）にする。 */
function gradeName(grade: string): string {
  return `${grade.slice(0, 1).toUpperCase()}${grade.slice(1)}`
}

function blankToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value
}

/** 枠の綴り（`default_claude_max_20x`。倍率は付かないこともある）。 */
const LIMIT_TIER = /^default_claude_([a-z]+)(?:_(\d+x))?$/

/** 段の綴り（`claude_max`）。 */
const ORGANIZATION_TYPE = /^claude_([a-z]+)$/
