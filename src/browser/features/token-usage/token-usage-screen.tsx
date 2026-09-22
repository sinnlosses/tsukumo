// トークン消費の画面（`#token-usage`。会話の画面と入れ替わる別の画面で、常駐の3領域には
// 混ぜない）。**何を減らすかを決めるため**の画面なので、出すのは判断が変わる3つだけ:
//
// - **日ごとの推移**（グラフ）: どの日が重かったか・何が膨らんだか
// - **モデル別**（表）: どのモデルに費用が寄っているか
// - **ツール別**（表）: どのツールの結果が文脈を食っているか
//
// **数そのものを読ませたいところは表、大小と傾きを見せたいところはグラフ**。モード別
// （仕事/雑談）と1ターンあたりの中央値は、見ても減らす手が変わらないので出さない。
//
// **画面に会話の文面は出ない**（集計にそもそも文面が入っていない。
// `src/shared/token-usage-summary.ts`）。
//
// **入る口も会話へ戻る口も、全画面の最上部の帯**（`features/screen-nav/`。13.9）にある
// （2026-09-22 まではこの画面の左上に戻る口があり、入る口は hash の直打ちだけだった）。
// **期間の既定は7日**で、30日にも切り替えられる（`src/shared/token-usage-summary.ts`）。

import { useQuery } from "@tanstack/react-query"
import { useState, type ReactElement } from "react"

import { SESSION_TOKEN_QUERY_NAME } from "../../../shared/session-socket.ts"
import {
  DEFAULT_TOKEN_USAGE_DAYS,
  EMPTY_TOKEN_USAGE_SUMMARY,
  readTokenUsageSummary,
  TOKEN_USAGE_DAYS_CHOICES,
  TOKEN_USAGE_DAYS_QUERY_NAME,
  TOKEN_USAGE_SUMMARY_PATH,
  type ModelUsageTotal,
  type TokenUsageDays,
  type TokenUsageSummary,
} from "../../../shared/token-usage-summary.ts"
import { type ToolUsageCount } from "../../../shared/token-usage.ts"
import { DailyUsageChart } from "./daily-usage-chart.tsx"
import styles from "./token-usage.module.css"
import { formatBytes, formatCost, formatCount, totalUsage } from "./usage-format.ts"

/** 記録が1件も無い期間の一言（**空でも壊れない**。表もグラフも出さずこれだけ）。 */
const EMPTY_NOTE = "この期間の記録はまだ無い"

/** 集計を取れなかったときの一言（記録が無いときと区別する）。 */
const FAILED_NOTE = "集計を取れなかった"

/**
 * ツール別に並べる件数。**上から数件で「何が文脈を食ったか」は分かる**ので、全部は出さずに
 * 残りの件数だけを添える（数十種類が並ぶと表の意味が薄れる）。
 */
const TOOL_ROWS = 10

export function TokenUsageScreen(): ReactElement {
  const [days, setDays] = useState<TokenUsageDays>(DEFAULT_TOKEN_USAGE_DAYS)
  const query = useQuery({
    queryKey: ["token-usage", days],
    queryFn: () => fetchTokenUsageSummary(days),
    // 開くたびに取り直す（読んでいる間にも増えていくので、前に開いたときの数を見せない）。
    staleTime: 0,
  })
  // 「まだ届いていない」も「取れなかった」も、描く側から見れば空の集計（`| undefined` を
  // 内側へ運ばない）。取れなかったことは下の一言で区別する。
  const summary = query.data ?? EMPTY_TOKEN_USAGE_SUMMARY
  const total = totalUsage(summary.byModel)

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
              aria-pressed={choice === days}
              onClick={() => {
                setDays(choice)
              }}
            >
              {choice}日
            </button>
          ))}
        </div>
      </div>

      <dl className={styles["token-usage-total"]}>
        <Figure label="費用" value={formatCost(total.costUsd)} />
        <Figure label="入力" value={formatCount(total.inputTokens)} />
        <Figure label="出力" value={formatCount(total.outputTokens)} />
        <Figure label="キャッシュ読み" value={formatCount(total.cacheReadInputTokens)} />
        <Figure label="キャッシュ作成" value={formatCount(total.cacheCreationInputTokens)} />
      </dl>

      {query.isError ? <p className={styles["token-usage-note"]}>{FAILED_NOTE}</p> : null}
      {!query.isError && summary.byDay.length === 0 ? (
        <p className={styles["token-usage-note"]}>{EMPTY_NOTE}</p>
      ) : null}

      {summary.byDay.length === 0 ? null : (
        <>
          <Section label="日ごと">
            <DailyUsageChart byDay={summary.byDay} />
          </Section>
          <Section label="モデル別">
            <ModelTable byModel={summary.byModel} />
          </Section>
          <Section label="ツール別">
            <ToolTable byTool={summary.byTool} />
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

/** モデル別の表（モデル名の昇順で届く順のまま）。**費用を左から2列目**に置く。 */
function ModelTable(props: ModelTableProps): ReactElement {
  return (
    <table className={styles["token-usage-table"]}>
      <thead>
        <tr>
          <th scope="col">モデル</th>
          <th scope="col">費用</th>
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
            <td>{formatCost(entry.totals.costUsd)}</td>
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

/**
 * 集計を取りに行く。**配られない形だったときは空の集計**（`readTokenUsageSummary`）。403 や
 * 落ちた応答は例外にせず `response.ok` で分けて、取れなかったことは画面の一言で伝える。
 */
async function fetchTokenUsageSummary(days: TokenUsageDays): Promise<TokenUsageSummary> {
  const response = await fetch(tokenUsageSummaryUrl(days))
  if (!response.ok) {
    throw new Error(String(response.status))
  }
  return readTokenUsageSummary(await response.json())
}

/**
 * 集計の URL。**起動トークンを付ける**（`/repository-file` と同じ守り方で、値は今開いている
 * ページの URL から引く）。
 */
function tokenUsageSummaryUrl(days: TokenUsageDays): string {
  const token = new URL(window.location.href).searchParams.get(SESSION_TOKEN_QUERY_NAME) ?? ""
  const query = new URLSearchParams({
    [SESSION_TOKEN_QUERY_NAME]: token,
    [TOKEN_USAGE_DAYS_QUERY_NAME]: String(days),
  })
  return `${TOKEN_USAGE_SUMMARY_PATH}?${query.toString()}`
}
