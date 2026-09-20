// サイドバーの「いま何をしているか」。**実行中が先（普通の色）、直近の完了がその下（薄い色）**
// （docs/requirements.md 4.2 の決定）。両方空のときだけ空であることを出す。
//
// **失敗したツールの引数と出力を読める場所はここだけ**（レポートには出さない。2026-09-15 決定）。
// 印を付けるだけで中身を捨てると、エラーの内容がどこからも読めなくなるので、同じ行から
// `<details>` で開けるようにする。

import { type ReactElement } from "react"

import { type ToolActivity } from "../../../shared/session-state.ts"
import { summarizeToolInput } from "../../lib/tool-summary.ts"
import styles from "./sidebar.module.css"

// ツールの入力・出力は数十KBになることがある（実測: あるツールの --json 出力が170KB）。
// 切り詰めは表示を壊さないためであって秘匿のためではないので、切り詰めた旨だけ添えて残りは捨てる。
const MAX_TOOL_TEXT_LENGTH = 8000

export type ActivityProps = {
  /** 実行中のツール（新しい順）。 */
  readonly running: readonly ToolActivity[]
  /** 直近に使い終えたツール（新しい順）。 */
  readonly finished: readonly ToolActivity[]
}

export function Activity(props: ActivityProps): ReactElement {
  if (props.running.length === 0 && props.finished.length === 0) {
    return <p className={styles["sidebar-empty"]}>いま動いているツールは無い</p>
  }

  return (
    <ul className={styles["sidebar-list"]}>
      {props.running.map((activity) => (
        <ActivityItem key={activity.toolUseId} activity={activity} finished={false} />
      ))}
      {props.finished.map((activity) => (
        <ActivityItem key={activity.toolUseId} activity={activity} finished={true} />
      ))}
    </ul>
  )
}

/**
 * 実行中・完了1件分。**サブエージェントの中（`nested`）は1段下げて出す。** 要約は
 * `summarizeToolInput`（shared。許可要求の要約と同じ関数。同じ概念を2箇所で別に決めない）。
 * **失敗した回は印を付け、引数と出力を畳んで添える**（{@link FailureDetail}）。
 */
function ActivityItem(props: {
  readonly activity: ToolActivity
  readonly finished: boolean
}): ReactElement {
  const summary = summarizeToolInput(props.activity.name, props.activity.input)
  const label = summary === "" ? props.activity.name : `${props.activity.name}: ${summary}`
  const { failureOutput } = props.activity
  const classes = [
    styles["activity-item"],
    props.finished ? styles["activity-finished"] : styles["activity-running"],
    props.activity.nested ? styles["activity-nested"] : "",
    failureOutput === undefined ? "" : styles["activity-failed"],
  ]
    .filter((name) => name !== undefined && name !== "")
    .join(" ")

  return (
    <li className={classes}>
      {failureOutput === undefined ? (
        label
      ) : (
        <FailureDetail label={label} input={props.activity.input} output={failureOutput} />
      )}
    </li>
  )
}

/**
 * 失敗した回の中身（引数と出力）。**「失敗」の文字を印にする**（色だけで意味を伝えない。
 * docs/design.md 13.1 原則5）。閉じている間はいつもの1行と同じ高さで、開くと中身が出る。
 */
function FailureDetail(props: {
  readonly label: string
  readonly input: unknown
  readonly output: string
}): ReactElement {
  return (
    <details className={styles["activity-failure"]}>
      <summary>
        <span className={styles["activity-failure-mark"]}>失敗</span> {props.label}
      </summary>
      {/* 出力が先。開いてまず読みたいのは「何が起きたか」で、引数はその裏取りに使う。 */}
      <pre className={styles["activity-failure-output"]}>
        <code>{truncateForDisplay(props.output)}</code>
      </pre>
      <pre className={styles["activity-failure-input"]}>
        <code>{truncateForDisplay(stringifyToolInput(props.input))}</code>
      </pre>
    </details>
  )
}

/** ツールの入力（`unknown`。SDK のイベントから来た JSON 値）を、読める形の文字列にする。 */
function stringifyToolInput(input: unknown): string {
  if (input === undefined) {
    return ""
  }

  const json = JSON.stringify(input, null, 2)
  return json ?? String(input)
}

/**
 * 表示を壊さない程度に文字列を切り詰める（`docs/requirements.md`「切り詰めは表示のためであって
 * 秘匿のためではない」）。上限を超えた分は捨てて、落とした文字数だけを添える。
 */
function truncateForDisplay(text: string): string {
  if (text.length <= MAX_TOOL_TEXT_LENGTH) {
    return text
  }

  const omitted = text.length - MAX_TOOL_TEXT_LENGTH
  return `${text.slice(0, MAX_TOOL_TEXT_LENGTH)}\n…（以下 ${String(omitted)} 文字を省略）`
}
