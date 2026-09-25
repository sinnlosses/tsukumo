// サイドバー「セッション情報」の3段目——いまのコンテキストの使用量を1枚の札で出す
// （docs/screen-design.md「使用量の行」）。押せるのは**右端の `›`（ホバー中は「詳しく ›」）
// だけ**（行全体を押せる札にはしない）。押すとトークン消費の画面
// （`#token-usage`）へ移る。
//
// **取得と畳み込みは `browser/domain/context-usage.ts`**（トークン消費の画面の札
// `../token-usage/context-usage-card.tsx` と2つの機能で共有している。同じ `refetchKey` を
// 渡すので `useQuery` の cache 1本に相乗りし、取り直しは1回で済む——冒頭コメント）。
//
// **出す数は札の「使っている量」と同じ**（`usage.totalTokens` / `usage.maxTokens` /
// `usage.percentage`。自動圧縮バッファ・窓の外の分類は含めない）。
//
// **取れないとき・まだ届いていないときも札の高さは変わらない。** 3段の骨組みはいつも同じで、
// 1段目の割合は「—」、量の場所に一言（`PENDING_TEXT` / `UNAVAILABLE_TEXT`）を出す。3段目は
// 空けて ` ` で高さだけ保つ（`ContextUsageCardSkeleton` の `SkeletonBlock` と同じ考え方
// だが、灰色の塊にはしない——1行の文字だけなので、実物の文字と同じ行の高さで自然に揃う）。
//
// **警告の境目 70% はこのファイルだけの定数**（`WARN_THRESHOLD_PERCENTAGE`）。トークン消費の
// 画面の札（`context-usage-card.tsx`）はまだ警告色を持たず、読み手が2つ目にならないので
// `browser/domain/` へは上げない（docs/design.md 2章「上げる引き金は「2つ目の読み手が
// 出たとき」」）。

import { type ReactElement } from "react"

import { HStack } from "../../../components/ui/h-stack/h-stack.tsx"
import {
  contextUsageRefetchKey,
  type UseContextUsageResult,
  useContextUsage,
} from "../../../domain/context-usage.ts"
import { useSessionSelector } from "../../../stores/session.tsx"
import { formatCount } from "../../../utils/format-count.ts"
import styles from "./sidebar.module.css"

const ROW_LABEL = "コンテキスト"
const PENDING_TEXT = "取得中…"
const UNAVAILABLE_TEXT = "いまのコンテキストは取れていない"
const PERCENTAGE_PLACEHOLDER = "—"
const LINK_HOVER_TEXT = "詳しく"
const UNTIL_PLACEHOLDER = "\u00a0"

/** 警告にする境目（%）。見本の説明文から取った値。 */
const WARN_THRESHOLD_PERCENTAGE = 70

export function ContextUsageRow(): ReactElement {
  const refetchKey = useSessionSelector((session) =>
    contextUsageRefetchKey(session.state.lastTurnFinishedAt),
  )
  const usage = useContextUsage(refetchKey)
  const warn = isWarn(usage)

  return (
    <div
      className={`${styles["context-usage-row"]}${warn ? ` ${styles["context-usage-row-warn"]}` : ""}`}
    >
      <HStack element="div" gap="sm" align="baseline" justify="start" wrap="nowrap" className="">
        <span className={styles["context-usage-row-label"]}>{ROW_LABEL}</span>
        <span className={styles["context-usage-row-percentage"]}>{percentageText(usage)}</span>
        <span className={styles["context-usage-row-value"]}>{valueText(usage)}</span>
        <span className={styles["context-usage-row-spacer"]} aria-hidden="true" />
        <a
          href="#token-usage"
          className={styles["context-usage-row-link"]}
          aria-label={ariaLabel(usage)}
        >
          <span className={styles["context-usage-row-link-text"]} aria-hidden="true">
            {LINK_HOVER_TEXT}
          </span>
          <span aria-hidden="true">{"›"}</span>
        </a>
      </HStack>
      <span className={styles["context-usage-row-bar"]} aria-hidden="true">
        <span
          className={styles["context-usage-row-bar-fill"]}
          style={{ width: `${barPercentage(usage)}%` }}
        />
      </span>
      <span className={styles["context-usage-row-until"]}>{untilText(usage)}</span>
    </div>
  )
}

/** 1段目の割合。**まだ届いていない・取れないときは「—」**（高さを保つための置き字）。 */
function percentageText(usage: UseContextUsageResult): string {
  return usage.kind === "ready" ? `${usage.percentage}%` : PERCENTAGE_PLACEHOLDER
}

/** 1段目の「使っている量 / 窓の大きさ」。取れないときはその場所に一言を出す。 */
function valueText(usage: UseContextUsageResult): string {
  if (usage.kind === "pending") {
    return PENDING_TEXT
  }
  if (usage.kind === "unavailable") {
    return UNAVAILABLE_TEXT
  }
  return `${formatCount(usage.totalTokens)} / ${formatCount(usage.maxTokens)}`
}

/**
 * 3段目「自動圧縮まで あと N」。70%以上は「そろそろ区切りどき。」を添える。**取れない・まだ
 * 届いていないときは空ける**（`UNTIL_PLACEHOLDER` で高さだけ保つ。一言は1段目の量の場所に出ているので、
 * ここで重ねて出さない）。
 */
function untilText(usage: UseContextUsageResult): string {
  if (usage.kind !== "ready") {
    return UNTIL_PLACEHOLDER
  }
  const rest = `自動圧縮まで あと ${formatCount(usage.untilCompactTokens)}`
  return isWarn(usage) ? `そろそろ区切りどき。${rest}` : rest
}

/** `70%` 以上を警告にする（`kind !== "ready"` は警告にしない）。 */
function isWarn(usage: UseContextUsageResult): boolean {
  return usage.kind === "ready" && usage.percentage >= WARN_THRESHOLD_PERCENTAGE
}

/** `›` の `aria-label`。状態ごとに読み上げが変わる（数がある ready だけ割合を読む）。 */
function ariaLabel(usage: UseContextUsageResult): string {
  const suffix = "トークン消費の画面で詳しく見る"
  if (usage.kind === "pending") {
    return `コンテキスト 取得中。${suffix}`
  }
  if (usage.kind === "unavailable") {
    return `コンテキストは取れていない。${suffix}`
  }
  return `コンテキスト ${usage.percentage}% 使用。${suffix}`
}

/** バーの幅（%）。**100を超える割合が来ても track の中に収める**（SDK は 0〜100+ を返す）。 */
function barPercentage(usage: UseContextUsageResult): number {
  return usage.kind === "ready" ? Math.min(usage.percentage, 100) : 0
}
