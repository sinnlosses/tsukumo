// トークン消費の画面の器（docs/design.md 2章「機能の中を分ける」）。フックも算出も持たず、
// 受け取った集計をそのまま置く。取得と期間の選択は `hooks/use-token-usage.ts`。
//
// **数そのものを読ませたいところは表、大小と傾きを見せたいところは棒**。モード別
// （仕事/雑談）と1ターンあたりの中央値は、見ても減らす手が変わらないので出さない。
//
// **画面に会話の文面は出ない**（集計にそもそも文面が入っていない。
// `src/shared/token-usage-summary.ts`）。

import { type ReactElement } from "react"

import {
  TOKEN_USAGE_DAYS_CHOICES,
  type ModelUsageTotal,
  type TokenUsageDays,
  type TokenUsageTotals,
  type TokenUsageTrend,
} from "../../../shared/token-usage-summary.ts"
import { type ToolUsageCount } from "../../../shared/token-usage.ts"
import { ContextUsageCard } from "./context-usage-card.tsx"
import { type UseContextUsageResult } from "./hooks/use-context-usage.ts"
import { type UseTokenUsageResult } from "./hooks/use-token-usage.ts"
import { PeriodUsageCard } from "./period-usage-card.tsx"
import styles from "./token-usage.module.css"
import { formatBytes, formatCount } from "./usage-format.ts"

/** 記録が1件も無い期間の一言（**空でも壊れない**。札も表も出さずこれだけ）。 */
const EMPTY_NOTE = "この期間の記録はまだ無い"

/** 集計を取れなかったときの一言（記録が無いときと区別する）。 */
const FAILED_NOTE = "集計を取れなかった"

/**
 * ツール別に並べる件数。**上から数件で「何が文脈を食ったか」は分かる**ので、全部は出さずに
 * 残りの件数だけを添える（数十種類が並ぶと表の意味が薄れる）。
 */
const TOOL_ROWS = 10

export type PresentationalTokenUsageScreenProps = UseTokenUsageResult & {
  /** いまのコンテキストの内訳（`hooks/use-context-usage.ts`）。 */
  readonly contextUsage: UseContextUsageResult
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
      </div>

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
        <>
          <Section label="モデル別">
            <ModelTable byModel={props.summary.byModel} />
          </Section>
          <Section label="ツール別">
            <ToolTable byTool={props.summary.byTool} />
          </Section>
        </>
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

type SectionProps = {
  readonly label: string
  readonly children: ReactElement
}

/** 小さな見出しと中身の組（区画そのものは枠を持たない。枠を持つのは中に並ぶ札のほう）。 */
function Section(props: SectionProps): ReactElement {
  return (
    <section className={styles["token-usage-section"]}>
      <h2 className={styles["token-usage-section-label"]}>{props.label}</h2>
      {props.children}
    </section>
  )
}

type ModelTableProps = {
  readonly byModel: readonly ModelUsageTotal[]
}

/** モデル別の表（モデル名の昇順で届く順のまま）。 */
function ModelTable(props: ModelTableProps): ReactElement {
  return (
    <table className={styles["token-usage-table"]}>
      <thead>
        <tr>
          <th scope="col">モデル</th>
          <th scope="col">入力</th>
          <th scope="col">出力</th>
          <th scope="col">読み</th>
          <th scope="col">作成</th>
        </tr>
      </thead>
      <tbody>
        {props.byModel.map((entry) => (
          <tr key={entry.model}>
            <th scope="row" className={styles["token-usage-name"]}>
              {entry.model}
            </th>
            <td>{formatCount(entry.totals.inputTokens)}</td>
            <td>{formatCount(entry.totals.outputTokens)}</td>
            <td>{formatCount(entry.totals.cacheReadInputTokens)}</td>
            <td>{formatCount(entry.totals.cacheCreationInputTokens)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

type ToolTableProps = {
  readonly byTool: readonly ToolUsageCount[]
}

/** ツール別の表（結果の長さの降順で届く順のまま。上位 {@link TOOL_ROWS} 件だけ）。 */
function ToolTable(props: ToolTableProps): ReactElement {
  const shown = props.byTool.slice(0, TOOL_ROWS)
  const rest = props.byTool.length - shown.length

  return (
    <>
      <table className={styles["token-usage-table"]}>
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
              <td>{formatBytes(tool.resultBytes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rest > 0 ? <p className={styles["token-usage-note"]}>{`ほか ${rest} 件`}</p> : null}
    </>
  )
}
