// 会話の流れの中の、投稿（右寄せ）・セリフ（左寄せ）・段の札。
// 依頼は依頼の塊（札と地の文）、補足は文面と添えた画像を投稿にする。

import clsx from "clsx"
import type { ReactElement, ReactNode } from "react"

import type { TaskSummaryResult } from "../../../../../../shared/repository/task-summary.ts"
import type { MainViewTurn } from "../../../../../../shared/session/main-view-shape.ts"
import { currentPhaseOf } from "../../../../../../shared/session/work-plan.ts"
import { MapBoxBadge } from "../../../../../features/architecture-map/map-box-badge.tsx"
import { splitMapBoxMention } from "../../../../../features/architecture-map/map-box-mention.ts"
import { localTimeZoneId } from "../../../../../utils/clock.ts"
import { Text } from "../../../../ui/text/text.tsx"
import { recordClockStamp, type ClockStamp } from "../../domain/clock-stamp.ts"
import { useViewedSpeech } from "../../stores/viewed-speech.ts"
import { PromptImageThumbnails } from "../prompt-image/prompt-image.tsx"
import { StreamPostRow, StreamSpeechRow, StreamTyping } from "../stream-row/stream-row.tsx"
import type { ProgressItem, StreamItem } from "./domain/stream-item-list.ts"
import { USER_SPEAKER_NAME, type RowPresentation } from "./domain/stream-presentation.ts"
import type { VoiceSlot } from "./domain/voice-slot.ts"
import { useArrivingBubble } from "./hooks/use-arriving-bubble.ts"
import styles from "./main-view.module.css"
import { RequestBlock } from "./request-block.tsx"
import { StreamAim } from "./stream-aim.tsx"

type PostRowProps = {
  readonly turn: MainViewTurn
  readonly tasks: TaskSummaryResult
  readonly row: Extract<StreamItem, { readonly kind: "post" }>
  readonly presentation: RowPresentation
}

/** 右寄せの投稿。 */
export function PostRow(props: PostRowProps): ReactElement {
  const { row, turn } = props
  const aside = row.record.kind === "aside" ? splitMapBoxMention(row.record.text) : undefined
  const asideBadge = aside?.badge
  const asideText = aside?.rest
  return (
    <StreamPostRow
      time={clockOf(row.at)}
      speakerName={USER_SPEAKER_NAME}
      className={styles["stream-post"] ?? ""}
    >
      {row.record.kind === "aside" ? (
        <>
          {asideBadge !== undefined && <MapBoxBadge badge={asideBadge} />}
          {asideText}
          <PromptImageThumbnails images={row.record.images} />
        </>
      ) : (
        turn.request !== undefined && <RequestBlock request={turn.request} tasks={props.tasks} />
      )}
    </StreamPostRow>
  )
}

/**
 * 左寄せのセリフ・反応。押すと立ち絵がそのセリフの表情になる。
 * 尾の付いている行（留めた行か、留めていないときの最新の行）を押すと最新へ戻る。
 * 狭い画面では隠す（セリフは吹き出しが持つ）。
 */
export function SayRow(props: {
  readonly row: Extract<StreamItem, { readonly kind: "say" }>
  readonly turnId: number
  readonly presentation: RowPresentation
  readonly speakerName: string
}): ReactElement {
  const toggle = useViewedSpeech((state) => state.toggle)
  const release = useViewedSpeech((state) => state.release)
  return (
    <StreamSpeechRow
      text={props.row.record.text}
      mapBadges
      time={clockOf(props.row.at)}
      liveness={props.presentation.liveness}
      aim={props.presentation.followed ? <StreamAim /> : undefined}
      speakerName={props.speakerName}
      selected={props.presentation.pinned}
      pop={false}
      {...(props.presentation.arrival === undefined ? {} : { arrival: props.presentation.arrival })}
      onToggle={() => {
        if (props.presentation.followed) {
          release()
        } else {
          toggle(props.turnId, props.row.speechIndex)
        }
      }}
      onRelease={release}
      className={styles["phone-hidden"] ?? ""}
    />
  )
}

/**
 * 声の帯に出す迎える反応（迎えの挨拶・おかえり）。流れのセリフの行と同じ部品で、いまの一言として明るくする。
 * 押すと最新へ戻る（帯の迎える反応は留める先にしない）。別の行を留めているあいだは落ち着いた面にして尾を付けない。
 * 書いている途中は「…」を出す。
 */
export function VoiceSlotRow(props: {
  readonly voice: VoiceSlot
  readonly speakerName: string
}): ReactNode {
  const pinned = useViewedSpeech((state) => state.viewed.kind === "pinned")
  const release = useViewedSpeech((state) => state.release)
  const arriving = useArrivingBubble()
  const { voice } = props
  if (voice.kind === "writing") {
    return <StreamTyping />
  }
  if (voice.kind !== "voice") {
    return undefined
  }
  return (
    <StreamSpeechRow
      text={voice.text}
      mapBadges
      time={recordClockStamp(voice.time, localTimeZoneId())}
      liveness={pinned ? "plain" : "live"}
      aim={pinned ? undefined : <StreamAim />}
      speakerName={props.speakerName}
      selected={false}
      pop={false}
      {...(!pinned && arriving.kind === "arriving" ? { arrival: arriving.bubble } : {})}
      onToggle={release}
      className=""
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
