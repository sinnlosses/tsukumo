// トークン消費の画面の器（docs/design.md 2章「機能の中を分ける」）。フックも算出も持たず、
// 受け取った集計をそのまま置く。取得と期間の選択は `hooks/use-token-usage.ts`。
//
// **数そのものを読ませたいところは表、大小と傾きを見せたいところはグラフ**。モード別
// （仕事/雑談）と1ターンあたりの中央値は、見ても減らす手が変わらないので出さない。
//
// **画面に会話の文面は出ない**（集計にそもそも文面が入っていない。
// `src/shared/token-usage-summary.ts`）。

import { type ReactElement } from "react"

import {
  TOKEN_USAGE_DAYS_CHOICES,
  type ModelUsageTotal,
  type TokenUsageDays,
  type TokenUsageSummary,
  type TokenUsageTotals,
} from "../../../shared/token-usage-summary.ts"
import { type ToolUsageCount } from "../../../shared/token-usage.ts"
import { DailyUsageChart } from "./daily-usage-chart.tsx"
import styles from "./token-usage.module.css"
import { formatBytes, formatCount } from "./usage-format.ts"

/** 記録が1件も無い期間の一言（**空でも壊れない**。表もグラフも出さずこれだけ）。 */
const EMPTY_NOTE = "この期間の記録はまだ無い"

/** 集計を取れなかったときの一言（記録が無いときと区別する）。 */
const FAILED_NOTE = "集計を取れなかった"

/**
 * ツール別に並べる件数。**上から数件で「何が文脈を食ったか」は分かる**ので、全部は出さずに
 * 残りの件数だけを添える（数十種類が並ぶと表の意味が薄れる）。
 */
const TOOL_ROWS = 10

export type PresentationalTokenUsageScreenProps = {
  readonly days: TokenUsageDays
  readonly onDaysChange: (days: TokenUsageDays) => void
  readonly summary: TokenUsageSummary
  readonly total: TokenUsageTotals
  readonly isError: boolean
}

export function PresentationalTokenUsageScreen(
  props: PresentationalTokenUsageScreenProps,
): ReactElement {
  return (
    <div className={styles["token-usage"]}>
      <div className={styles["token-usage-bar"]}>
        <h1 className={styles["token-usage-title"]}>トークン消費</h1>
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
              {choice}日
            </button>
          ))}
        </div>
      </div>

      <dl className={styles["token-usage-total"]}>
        <Figure label="入力" value={formatCount(props.total.inputTokens)} />
        <Figure label="出力" value={formatCount(props.total.outputTokens)} />
        <Figure label="キャッシュ読み" value={formatCount(props.total.cacheReadInputTokens)} />
        <Figure label="キャッシュ作成" value={formatCount(props.total.cacheCreationInputTokens)} />
      </dl>

      {props.isError ? <p className={styles["token-usage-note"]}>{FAILED_NOTE}</p> : null}
      {!props.isError && props.summary.byDay.length === 0 ? (
        <p className={styles["token-usage-note"]}>{EMPTY_NOTE}</p>
      ) : null}

      {props.summary.byDay.length === 0 ? null : (
        <>
          <Section label="日ごと">
            <DailyUsageChart byDay={props.summary.byDay} />
          </Section>
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

type FigureProps = {
  readonly label: string
  readonly value: string
}

/** 期間の合計を1つ。**字の大きさで主従を付ける**（数が主、見出しは小さく静かに）。 */
function Figure(props: FigureProps): ReactElement {
  return (
    <div className={styles["token-usage-figure"]}>
      <dt className={styles["token-usage-figure-label"]}>{props.label}</dt>
      <dd className={styles["token-usage-figure-value"]}>{props.value}</dd>
    </div>
  )
}

type SectionProps = {
  readonly label: string
  readonly children: ReactElement
}

/** 小さな見出しと中身の組（枠は持たない。`docs/design.md` 13.1 原則2）。 */
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
