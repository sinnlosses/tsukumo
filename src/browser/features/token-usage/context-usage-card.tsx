// いまのコンテキストの内訳の札（`docs/glossary.md`「コンテキストの内訳」）。トークン消費の
// 画面のいちばん上に1枚だけ置く。取得と畳み込みは `hooks/use-context-usage.ts` で、ここは
// 受け取った行をそのまま並べる。
//
// **出すのはいまのセッションの内訳だけ**（過去の推移は出さない）。横棒は中身の分類を積み、
// 続けて空き、最後に自動圧縮バッファ。**凡例は横棒と同じ並びを見る**ので、色と分類名が必ず
// 対になる（13.1 原則5）。窓の外のツールの定義（`deferred`）は横棒に積まず、畳んだ内訳の中に
// 入れる。
//
// **画面に会話の文面は出ない** — メッセージは分類1行の数としてだけ出る
// （`src/shared/context-usage.ts`）。

import { type ReactElement } from "react"

import { type ContextUsageItem } from "../../../shared/context-usage.ts"
import { clockTime, localTimeZoneId, zonedDateTime } from "../../utils/clock.ts"
import { categoryLook } from "./context-usage-category.ts"
import { type ContextUsageRow, type UseContextUsageResult } from "./hooks/use-context-usage.ts"
import styles from "./token-usage.module.css"
import { formatCount } from "./usage-format.ts"

/** 札の見出しと、その横に小さく添える一言。 */
const CARD_TITLE = "いまのコンテキスト"
const CARD_NOTE = "このセッション · /context と同じ内容"

/** 内訳を取れなかったときの一言（**札そのものを出さない**）。 */
const UNAVAILABLE_NOTE = "いまのコンテキストはまだ取れていない"

/** 畳んだ内訳の見出し（`details` の `summary`）。 */
const DETAIL_SUMMARY = "MCP ツール・メモリファイル・スキルの内訳を見る"

export type ContextUsageCardProps = {
  readonly card: UseContextUsageResult
}

export function ContextUsageCard(props: ContextUsageCardProps): ReactElement {
  if (props.card.kind !== "ready") {
    return <p className={styles["token-usage-note"]}>{UNAVAILABLE_NOTE}</p>
  }

  const card = props.card
  return (
    <section className={styles["context-card"]}>
      <div className={styles["context-head"]}>
        <h2 className={styles["context-title"]}>{CARD_TITLE}</h2>
        <span className={styles["context-note"]}>{CARD_NOTE}</span>
        <div className={styles["context-aside"]}>
          <span className={styles["context-until"]}>
            {`自動圧縮まで あと ${formatCount(card.untilCompactTokens)}`}
          </span>
          <span className={styles["context-taken"]}>
            {`${card.model} · 更新 ${clockLabel(card.takenAt)}`}
          </span>
        </div>
      </div>

      <p className={styles["context-total"]}>
        <span className={styles["context-total-value"]}>{formatCount(card.totalTokens)}</span>
        <span className={styles["context-total-max"]}>{`/ ${formatCount(card.maxTokens)}`}</span>
        <span className={styles["context-total-max"]}>{`${card.percentage}%`}</span>
      </p>

      <div className={styles["context-bar"]}>
        {card.rows.map((row) => (
          <span
            key={row.name}
            className={`${styles["context-span"]} ${toneClassName(row)}`}
            style={{ "--context-share": `${row.share}%` }}
          />
        ))}
      </div>

      <dl className={styles["context-legend"]}>
        {card.rows.map((row) => (
          <div key={row.name} className={styles["context-legend-row"]}>
            <dt className={styles["context-legend-name"]}>
              <span className={`${styles["context-swatch"]} ${toneClassName(row)}`} />
              {categoryLook(row.name).label}
            </dt>
            <dd className={styles["context-legend-value"]}>
              {`${formatCount(row.tokens)} · ${formatShare(row.share)}`}
            </dd>
          </div>
        ))}
      </dl>

      <details className={styles["context-detail"]}>
        <summary className={styles["context-detail-summary"]}>{DETAIL_SUMMARY}</summary>
        <ItemTable label="MCP ツール" head="ツール" items={card.mcpTools} />
        <ItemTable label="メモリファイル" head="ファイル" items={card.memoryFiles} />
        <ItemTable label="スキル" head="スキル" items={card.skills} />
        <DeferredTable rows={card.deferredRows} />
      </details>
    </section>
  )
}

type ItemTableProps = {
  readonly label: string
  readonly head: string
  readonly items: readonly ContextUsageItem[]
}

/**
 * 内訳の表1つ（MCP ツール・メモリファイル・スキルで同じ形）。**1件も無いときは見出しごと
 * 出さない**（空の表が3つ並ぶと、何が載る場所なのか読み取りにくい）。
 */
function ItemTable(props: ItemTableProps): ReactElement | null {
  if (props.items.length === 0) {
    return null
  }

  return (
    <>
      <h3 className={styles["token-usage-section-label"]}>{props.label}</h3>
      <table className={styles["token-usage-table"]}>
        <thead>
          <tr>
            <th scope="col">{props.head}</th>
            <th scope="col">出どころ</th>
            <th scope="col">トークン</th>
          </tr>
        </thead>
        <tbody>
          {props.items.map((item) => (
            <tr key={item.name}>
              <th scope="row" className={styles["token-usage-name"]}>
                {item.name}
              </th>
              <td className={styles["token-usage-name"]}>{item.source}</td>
              <td>{formatCount(item.tokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

type DeferredTableProps = {
  readonly rows: readonly ContextUsageRow[]
}

/**
 * 窓の外にあるツールの定義（`deferred`）。**使用量には入らない**ので横棒とは別に、数だけを
 * 並べる。
 */
function DeferredTable(props: DeferredTableProps): ReactElement | null {
  if (props.rows.length === 0) {
    return null
  }

  return (
    <>
      <h3 className={styles["token-usage-section-label"]}>窓の外（要求されたら読むもの）</h3>
      <table className={styles["token-usage-table"]}>
        <tbody>
          {props.rows.map((row) => (
            <tr key={row.name}>
              <th scope="row" className={styles["token-usage-name"]}>
                {categoryLook(row.name).label}
              </th>
              <td>{formatCount(row.tokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

/** 横棒の一区間と凡例の四角に付ける色の綴り（`token-usage.module.css`）。 */
function toneClassName(row: ContextUsageRow): string {
  return styles[`context-tone-${categoryLook(row.name).tone}`] ?? ""
}

/** 割合（`3.9%`）。**小数第1位まで**（1%未満の分類も0にならない）。 */
function formatShare(share: number): string {
  return `${share.toFixed(1)}%`
}

/** 内訳を取った時刻（この端末のローカルの `HH:MM`）。 */
function clockLabel(epochMilliseconds: number): string {
  return clockTime(zonedDateTime(epochMilliseconds, localTimeZoneId()))
}
