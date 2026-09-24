// サイドバー「セッション情報」の3行目——いまのコンテキストの使用量を1行で出し、押すと
// トークン消費の画面（`#token-usage`）へ移る（docs/screen-design.md 13.9「使用量の行」）。
//
// **取得と畳み込みは `browser/domain/context-usage.ts`**（トークン消費の画面の札
// `../token-usage/context-usage-card.tsx` と2つの機能で共有している。同じ `refetchKey` を
// 渡すので `useQuery` の cache 1本に相乗りし、取り直しは1回で済む——冒頭コメント）。
//
// **出す数は札の「使っている量」と同じ**（`usage.totalTokens` / `usage.maxTokens` /
// `usage.percentage`。自動圧縮バッファ・窓の外の分類は含めない）。
//
// **取れないとき・まだ届いていないときも行の高さは変わらない**（文字だけを差し替える。
// 数の代わりに一言を出すだけの1行なので、札の骨組みのような灰色の塊は要らない）。

import { type ReactElement } from "react"

import {
  contextUsageRefetchKey,
  type UseContextUsageResult,
  useContextUsage,
} from "../../domain/context-usage.ts"
import { useSessionSelector } from "../../stores/session.tsx"
import { formatCount } from "../../utils/format-count.ts"
import styles from "./sidebar.module.css"

const ROW_LABEL = "コンテキスト"
const PENDING_TEXT = "取得中…"
const UNAVAILABLE_TEXT = "いまのコンテキストは取れていない"

export function ContextUsageRow(): ReactElement {
  const refetchKey = useSessionSelector((session) =>
    contextUsageRefetchKey(session.state.lastTurnFinishedAt),
  )
  const usage = useContextUsage(refetchKey)

  return (
    <a href="#token-usage" className={styles["context-usage-row"]}>
      <span className={styles["context-usage-row-label"]}>{ROW_LABEL}</span>
      <span className={styles["context-usage-row-value"]}>{valueText(usage)}</span>
      <span className={styles["context-usage-row-bar"]} aria-hidden="true">
        <span
          className={styles["context-usage-row-bar-fill"]}
          style={{ width: `${barPercentage(usage)}%` }}
        />
      </span>
    </a>
  )
}

function valueText(usage: UseContextUsageResult): string {
  if (usage.kind === "pending") {
    return PENDING_TEXT
  }
  if (usage.kind === "unavailable") {
    return UNAVAILABLE_TEXT
  }
  return `使用 ${formatCount(usage.totalTokens)} / ${formatCount(usage.maxTokens)}`
}

/** バーの幅（%）。**100を超える割合が来ても track の中に収める**（SDK は 0〜100+ を返す）。 */
function barPercentage(usage: UseContextUsageResult): number {
  return usage.kind === "ready" ? Math.min(usage.percentage, 100) : 0
}
