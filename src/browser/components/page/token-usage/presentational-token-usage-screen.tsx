// トークン消費の画面の器（docs/design.md 2章「機能の中を分ける」）。フックも算出も持たず、
// 受け取った集計をそのまま置く。取得と期間の選択は `hooks/use-token-usage.ts`。
//
// **数そのものを読ませたいところは表、大小と傾きを見せたいところは棒**。モード別
// （仕事/雑談）と1ターンあたりの中央値は、見ても減らす手が変わらないので出さない。
//
// **画面に会話の文面は出ない**（集計にそもそも文面が入っていない。
// `src/shared/token-usage-summary.ts`）。

import { type ReactElement, useState } from "react"

import {
  TOKEN_USAGE_DAYS_CHOICES,
  type ModelUsageTotal,
  type TokenUsageDays,
  type TokenUsageTotals,
  type TokenUsageTrend,
} from "../../../../shared/token-usage-summary.ts"
import { type ToolUsageCount } from "../../../../shared/token-usage.ts"
import { type UseContextUsageResult } from "../../../domain/context-usage.ts"
import { formatCount } from "../../../utils/format-count.ts"
import { ContextUsageCard } from "./context-usage-card.tsx"
import { type UseTokenUsageResult } from "./hooks/use-token-usage.ts"
import { type UseUsageReviewResult } from "./hooks/use-usage-review.ts"
import { PeriodUsageCard } from "./period-usage-card.tsx"
import styles from "./token-usage.module.css"
import { formatBytes } from "./usage-format.ts"
import { UsageReviewCard } from "./usage-review-card.tsx"

/** 記録が1件も無い期間の一言（**空でも壊れない**。札も表も出さずこれだけ）。 */
const EMPTY_NOTE = "この期間の記録はまだ無い"

/** 集計を取れなかったときの一言（記録が無いときと区別する）。 */
const FAILED_NOTE = "集計を取れなかった"

/**
 * ツール別に並べる件数。**上から数件で「何が文脈を食ったか」は分かる**ので、初めは全部を
 * 出さずに残りの件数だけを添える（数十種類が並ぶと表の意味が薄れる）。「ほか n 件を見る」を
 * 押すと残りも出る（{@link ToolUsageCard}）。
 */
const TOOL_ROWS = 6

export type PresentationalTokenUsageScreenProps = UseTokenUsageResult & {
  /** いまのコンテキストの内訳（`browser/domain/context-usage.ts`）。 */
  readonly contextUsage: UseContextUsageResult
  /** 「減らし方を見てもらう」区画（`hooks/use-usage-review.ts`）。 */
  readonly usageReview: UseUsageReviewResult
}

export function PresentationalTokenUsageScreen(
  props: PresentationalTokenUsageScreenProps,
): ReactElement {
  // **記録が1件も無い期間かどうかはモデル別で見る** — 推移は期間のすべての刻みが0で並ぶので
  // 長さでは分からない。行はモデルの増分が1つでもあるときにだけ積まれる
  // （`src/server/core/session-manager.ts`）ので、モデル別が空なら行が無い。
  const isEmpty = props.summary.byModel.length === 0

  return (
    <div className={styles["token-usage"]}>
      <div className={styles["token-usage-bar"]}>
        <h1 className={styles["token-usage-title"]}>トークン消費</h1>
        {props.plan === undefined ? null : (
          <span className={styles["token-usage-plan"]}>{props.plan}</span>
        )}
        <div className={styles["token-usage-bar-spacer"]} />
        {props.usageReview.kind === "running" ? (
          <span className={styles["token-usage-review-badge"]} role="status">
            見直し中
          </span>
        ) : null}
      </div>

      <UsageReviewCard review={props.usageReview} />

      <ContextUsageCard card={props.contextUsage} />

      <section className={styles["token-usage-section"]}>
        <div className={styles["token-usage-section-head"]}>
          <h2 className={styles["token-usage-section-label"]}>期間の消費</h2>
          <PeriodChoices days={props.days} onDaysChange={props.onDaysChange} />
        </div>
        {props.isError ? (
          <p className={styles["token-usage-note"]}>{FAILED_NOTE}</p>
        ) : isEmpty ? (
          <p className={styles["token-usage-note"]}>{EMPTY_NOTE}</p>
        ) : (
          <PeriodUsageCards total={props.total} trend={props.summary.trend} />
        )}
      </section>

      {props.isError || isEmpty ? null : (
        <div className={styles["usage-table-row"]}>
          <ModelUsageCard byModel={props.summary.byModel} />
          <ToolUsageCard byTool={props.summary.byTool} />
        </div>
      )}
    </div>
  )
}

type PeriodChoicesProps = {
  readonly days: TokenUsageDays
  readonly onDaysChange: (days: TokenUsageDays) => void
}

/** 期間の切り替え（「期間の消費」の見出しの右端）。 */
function PeriodChoices(props: PeriodChoicesProps): ReactElement {
  return (
    <div className={styles["token-usage-period"]}>
      {TOKEN_USAGE_DAYS_CHOICES.map((choice) => (
        <button
          key={choice}
          type="button"
          className={styles["token-usage-choice"]}
          aria-pressed={choice === props.days}
          onClick={() => {
            props.onDaysChange(choice)
          }}
        >
          {daysLabel(choice)}
        </button>
      ))}
    </div>
  )
}

/** 期間の名乗り。**1日だけは「今日」**（棒も時間ごとに割れるので、日数では読み違える）。 */
function daysLabel(days: TokenUsageDays): string {
  return days === 1 ? "今日" : `${days}日`
}

type PeriodUsageCardsProps = {
  readonly total: TokenUsageTotals
  readonly trend: TokenUsageTrend
}

/**
 * 期間の合計の札4枚（入力・出力・キャッシュ読み・キャッシュ作成）。**札ごとに縦軸が独立する**
 * ので、桁の違うキャッシュ読みを同じ並びに置いてもほかが潰れない。
 */
function PeriodUsageCards(props: PeriodUsageCardsProps): ReactElement {
  return (
    <div className={styles["usage-card-row"]}>
      <PeriodUsageCard
        label="入力"
        value={formatCount(props.total.inputTokens)}
        trend={props.trend}
        pick={(totals) => totals.inputTokens}
      />
      <PeriodUsageCard
        label="出力"
        value={formatCount(props.total.outputTokens)}
        trend={props.trend}
        pick={(totals) => totals.outputTokens}
      />
      <PeriodUsageCard
        label="キャッシュ読み"
        value={formatCount(props.total.cacheReadInputTokens)}
        trend={props.trend}
        pick={(totals) => totals.cacheReadInputTokens}
      />
      <PeriodUsageCard
        label="キャッシュ作成"
        value={formatCount(props.total.cacheCreationInputTokens)}
        trend={props.trend}
        pick={(totals) => totals.cacheCreationInputTokens}
      />
    </div>
  )
}

type ModelUsageCardProps = {
  readonly byModel: readonly ModelUsageTotal[]
}

/**
 * モデル別の札（期間の合計の札 `.usage-card` と同じ枠・同じ地）。**届く順がそのまま並び順**
 * （出力の多い順。同じなら名前順——`src/server/core/token-usage.ts` の `summarizeByModel`）。
 * **出力の列だけ**に、その列の最大に対する横棒を添える。
 */
function ModelUsageCard(props: ModelUsageCardProps): ReactElement {
  const peak = Math.max(0, ...props.byModel.map((entry) => entry.totals.outputTokens))

  return (
    <section className={styles["usage-card"]}>
      <TableCardHead title="モデル別" order="出力の多い順" />
      <table className={`${styles["token-usage-table"]} ${styles["model-usage-table"]}`}>
        <thead>
          <tr>
            <th scope="col">モデル</th>
            <th scope="col">入力</th>
            <th scope="col">出力</th>
            <th scope="col">キャッシュ読み</th>
            <th scope="col">キャッシュ作成</th>
          </tr>
        </thead>
        <tbody>
          {props.byModel.map((entry) => (
            <tr key={entry.model}>
              <th scope="row" className={styles["token-usage-name"]}>
                {entry.model}
              </th>
              <td>{formatCount(entry.totals.inputTokens)}</td>
              <td>
                <BarredValue
                  formatted={formatCount(entry.totals.outputTokens)}
                  value={entry.totals.outputTokens}
                  peak={peak}
                />
              </td>
              <td>{formatCount(entry.totals.cacheReadInputTokens)}</td>
              <td>{formatCount(entry.totals.cacheCreationInputTokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

type ToolUsageCardProps = {
  readonly byTool: readonly ToolUsageCount[]
}

/**
 * ツール別の札。**上位 {@link TOOL_ROWS} 件だけ**を出し、残りがあれば「ほか n 件を見る」で
 * 開く（押した状態は画面のこの表示だけの見た目の話なので `useState` で持つ。開いたら
 * 「閉じる」に変えて戻せるようにする——並べ替えた6件より下を毎回スクロールで探させないため）。
 * **結果の大きさの列だけ**に横棒を添える。
 */
function ToolUsageCard(props: ToolUsageCardProps): ReactElement {
  const [expanded, setExpanded] = useState(false)
  const rest = props.byTool.length - TOOL_ROWS
  const shown = expanded ? props.byTool : props.byTool.slice(0, TOOL_ROWS)
  const peak = Math.max(0, ...props.byTool.map((tool) => tool.resultBytes))

  return (
    <section className={styles["usage-card"]}>
      <TableCardHead title="ツール別" order="結果の大きい順" />
      <table className={`${styles["token-usage-table"]} ${styles["tool-usage-table"]}`}>
        <thead>
          <tr>
            <th scope="col">ツール</th>
            <th scope="col">回数</th>
            <th scope="col">結果の大きさ</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((tool) => (
            <tr key={tool.name}>
              <th scope="row" className={styles["token-usage-name"]}>
                {tool.name}
              </th>
              <td>{tool.calls}</td>
              <td>
                <BarredValue
                  formatted={formatBytes(tool.resultBytes)}
                  value={tool.resultBytes}
                  peak={peak}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rest > 0 ? (
        <button
          type="button"
          className={styles["usage-table-more"]}
          onClick={() => {
            setExpanded((current) => !current)
          }}
        >
          {expanded ? "閉じる" : `ほか ${rest} 件を見る`}
        </button>
      ) : null}
    </section>
  )
}

type TableCardHeadProps = {
  readonly title: string
  readonly order: string
}

/** 表を持つ札の見出し（見出しの横に並べ順を小さく添える）。 */
function TableCardHead(props: TableCardHeadProps): ReactElement {
  return (
    <div className={styles["usage-table-head"]}>
      <h3 className={styles["usage-table-title"]}>{props.title}</h3>
      <span className={styles["usage-table-order"]}>{props.order}</span>
    </div>
  )
}

type BarredValueProps = {
  /** 書き終えた数（表示する文字列そのもの）。 */
  readonly formatted: string
  /** 棒の長さを決める生の数。 */
  readonly value: number
  /** その列の最大（0 なら棒は描かない）。 */
  readonly peak: number
}

/**
 * 数の右に横棒を添える（並べ順を決めている列だけに使う。`period-usage-card.tsx` の縦棒と
 * 同じ「その列の最大に対する割合」）。**塗りは量の棒の青（`--usage-bar`）**——期間の合計の棒
 * （`.usage-card-bar`）と同じ色で、分類の色ではない。数の文字が必ず隣に並ぶので、色だけで
 * 意味を伝えることにはならない（`docs/screen-design.md` 13.1 原則5・13.2）。
 */
function BarredValue(props: BarredValueProps): ReactElement {
  return (
    <span className={styles["usage-table-bar-cell"]}>
      <span>{props.formatted}</span>
      <span className={styles["usage-table-bar"]}>
        <span
          className={styles["usage-table-bar-fill"]}
          style={{ "--usage-bar-share": barShare(props.value, props.peak) }}
        />
      </span>
    </span>
  )
}

/** 棒の幅（その列の最大に対する割合）。最大が0なら全部0%。 */
function barShare(value: number, peak: number): string {
  return peak === 0 ? "0%" : `${(value / peak) * 100}%`
}
