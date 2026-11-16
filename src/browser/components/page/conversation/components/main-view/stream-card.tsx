// 会話の流れの中の、投稿（右寄せ）・セリフ（左寄せ）・段の札。
// 依頼は依頼の塊（札と地の文）、補足は文面と添えた画像を投稿にする。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { TaskSummaryResult } from "../../../../../../shared/repository/task-summary.ts"
import type { MainViewTurn } from "../../../../../../shared/session/main-view-shape.ts"
import { currentPhaseOf } from "../../../../../../shared/session/work-plan.ts"
import { localTimeZoneId } from "../../../../../utils/clock.ts"
import { Text } from "../../../../ui/text/text.tsx"
import { recordClockStamp, type ClockStamp } from "../../domain/clock-stamp.ts"
import { PromptImageThumbnails } from "../prompt-image/prompt-image.tsx"
import { StreamPostRow, StreamSpeechRow } from "../stream-row/stream-row.tsx"
import type { ProgressItem, StreamItem } from "./domain/stream-item-list.ts"
import { USER_SPEAKER_NAME, type RowPresentation } from "./domain/stream-presentation.ts"
import styles from "./main-view.module.css"
import { RequestBlock } from "./request-block.tsx"

type PostRowProps = {
  readonly turn: MainViewTurn
  readonly tasks: TaskSummaryResult
  readonly row: Extract<StreamItem, { readonly kind: "post" }>
  readonly presentation: RowPresentation
}

/** 右寄せの投稿。 */
export function PostRow(props: PostRowProps): ReactElement {
  const { row, turn } = props
  return (
    <StreamPostRow
      time={clockOf(row.at)}
      timeShown={props.presentation.timeShown}
      speakerName={USER_SPEAKER_NAME}
      className={styles["stream-post"] ?? ""}
    >
      {row.record.kind === "aside" ? (
        <>
          {row.record.text}
          <PromptImageThumbnails images={row.record.images} size="compact" />
        </>
      ) : (
        turn.request !== undefined && <RequestBlock request={turn.request} tasks={props.tasks} />
      )}
    </StreamPostRow>
  )
}

/** 左寄せのセリフ・反応。押せない。狭い画面では隠す（セリフは吹き出しが持つ）。 */
export function SayRow(props: {
  readonly row: Extract<StreamItem, { readonly kind: "say" }>
  readonly presentation: RowPresentation
  readonly speakerName: string
}): ReactElement {
  return (
    <StreamSpeechRow
      text={props.row.record.text}
      time={clockOf(props.row.at)}
      timeShown={props.presentation.timeShown}
      liveness={props.presentation.liveness}
      speakerName={props.speakerName}
      selected={false}
      pop={false}
      className={styles["phone-hidden"] ?? ""}
    />
  )
}

/** 離れていたあいだに足された行の手前の線。固定の文で、キャラクターのセリフにしない。 */
export function AwaySeamLine(props: { readonly label: string }): ReactElement {
  return (
    <div role="separator" className={styles["away-seam"]} data-away-seam="">
      <Text
        element="span"
        size="label"
        tone="ink-quiet"
        weight="inherit"
        className={styles["away-seam-text"]}
      >
        <span className={styles["away-seam-lead"]}>ここから新しい</span>
        {props.label}
      </Text>
    </div>
  )
}

type PlanRecord = Extract<ProgressItem, { readonly kind: "plan" }>["record"]

/** 段の札。ワークプランの記録が指す、そのとき走っている段。 */
export function PlanCard(props: { readonly record: PlanRecord }): ReactElement {
  return (
    <div className={clsx(styles["stream-plan"], styles["phone-hidden"])}>
      <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
        {planLabel(props.record)}
      </Text>
    </div>
  )
}

function clockOf(at?: number): ClockStamp {
  return at === undefined
    ? { kind: "unknown" }
    : recordClockStamp({ kind: "stamped", at }, localTimeZoneId())
}

function planLabel(record: PlanRecord): string {
  const phase = currentPhaseOf({ ...record, kind: "planned" })
  const first = phase.kind === "phase" ? phase.indexes.at(0) : undefined
  if (phase.kind !== "phase" || first === undefined) {
    return "段が済んだ"
  }
  return `段 ${String(first + 1)}/${String(phase.count)} ${phase.name}`
}
