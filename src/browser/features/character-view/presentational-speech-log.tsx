// セリフのログの**器だけ**（<PresentationalSpeechLog>）。開く口（右上の「ログ」）と、その中身の
// `<dialog>` を置く。フックも算出も持たず、`hooks/use-speech-log.ts` が畳んだ値と呼び先を
// そのまま置く（docs/design.md 2章「機能の中を分ける」）。
//
// **`<dialog>` は top layer に出る**ので、キャラビューの `overflow` には切り取られない。

import { type ReactElement } from "react"

import styles from "./character-view.module.css"
import { type SpeechLogModel } from "./hooks/use-speech-log.ts"

const OPEN_LABEL = "ログ"
const HEADING = "セリフのログ"
const EMPTY_MESSAGE = "（まだ発話がありません）"

export type PresentationalSpeechLogProps = SpeechLogModel

export function PresentationalSpeechLog({
  ref,
  turns,
  onOpen,
  onClose,
  onDialogClick,
}: PresentationalSpeechLogProps): ReactElement {
  return (
    <>
      <button type="button" className={styles["speech-log-open"]} onClick={onOpen}>
        <LogIcon />
        {OPEN_LABEL}
      </button>
      <dialog
        ref={ref}
        className={styles["speech-log"]}
        aria-label={HEADING}
        onClose={onClose}
        onClick={onDialogClick}
      >
        <div className={styles["speech-log-body"]}>
          <div className={styles["speech-log-head"]}>
            <h2 className={styles["speech-log-heading"]}>{HEADING}</h2>
            <button type="button" className={styles["speech-log-close"]} onClick={onClose}>
              閉じる
            </button>
          </div>
          {turns.length === 0 ? (
            <p className={styles["speech-log-empty"]}>{EMPTY_MESSAGE}</p>
          ) : (
            <ol className={styles["speech-log-turns"]}>
              {turns.map((turn) => (
                <li key={turn.id} className={styles["speech-log-turn"]}>
                  <p className={styles["speech-log-request"]} title={turn.requestText}>
                    {turn.heading}
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
