// `<SpeechLog>` のロジック。
// 開いているかどうかを持ち、確定した記録（`SessionRecord`）を並べるだけの形に畳む。
//
// 並びは `turnSpeeches` で引き直し、別に溜めない。
// 古い→新しいを上→下に、依頼の区切りとセリフを1本に並べる。
// 開いた直後は並びの下端（最新）へ転がしておく。
//
// 並びを組み立てるのは開いている間だけ（閉じているときに記録が伸びるたびに作り直さない）。
//
// セリフの行を押すとそのセリフの表情へ立ち絵が遡る。
// 留めた状態そのものは `useCharacterView` が持ち（床の立ち絵と状態を共有するため）、ここは `pinnedSpeech` / `onToggleSpeech` として受け取って印と押す口へ写すだけ。

import { useEffect, useRef, useState, type RefObject } from "react"
import { sumBy } from "remeda"

import type {
  RecordTime,
  SessionRecord,
} from "../../../../../../../../../shared/session/session-state.ts"
import {
  turnSpeeches,
  type TurnSpeech,
} from "../../../../../../../../../shared/session/turn-speech.ts"
import { useSession } from "../../../../../../../../stores/session.ts"
import { useTurnSelection } from "../../../../../../../../stores/turn-selection.ts"
import {
  clockDateTime,
  clockTime,
  localTimeZoneId,
  zonedDateTime,
} from "../../../../../../../../utils/clock.ts"
import { isSpeechSelected, type PinnedSpeech } from "../../../domain/pinned-speech.ts"

/**
 * セリフの古さの段。最新からいくつ前かで決める。
 * `recent`（1つ前）→ `older`（2つ前）→ `oldest`（3つ前から先は全部）の順に薄くなる。薄さの値は `character-view.module.css` が持つ。
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
      /** 印を付ける行（= 立ち絵が従っている行）か。 */
      readonly selected: boolean
      readonly onToggle: () => void
    }

/** `<SpeechLog>` が画面に出す形。 */
export type SpeechLogModel = {
  /** 並びを転がす箱に付ける ref。開いた直後に下端（最新）へ転がす。 */
  readonly scrollerRef: RefObject<HTMLElement | null>
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
}

export function useSpeechLog(
  pinnedSpeech: PinnedSpeech | undefined,
  onToggleSpeech: (turnId: number, index: number) => void,
): SpeechLogModel {
  const records = useSession((session) => session.state.records)
  const userCall = useSession((session) => session.state.character?.userCall)
  const { activeTurnId } = useTurnSelection()
  const [open, setOpen] = useState(false)
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

  return {
    scrollerRef,
    open,
    entries: open
      ? logEntries(records, localTimeZoneId(), activeTurnId, pinnedSpeech, onToggleSpeech)
      : [],
    userCall,
    onOpen: () => setOpen(true),
    onClose: () => setOpen(false),
  }
}

function logEntries(
  records: readonly SessionRecord[],
  timeZone: string,
  activeTurnId: number | undefined,
  pinnedSpeech: PinnedSpeech | undefined,
  onToggleSpeech: (turnId: number, index: number) => void,
): readonly SpeechLogEntry[] {
  const turns = turnSpeeches(records).filter((turn) => turn.speeches.length > 0)
  const requestTimes = requestTimesByTurn(records)
  const speechCount = sumBy(turns, (turn) => turn.speeches.length)
  const lastTurnId = turns.at(-1)?.id
  // 何も留めていないとき、印が付くのは「いま表示しているターン」の最後の行。
  const activeSpeechCount = turns.find((turn) => turn.id === activeTurnId)?.speeches.length
  const defaultIndex = activeSpeechCount === undefined ? undefined : activeSpeechCount - 1

  return turns.flatMap((turn, turnIndex) => {
    // このターンの先頭のセリフが、全体の古い側から数えて何件目か。
    const offset = sumBy(turns.slice(0, turnIndex), (earlier) => earlier.speeches.length)
    const requestTime = requestTimes.get(turn.id)
    const time: SpeechLogTime =
      requestTime === undefined ? { kind: "unknown" } : logTime(requestTime, timeZone)
    const speeches = turn.speeches.map((speech, index): SpeechLogEntry => ({
      kind: "speech",
      // セリフはターンの中で末尾へ積むだけなので、ターンの番号と位置がそのまま同一性になる。
      key: `speech-${String(turn.id)}-${String(index)}`,
      text: speech.text,
      age: speechAge(speechCount - 1 - (offset + index)),
      selected: isSpeechSelected(pinnedSpeech, turn.id, index, activeTurnId, defaultIndex),
      onToggle: () => {
        onToggleSpeech(turn.id, index)
      },
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
