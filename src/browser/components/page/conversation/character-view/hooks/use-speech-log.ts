// `<SpeechLog>` のロジック（docs/design.md 2章「機能の中を分ける」の container / presenter）。
// 開いているかどうかを持ち、それを `<dialog>` の DOM へ写し、確定した記録（`SessionRecord`）を
// **並べるだけの形**に畳む。
//
// 並びは `turnSpeeches` で引き直す — 過去のターンのタブを選んだときに吹き出しを遡らせるのと
// 同じ材料で、別に溜めない。**古い→新しいを上→下**に、依頼の区切りとセリフを1本に並べる
// （キャラビューの吹き出しの並びをそのまま上へ伸ばした形。docs/display.md 4.2）。
// 開いた直後は並びの下端（最新）へ転がしておく。
//
// **並びを組み立てるのは開いている間だけ**（閉じているときに記録が伸びるたびに作り直さない）。

import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react"
import { sumBy } from "remeda"

import { type RecordTime, type SessionRecord } from "../../../../../../shared/session-state.ts"
import { turnSpeeches, type TurnSpeech } from "../../../../../../shared/turn-speech.ts"
import { useModalDialog } from "../../../../../hooks/use-modal-dialog.ts"
import { useSessionSelector } from "../../../../../stores/session.tsx"
import {
  clockDateTime,
  clockTime,
  localTimeZoneId,
  zonedDateTime,
} from "../../../../../utils/clock.ts"

/**
 * セリフの古さの段。**最新からいくつ前か**で決め、`recent`（1つ前）→ `older`（2つ前）→
 * `oldest`（3つ前から先は全部）の順に薄くなる。薄さの値は CSS が持つ（`character-view.module.css`）。
 */
export type SpeechAge = "latest" | "recent" | "older" | "oldest"

/** 依頼の区切りに添える時刻。記録に時刻が無い（組み直した）依頼には付けない。 */
export type SpeechLogTime =
  | { readonly kind: "known"; readonly dateTime: string; readonly text: string }
  | { readonly kind: "unknown" }

/** ログに並べる1行（依頼の区切り、またはセリフ1件）。 */
export type SpeechLogEntry =
  | {
      readonly kind: "request"
      readonly key: string
      /** 依頼の1行目（区切りには1行だけ出す。全文は `requestText` を `title` で読める）。 */
      readonly heading: string
      readonly requestText: string
      readonly time: SpeechLogTime
      /** 最新のセリフを含むターンの区切りか（そうでない区切りは薄くする）。 */
      readonly current: boolean
    }
  | {
      readonly kind: "speech"
      readonly key: string
      readonly text: string
      readonly age: SpeechAge
    }

/** `<SpeechLog>` が画面に出す形。 */
export type SpeechLogModel = {
  /** `<dialog>` に付ける ref。開閉はこのフックが DOM へ写す。 */
  readonly ref: RefObject<HTMLDialogElement | null>
  /** 並びを転がす箱に付ける ref。開いた直後に下端（最新）へ転がす。 */
  readonly scrollerRef: RefObject<HTMLDivElement | null>
  readonly open: boolean
  /** 古い→新しい。セリフが1件も無いターンは区切りごと落としてある。 */
  readonly entries: readonly SpeechLogEntry[]
  /**
   * 依頼の区切りの頭に付ける、キャラクターが利用者を呼ぶ言葉（`character.json` の `userCall`）。
   * 呼び名を持たないパックでは `undefined`（区切りは「」だけになる）。
   */
  readonly userCall: string | undefined
  readonly onOpen: () => void
  readonly onClose: () => void
  /** 枠の外（backdrop）を押したら閉じる読み替え。 */
  readonly onDialogClick: (event: MouseEvent<HTMLDialogElement>) => void
}

export function useSpeechLog(): SpeechLogModel {
  const records = useSessionSelector((session) => session.state.records)
  const userCall = useSessionSelector((session) => session.state.character?.userCall)
  const [open, setOpen] = useState(false)
  const dialogRef = useModalDialog(open)
  const scrollerRef = useRef<HTMLDivElement>(null)

  // 開いた直後に下端（最新）を見せる（`scrollTop` は React の外にある状態への書き込み）。
  // **`useModalDialog` の effect より後に宣言する** — 閉じた `<dialog>` は描かれておらず
  // （`display: none`）、`showModal()` の前に測ると高さが 0 で転がらない。
  useEffect(() => {
    const scroller = scrollerRef.current
    if (open && scroller !== null) {
      scroller.scrollTop = scroller.scrollHeight
    }
  }, [open])

  return {
    ref: dialogRef,
    scrollerRef,
    open,
    entries: open ? logEntries(records, localTimeZoneId()) : [],
    userCall,
    onOpen: () => setOpen(true),
    onClose: () => setOpen(false),
    onDialogClick: (event) => {
      // 枠の外（backdrop）を押したら閉じる。枠の中は `.speech-log-stage` が覆っているので、
      // 中を押したときの target は必ず子要素になる。
      if (event.target === event.currentTarget) {
        setOpen(false)
      }
    },
  }
}

function logEntries(
  records: readonly SessionRecord[],
  timeZone: string,
): readonly SpeechLogEntry[] {
  const turns = turnSpeeches(records).filter((turn) => turn.speeches.length > 0)
  const requestTimes = requestTimesByTurn(records)
  const speechCount = sumBy(turns, (turn) => turn.speeches.length)
  const lastTurnId = turns.at(-1)?.id

  return turns.flatMap((turn, turnIndex) => {
    // このターンの先頭のセリフが、全体の古い側から数えて何件目か。
    const offset = sumBy(turns.slice(0, turnIndex), (earlier) => earlier.speeches.length)
    const requestTime = requestTimes.get(turn.id)
    const time: SpeechLogTime =
      requestTime === undefined ? { kind: "unknown" } : logTime(requestTime, timeZone)
    const speeches = turn.speeches.map((text, index): SpeechLogEntry => ({
      kind: "speech",
      // セリフはターンの中で末尾へ積むだけなので、ターンの番号と位置がそのまま同一性になる。
      key: `speech-${String(turn.id)}-${String(index)}`,
      text,
      age: speechAge(speechCount - 1 - (offset + index)),
    }))
    return [...requestEntries(turn, time, turn.id === lastTurnId), ...speeches]
  })
}

/** 依頼の区切り。依頼より前に届いたセリフのまとまり（起動直後の挨拶など）には区切りを置かない。 */
function requestEntries(
  turn: TurnSpeech,
  time: SpeechLogTime,
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

/** 区切りの時刻（`HH:MM`。秒は出さない）。組み直した依頼は時刻が分からない。 */
function logTime(time: RecordTime, timeZone: string): SpeechLogTime {
  if (time.kind !== "stamped") {
    return { kind: "unknown" }
  }
  const at = zonedDateTime(time.at, timeZone)
  return { kind: "known", dateTime: clockDateTime(at), text: clockTime(at) }
}

/** 依頼の1行目（区切りは1行に切る）。空行だけの依頼は空文字。 */
function firstLine(text: string): string {
  return (text.split("\n").find((candidate) => candidate.trim() !== "") ?? "").trim()
}
