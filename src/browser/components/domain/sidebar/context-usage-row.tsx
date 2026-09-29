// サイドバーの下端の帯の詳しい面の中で、いまのコンテキストの使用量を1枚の札で出す。
// 押せるのは右端の `›`（ホバー中は「詳しく ›」）だけで、押すとトークン消費の画面（`#token-usage`）へ移る。
//
// 出す数は札の「使っている量」と同じ（`usage.totalTokens` / `usage.maxTokens` / `usage.percentage`。自動圧縮バッファ・窓の外の分類は含めない）。
//
// 取れないとき・まだ届いていないときも札の高さは変わらない。
// 3段の骨組みはいつも同じで、1段目の割合は「—」、量の場所に一言（`PENDING_TEXT` / `UNAVAILABLE_TEXT`）を出し、3段目は空けて高さだけ保つ。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { UseContextUsageResult } from "../../../domain/context-usage.ts"
import { formatCount } from "../../../utils/format-count.ts"
import { HStack } from "../../ui/h-stack/h-stack.tsx"
import { Text } from "../../ui/text/text.tsx"
import styles from "./sidebar.module.css"

const ROW_LABEL = "コンテキスト"
const PENDING_TEXT = "取得中…"
const UNAVAILABLE_TEXT = "いまのコンテキストは取れていない"
const PERCENTAGE_PLACEHOLDER = "—"
const LINK_HOVER_TEXT = "詳しく"
const UNTIL_PLACEHOLDER = "\u00a0"

/** 警告にする境目（%）。見本の説明文から取った値。 */
const WARN_THRESHOLD_PERCENTAGE = 70

export function ContextUsageRow(props: { readonly usage: UseContextUsageResult }): ReactElement {
  const { usage } = props
  const warn = isContextUsageWarn(usage)

  return (
    <div
      className={clsx(styles["context-usage-row"], warn && styles["context-usage-row-warn"])}
      aria-busy={usage.kind === "pending" ? "true" : undefined}
    >
      <HStack
        element="div"
        name={{ kind: "none" }}
        ref={undefined}
        gap="sm"
        align="baseline"
        justify="start"
        wrap="nowrap"
        className=""
      >
        <Text
          element="span"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["context-usage-row-label"]}
        >
          {ROW_LABEL}
        </Text>
        <span className={styles["context-usage-row-percentage"]}>{percentageText(usage)}</span>
        <Text
          element="span"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["context-usage-row-value"]}
        >
          {valueText(usage)}
        </Text>
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
 * 3段目「自動圧縮まで あと N」。70%以上は「そろそろ区切りどき。」を添える。
 * 取れない・まだ届いていないときは空けて高さだけ保つ（一言は1段目の量の場所に出ているので、重ねて出さない）。
 */
function untilText(usage: UseContextUsageResult): string {
  if (usage.kind !== "ready") {
    return UNTIL_PLACEHOLDER
  }
  const rest = `自動圧縮まで あと ${formatCount(usage.untilCompactTokens)}`
  return isContextUsageWarn(usage) ? `そろそろ区切りどき。${rest}` : rest
}

/** 警告の色にするか。まだ数が無いときは警告にしない。 */
export function isContextUsageWarn(usage: UseContextUsageResult): boolean {
  return usage.kind === "ready" && usage.percentage >= WARN_THRESHOLD_PERCENTAGE
}

/** `›` の `aria-label`。数がある ready だけ割合を読む。 */
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

/** バーの幅（%）。SDK は 100 を超える割合も返すので、track の中に収める。 */
function barPercentage(usage: UseContextUsageResult): number {
  return usage.kind === "ready" ? Math.min(usage.percentage, 100) : 0
}
