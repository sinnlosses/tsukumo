// いまのコンテキストの内訳の札（`docs/glossary.md`「コンテキストの内訳」）。トークン消費の
// 画面のいちばん上に1枚だけ置く。取得と畳み込みは `browser/domain/context-usage.ts`
// （サイドバーの使用量の行と2つの機能が読むので `browser/domain/` に置いてある）で、
// ここは受け取った行をそのまま並べる。
//
// **出すのはいまのセッションの内訳だけ**（過去の推移は出さない）。横棒は中身の分類を積み、
// 続けて空き、最後に自動圧縮バッファ。**凡例は横棒と同じ並びを見る**ので、色と分類名が必ず
// 対になる（13.1 原則5）。窓の外のツールの定義（`deferred`）は横棒に積まず、畳んだ内訳の中に
// 入れる。
//
// **画面に会話の文面は出ない** — メッセージは分類1行の数としてだけ出る
// （`src/shared/context-usage.ts`）。
//
// **届く前は「骨組み」を出す**（`ContextUsageCardSkeleton`）。届いた札と**同じ外形**
// （同じ `section`・見出しと添え書き・数の行・横棒・凡例・畳んだ内訳の見出し）で、**中身の
// 値だけを灰色の塊にする**。分類の名前と色は毎回同じ6+2種類なので、骨組みでも実物と同じ文字・
// 同じ塗りを出せる（値（トークン数・割合・時刻）だけが届くまで分からない）。**骨組みと届いた
// 札の高さを揃え、レイアウトシフトを防ぐのが目的。**

import { type ReactElement } from "react"

import { type ContextUsageItem } from "../../../shared/context-usage.ts"
import { type ContextUsageRow, type UseContextUsageResult } from "../../domain/context-usage.ts"
import { clockTime, localTimeZoneId, zonedDateTime } from "../../utils/clock.ts"
import { formatCount } from "../../utils/format-count.ts"
import { categoryLook, SKELETON_ROW_NAMES } from "./context-usage-category.ts"
import styles from "./token-usage.module.css"

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
  const card = props.card

  if (card.kind === "pending") {
    return <ContextUsageCardSkeleton />
  }
  if (card.kind === "unavailable") {
    return <p className={styles["token-usage-note"]}>{UNAVAILABLE_NOTE}</p>
  }

  return (
    <section className={styles["context-card"]}>
      <div className={styles["context-head"]}>
        <h2 className={styles["context-title"]}>{CARD_TITLE}</h2>
        <span className={styles["context-note"]}>{CARD_NOTE}</span>
        <div className={styles["context-aside"]}>
          <span className={styles["context-until"]}>
            <span className={styles["context-until-label"]}>自動圧縮まで</span>
            {` あと ${formatCount(card.untilCompactTokens)}`}
          </span>
          <span className={styles["context-taken"]}>
            {`${card.model} · 更新 ${clockLabel(card.takenAt)}`}
          </span>
        </div>
      </div>

      <p className={styles["context-total"]}>
        <span className={styles["context-total-value"]}>{formatCount(card.totalTokens)}</span>
        <span className={styles["context-total-max"]}>{`/ ${formatCount(card.maxTokens)}`}</span>
        <span className={styles["context-total-share"]}>{`${card.percentage}%`}</span>
      </p>

      <div className={styles["context-bar"]}>
        {card.rows.map((row) => (
          <span
            key={row.name}
            className={`${styles["context-span"]} ${toneClassName(row.name)}`}
            style={{ "--context-share": `${row.share}%` }}
          />
        ))}
      </div>

      <dl className={styles["context-legend"]}>
        {card.rows.map((row) => (
          <div key={row.name} className={styles["context-legend-row"]}>
            <dt className={styles["context-legend-name"]}>
              <span className={`${styles["context-swatch"]} ${toneClassName(row.name)}`} />
              {categoryLook(row.name).label}
            </dt>
            <dd className={styles["context-legend-value"]}>
              <span className={styles["context-legend-tokens"]}>{formatCount(row.tokens)}</span>
              {` · ${formatShare(row.share)}`}
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

/**
 * 届く前の骨組み。**届いた札（上の `ContextUsageCard` の `ready` 分岐）と同じ `section`・
 * クラス名を使う**ので、余白・罫線・高さの取り方はそのまま揃う。`aria-busy` は `section` に
 * 付け、値の塊（`SkeletonBlock`）は `aria-hidden` で読み上げに出さない。凡例は
 * `SKELETON_ROW_NAMES` の8行（中身6分類 + 空き + 自動圧縮バッファ。窓の外は数えない）。
 */
function ContextUsageCardSkeleton(): ReactElement {
  return (
    <section className={styles["context-card"]} aria-busy="true">
      <div className={styles["context-head"]}>
        <h2 className={styles["context-title"]}>{CARD_TITLE}</h2>
        <span className={styles["context-note"]}>{CARD_NOTE}</span>
        <div className={styles["context-aside"]}>
          <span className={styles["context-until"]}>
            <span className={styles["context-until-label"]}>自動圧縮まで</span>{" "}
            <SkeletonBlock className={`${styles["context-skeleton-until"]}`} />
          </span>
          <span className={styles["context-taken"]}>
            <SkeletonBlock className={`${styles["context-skeleton-taken"]}`} />
          </span>
        </div>
      </div>

      <p className={styles["context-total"]}>
        <SkeletonBlock
          className={`${styles["context-total-value"]} ${styles["context-skeleton-total-value"]}`}
        />
        <SkeletonBlock
          className={`${styles["context-total-max"]} ${styles["context-skeleton-total-max"]}`}
        />
        <SkeletonBlock
          className={`${styles["context-total-share"]} ${styles["context-skeleton-total-share"]}`}
        />
      </p>

      <div className={styles["context-bar"]}>
        {/* 横棒だけは他と違い、中身の文字（`&nbsp;`）ではなく親（`.context-bar`）の
            高さに合わせて伸ばす（`flex` の既定の `stretch`）ので `SkeletonBlock` は使わない。 */}
        <span
          className={`${styles["context-skeleton-block"]} ${styles["context-skeleton-bar"]}`}
          aria-hidden="true"
        />
      </div>

      <dl className={styles["context-legend"]}>
        {SKELETON_ROW_NAMES.map((name) => {
          const look = categoryLook(name)
          return (
            <div key={name} className={styles["context-legend-row"]}>
              <dt className={styles["context-legend-name"]}>
                <span className={`${styles["context-swatch"]} ${toneClassName(name)}`} />
                {look.label}
              </dt>
              <dd className={styles["context-legend-value"]}>
                <SkeletonBlock className={`${styles["context-skeleton-legend-value"]}`} />
              </dd>
            </div>
          )
        })}
      </dl>

      <details className={styles["context-detail"]}>
        <summary className={styles["context-detail-summary"]}>{DETAIL_SUMMARY}</summary>
      </details>
    </section>
  )
}

type SkeletonBlockProps = {
  readonly className: string
}

/**
 * 骨組みの値1つぶんの塊。読み上げには出さない（`aria-hidden`）。明滅は
 * `token-usage.module.css` の `.context-skeleton-block` が持つ。**中身に `&nbsp;` を1つ
 * 持たせる**——高さを持たない空の `span` だと、届いた札の実物の文字（同じ場所・同じ
 * `font-size`）が乗せる行の高さ（本文の行間 `--line-height-body` ぶん）より低くなり、
 * 骨組みと届いた札の高さがずれる（実測）。読み上げに出ないよう見た目は透明にする
 * （`.context-skeleton-block` の `color: transparent`）。
 */
function SkeletonBlock(props: SkeletonBlockProps): ReactElement {
  return (
    <span className={`${styles["context-skeleton-block"]} ${props.className}`} aria-hidden="true">
      {"\u00a0"}
    </span>
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

/** 横棒の一区間と凡例の四角に付ける色の綴り（`token-usage.module.css`）。**分類の表示名から
 * 引く**（骨組みは `ContextUsageRow` を持たず名前だけ知っているので、届いた札の行
 * （`row.name`）と骨組みの分類名（`SKELETON_ROW_NAMES` の要素）の両方から呼べる形にしてある）。 */
function toneClassName(name: string): string {
  return styles[`context-tone-${categoryLook(name).tone}`] ?? ""
}

/** 割合（`3.9%`）。**小数第1位まで**（1%未満の分類も0にならない）。 */
function formatShare(share: number): string {
  return `${share.toFixed(1)}%`
}

/** 内訳を取った時刻（この端末のローカルの `HH:MM`）。 */
function clockLabel(epochMilliseconds: number): string {
  return clockTime(zonedDateTime(epochMilliseconds, localTimeZoneId()))
}
