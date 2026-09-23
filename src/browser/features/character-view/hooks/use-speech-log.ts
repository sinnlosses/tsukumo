// `<SpeechLog>` のロジック（docs/design.md 2章「機能の中を分ける」の container / presenter）。
// 開いているかどうかを持ち、それを `<dialog>` の DOM へ写し、確定した記録（`SessionRecord`）を
// **並べるだけの形**に畳む。
//
// 並びは `turnSpeeches` で引き直す — 過去のターンのタブを選んだときに吹き出しを遡らせるのと
// 同じ材料で、別に溜めない。**新しいターンを上に置く**（開いてすぐ直近が読め、スクロールの
// 位置を合わせる仕掛けが要らない）。ターンの中は言った順のまま。
//
// **並びを組み立てるのは開いている間だけ**（閉じているときに記録が伸びるたびに作り直さない）。

import { useState, type MouseEvent, type RefObject } from "react"

import { type SessionRecord } from "../../../../shared/session-state.ts"
import { turnSpeeches } from "../../../../shared/turn-speech.ts"
import { useModalDialog } from "../../../hooks/use-modal-dialog.ts"
import { useSessionSelector } from "../../../stores/session.tsx"

/** 依頼より前に届いたセリフのまとまりの見出し（起動直後の挨拶など）。 */
const PRE_REQUEST_HEADING = "（依頼の前）"

/** ログに並べる1ターン。 */
export type SpeechLogTurn = {
  readonly id: number
  /** 見出しに出す1行（依頼の1行目。依頼が無いまとまりは {@link PRE_REQUEST_HEADING}）。 */
  readonly heading: string
  /**
   * 見出しに添える全文（`<p title={...}>` にそのまま渡す）。**依頼が無いまとまりでは付けない**
   * ので `undefined`（`title` の型が React 側で `string | undefined` なのに合わせた形）。
   */
  readonly requestText: string | undefined
  /** そのターンのセリフ（言った順）。 */
  readonly speeches: readonly string[]
}

/** `<SpeechLog>` が画面に出す形。 */
export type SpeechLogModel = {
  /** `<dialog>` に付ける ref。開閉はこのフックが DOM へ写す。 */
  readonly ref: RefObject<HTMLDialogElement | null>
  /** 新しいターンが先頭。セリフが1件も無いターンは落としてある。 */
  readonly turns: readonly SpeechLogTurn[]
  readonly onOpen: () => void
  readonly onClose: () => void
  /** 枠の外（backdrop）を押したら閉じる読み替え。 */
  readonly onDialogClick: (event: MouseEvent<HTMLDialogElement>) => void
}

export function useSpeechLog(): SpeechLogModel {
  const records = useSessionSelector((session) => session.state.records)
  const [open, setOpen] = useState(false)
  const dialogRef = useModalDialog(open)

  return {
    ref: dialogRef,
    turns: open ? logTurns(records) : [],
    onOpen: () => setOpen(true),
    onClose: () => setOpen(false),
    onDialogClick: (event) => {
      // 枠の外（backdrop）を押したら閉じる。中身を押したときは target が子要素になる。
      if (event.target === event.currentTarget) {
        setOpen(false)
      }
    },
  }
}

function logTurns(records: readonly SessionRecord[]): readonly SpeechLogTurn[] {
  return turnSpeeches(records)
    .filter((turn) => turn.speeches.length > 0)
    .toReversed()
    .map((turn) => ({
      id: turn.id,
      heading: firstLine(turn.request) ?? PRE_REQUEST_HEADING,
      requestText: turn.request,
      speeches: turn.speeches,
    }))
}

/** 依頼の1行目（見出しは1行に切る。全文は `title` で読める）。空なら undefined。 */
function firstLine(text: string | undefined): string | undefined {
  const line = text?.split("\n").find((candidate) => candidate.trim() !== "")
  return line === undefined ? undefined : line.trim()
}
