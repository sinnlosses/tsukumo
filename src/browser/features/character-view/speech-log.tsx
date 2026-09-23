// セリフのログ（<SpeechLog>）。キャラビューの右上の「ログ」から開くモーダルで、**このセッションで
// 言ったセリフをターンごとに並べる**。吹き出しは今のターンのぶんしか出さない（前のターンの最後の
// 1件だけ残す。docs/requirements.md 4.2）ので、流れていったセリフを読み返す口はここになる。
//
// 並びは確定した記録（`SessionRecord`）から `turnSpeeches` で引き直す — 過去のターンのタブを
// 選んだときに吹き出しを遡らせるのと同じ材料で、別に溜めない。**新しいターンを上に置く**
// （開いてすぐ直近が読め、スクロールの位置を合わせる仕掛けが要らない）。ターンの中は
// 言った順のまま。
//
// **並びを組み立てるのは開いている間だけ**（閉じているときに記録が伸びるたびに作り直さない）。
// `<dialog>` は top layer に出るので、キャラビューの `overflow` には切り取られない。

import { useState, type ReactElement } from "react"

import { turnSpeeches } from "../../../shared/turn-speech.ts"
import { useModalDialog } from "../../hooks/use-modal-dialog.ts"
import { useSessionSelector } from "../../stores/session.tsx"
import styles from "./character-view.module.css"

const OPEN_LABEL = "ログ"
const HEADING = "セリフのログ"
const EMPTY_MESSAGE = "（まだ発話がありません）"
/** 依頼より前に届いたセリフのまとまりの見出し（起動直後の挨拶など）。 */
const PRE_REQUEST_HEADING = "（依頼の前）"

export function SpeechLog(): ReactElement {
  const records = useSessionSelector((session) => session.state.records)
  const [open, setOpen] = useState(false)
  const dialogRef = useModalDialog(open)

  const turns = open
    ? turnSpeeches(records)
        .filter((turn) => turn.speeches.length > 0)
        .toReversed()
    : []

  return (
    <>
      <button type="button" className={styles["speech-log-open"]} onClick={() => setOpen(true)}>
        <LogIcon />
        {OPEN_LABEL}
      </button>
      <dialog
        ref={dialogRef}
        className={styles["speech-log"]}
        aria-label={HEADING}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          // 枠の外（backdrop）を押したら閉じる。中身を押したときは target が子要素になる。
          if (event.target === event.currentTarget) {
            setOpen(false)
          }
        }}
      >
        <div className={styles["speech-log-body"]}>
          <div className={styles["speech-log-head"]}>
            <h2 className={styles["speech-log-heading"]}>{HEADING}</h2>
            <button
              type="button"
              className={styles["speech-log-close"]}
              onClick={() => setOpen(false)}
            >
              閉じる
            </button>
          </div>
          {turns.length === 0 ? (
            <p className={styles["speech-log-empty"]}>{EMPTY_MESSAGE}</p>
          ) : (
            <ol className={styles["speech-log-turns"]}>
              {turns.map((turn) => (
                <li key={turn.id} className={styles["speech-log-turn"]}>
                  <p className={styles["speech-log-request"]} title={turn.request}>
                    {firstLine(turn.request) ?? PRE_REQUEST_HEADING}
                  </p>
                  <ol className={styles["speech-log-speeches"]}>
                    {/* セリフはターンの中で末尾へ積むだけなので、位置がそのまま同一性になる。 */}
                    {turn.speeches.map((speech, index) => (
                      <li key={index} className={styles["speech-log-speech"]}>
                        {speech}
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
          )}
        </div>
      </dialog>
    </>
  )
}

/** 依頼の1行目（見出しは1行に切る。全文は `title` で読める）。空なら undefined。 */
function firstLine(text: string | undefined): string | undefined {
  const line = text?.split("\n").find((candidate) => candidate.trim() !== "")
  return line === undefined ? undefined : line.trim()
}

/** 時計を巻き戻す絵（ログ）。キャラビューの道具の絵なのでコードに置く（原則4 の対象外）。 */
function LogIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M2.6 8a5.4 5.4 0 1 0 1.6-3.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M3.8 1.9v2.6h2.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 5.2V8l1.9 1.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
