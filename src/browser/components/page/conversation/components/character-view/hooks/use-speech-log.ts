// `<SpeechLog>` のロジック。
// 確定した記録（`SessionRecord`）を並べるだけの形に畳む。
// 開いているかどうかは `useCharacterView` が持つ（開く口が「ログ」と狭い画面の吹き出しの2つあるため）。
//
// 並びは `turnSpeeches` で引き直し、別に溜めない。
// 古い→新しいを上→下に、依頼の区切りとセリフを1本に並べる。
// 開いた直後は並びの下端（最新）へ転がしておく。
//
// 並びを組み立てるのは開いている間だけ（閉じているときに記録が伸びるたびに作り直さない）。
//
// セリフの行を押すとそのセリフの表情へ立ち絵が遡る。
// 留めた状態そのものは `useCharacterView` が持ち（床の立ち絵と状態を共有するため）、ここは `pinnedSpeech` / `onToggleSpeech` として受け取って印と押す口へ写すだけ。

import { useEffect, useRef, type RefObject } from "react"
import { sumBy } from "remeda"

import type {
  RecordTime,
  SessionRecord,
} from "../../../../../../../shared/session/session-record.ts"
import { turnSpeeches, type TurnSpeech } from "../../../../../../../shared/session/turn-speech.ts"
import { useSession } from "../../../../../../stores/session.ts"
import { useTurnSelection } from "../../../../../../stores/turn-selection.ts"
import { localTimeZoneId } from "../../../../../../utils/clock.ts"
import { dayLabel } from "../../../../../../utils/day-label.ts"
import { entryDay, startsNewDay } from "../../../domain/chat-log.ts"
import { recordClockStamp, type ClockStamp } from "../../../domain/clock-stamp.ts"
import {
  isSpeechSelected,
  type MarkedSpeech,
  type PinnedSpeech,
  type SpeechTarget,
} from "../domain/pinned-speech.ts"

/**
 * セリフの古さの段。最新からいくつ前かで決める。
 * `recent`（1つ前）→ `older`（2つ前）→ `oldest`（3つ前から先は全部）の順に薄くなる。薄さの値は `stage/speech-log.css` が持つ。
 */
type SpeechAge = "latest" | "recent" | "older" | "oldest"

/** ログに並べる1行（依頼の区切り、またはセリフ1件）。 */
export type SpeechLogEntry =
  | {
      readonly kind: "request"
      readonly key: string
      /** 依頼の1行目（区切りには1行だけ出す。全文は `requestText` を `title` で読める）。 */
      readonly heading: string
      readonly requestText: string
      readonly time: ClockStamp
      /** 最新のセリフを含むターンの区切りか（そうでない区切りは薄くする）。 */
      readonly current: boolean
    }
  | {
      /** 日が変わるところの区切り。その下に続くセリフの日を出す。 */
      readonly kind: "day"
      readonly key: string
      readonly dateTime: string
      readonly label: string
    }
  | {
      readonly kind: "speech"
      readonly key: string
      readonly text: string
      readonly time: ClockStamp
      readonly age: SpeechAge
      /** 印を付ける行（= 立ち絵が従っている行）か。 */
      readonly selected: boolean
      readonly target: SpeechTarget
    }

/** `<SpeechLog>` が画面に出す形。 */
export type SpeechLogModel = {
  /** 並びを転がす箱に付ける ref。開いた直後に下端（最新）へ転がす。 */
  readonly scrollerRef: RefObject<HTMLElement | null>
  /** 古い→新しい。セリフが1件も無いターンは区切りごと落としてある。 */
  readonly entries: readonly SpeechLogEntry[]
  /**
   * 依頼の区切りの頭に付ける、キャラクターが利用者を呼ぶ言葉（`character.json` の `userCall`）。
   * 呼び名を持たないパックでは `undefined`（区切りは「」だけになる）。
   */
  readonly userCall: string | undefined
  /** セリフの行を押したとき（行の `target` を渡して呼ぶ）。 */
  readonly onToggleSpeech: (turnId: number, index: number) => void
}

export function useSpeechLog(
  open: boolean,
  pinnedSpeech: PinnedSpeech | undefined,
  onToggleSpeech: (turnId: number, index: number) => void,
): SpeechLogModel {
  const records = useSession((session) => session.state.records)
  const userCall = useSession((session) => session.state.character?.userCall)
  const { activeTurnId } = useTurnSelection()
  const scrollerRef = useRef<HTMLElement>(null)

  // 開いた直後に下端（最新）を見せる。
  // この effect は `<Dialog>` の中の `useModalDialog` の effect より後に走る（`<Dialog>` はこの部品の子なので、React は子の effect を親より先に実行する）。
  // 閉じた `<dialog>` は描かれておらず（`display: none`）、`showModal()` の前に測ると高さが 0 で転がらないので、この順が要る。
  useEffect(() => {
    const scroller = scrollerRef.current
    if (open && scroller !== null) {
      scroller.scrollTop = scroller.scrollHeight
    }
  }, [open])

  const markBasis: LogMarkBasis =
    pinnedSpeech !== undefined
      ? { kind: "pinned", ...pinnedSpeech }
      : activeTurnId !== undefined
        ? { kind: "following", turnId: activeTurnId }
        : { kind: "none" }

  return {
    scrollerRef,
    entries: open ? logEntries(records, localTimeZoneId(), markBasis) : [],
    userCall,
    onToggleSpeech,
  }
}

/** 印を付ける行の根拠。`following` は何も留めていないときの、いま表示しているターンの最後の行。 */
type LogMarkBasis =
  | ({ readonly kind: "pinned" } & PinnedSpeech)
  | { readonly kind: "following"; readonly turnId: number }
  | { readonly kind: "none" }

function logEntries(
  records: readonly SessionRecord[],
  timeZone: string,
  markBasis: LogMarkBasis,
): readonly SpeechLogEntry[] {
  const turns = turnSpeeches(records).filter((turn) => turn.speeches.length > 0)
  const requestTimes = requestTimesByTurn(records)
  const speechCount = sumBy(turns, (turn) => turn.speeches.length)
  const lastTurnId = turns.at(-1)?.id
  // セリフを古い側から数えた順に並べた、それぞれの日。日の区切りは隣り合うセリフの日で決める。
  const speechDays = turns.flatMap((turn) =>
    turn.speeches.map((speech) => entryDay(speech.time, timeZone)),
  )
  const marked = markedSpeechOf(markBasis, turns)

  return turns.flatMap((turn, turnIndex) => {
    // このターンの先頭のセリフが、全体の古い側から数えて何件目か。
    const offset = sumBy(turns.slice(0, turnIndex), (earlier) => earlier.speeches.length)
    const requestTime = requestTimes.get(turn.id)
    const time: ClockStamp =
      requestTime === undefined ? { kind: "unknown" } : recordClockStamp(requestTime, timeZone)
    const speeches = turn.speeches.flatMap((speech, index): readonly SpeechLogEntry[] => {
      // セリフはターンの中で末尾へ積むだけなので、ターンの番号と位置がそのまま同一性になる。
      const key = `${String(turn.id)}-${String(index)}`
      const day = speechDays[offset + index] ?? { kind: "none" }
      const previousDay = speechDays[offset + index - 1] ?? { kind: "none" }
      const divider: readonly SpeechLogEntry[] =
        day.kind === "date" && startsNewDay(previousDay, day.date)
          ? [
              {
                kind: "day",
                key: `day-${key}`,
                dateTime: day.date.toString(),
                label: dayLabel(day.date),
              },
            ]
          : []
      return [
        ...divider,
        {
          kind: "speech",
          key: `speech-${key}`,
          text: speech.text,
          time: recordClockStamp(speech.time, timeZone),
          age: speechAge(speechCount - 1 - (offset + index)),
          selected: isSpeechSelected(marked, turn.id, index),
          target: { turnId: turn.id, index },
        },
      ]
    })
    return [...requestEntries(turn, time, turn.id === lastTurnId), ...speeches]
  })
}

function markedSpeechOf(markBasis: LogMarkBasis, turns: readonly TurnSpeech[]): MarkedSpeech {
  switch (markBasis.kind) {
    case "pinned":
      return { kind: "at", turnId: markBasis.turnId, index: markBasis.index }
    case "following": {
      const count = turns.find((turn) => turn.id === markBasis.turnId)?.speeches.length
      return count === undefined
        ? { kind: "none" }
        : { kind: "at", turnId: markBasis.turnId, index: count - 1 }
    }
    case "none":
      return { kind: "none" }
  }
}

/** 依頼の区切り。依頼より前に届いたセリフのまとまり（起動直後の挨拶など）には区切りを置かない。 */
function requestEntries(
  turn: TurnSpeech,
  time: ClockStamp,
  current: boolean,
): readonly SpeechLogEntry[] {
  if (turn.request === undefined) {
    return []
  }
  return [
    {
      kind: "request",
      key: `request-${String(turn.id)}`,
      heading: firstLine(turn.request),
      requestText: turn.request,
      time,
      current,
    },
  ]
}

/** 依頼の時刻をターンの番号で引けるようにする（`TurnSpeech` は時刻を持たない）。 */
function requestTimesByTurn(records: readonly SessionRecord[]): ReadonlyMap<number, RecordTime> {
  return new Map(
    records.flatMap((record): (readonly [number, RecordTime])[] =>
      record.kind === "request" ? [[record.turnId, record.time]] : [],
    ),
  )
}

/** 最新から数えていくつ前か（0 が最新）を、薄さの段に畳む。 */
function speechAge(newerCount: number): SpeechAge {
  if (newerCount === 0) {
    return "latest"
  }
  if (newerCount === 1) {
    return "recent"
  }
  return newerCount === 2 ? "older" : "oldest"
}

/** 依頼の1行目（区切りは1行に切る）。空行だけの依頼は空文字。 */
function firstLine(text: string): string {
  return (text.split("\n").find((candidate) => candidate.trim() !== "") ?? "").trim()
}
