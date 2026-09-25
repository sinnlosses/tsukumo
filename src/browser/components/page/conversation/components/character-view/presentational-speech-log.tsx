// セリフのログの**器だけ**（<PresentationalSpeechLog>）。開く口（右上の「ログ」）と、その中身の
// `<dialog>` を置く。フックも算出も持たず、`hooks/use-speech-log.ts` が畳んだ値と呼び先を
// そのまま置く（docs/design.md 2章「機能の中を分ける」）。
//
// **中身はキャラビューの舞台をそのまま上へ伸ばした形**（docs/display.md 4.2）。立ち絵は
// キャラビューのものと同じ `<Portrait>` を受け取って床（`.speech-log-floor`）に置き、吹き出しは
// キャラビューと同じ `<Balloon>` で描く。どこに重ねるかは CSS（`character-view.module.css` の
// anchor positioning）が決める。
//
// **`<dialog>` は top layer に出る**ので、キャラビューの `overflow` には切り取られない。開閉・Esc・
// backdrop のクリックは `components/ui/dialog/dialog.tsx` が持つ。

import { type ReactElement, type ReactNode } from "react"

import { Dialog } from "../../../../../components/ui/dialog/dialog.tsx"
import { HStack } from "../../../../../components/ui/h-stack/h-stack.tsx"
import { Text } from "../../../../../components/ui/text/text.tsx"
import { VStack } from "../../../../../components/ui/v-stack/v-stack.tsx"
import { Balloon } from "./balloon.tsx"
import styles from "./character-view.module.css"
import { type SpeechLogEntry, type SpeechLogModel } from "./hooks/use-speech-log.ts"

const OPEN_LABEL = "ログ"
const CLOSE_LABEL = "ログを閉じる"
const DIALOG_LABEL = "セリフのログ"
const MORE_LABEL = "もっと前を読む ↑"
const EMPTY_MESSAGE = "（まだ発話がありません）"

export type PresentationalSpeechLogProps = SpeechLogModel & {
  /** キャラビューに立っている立ち絵（素材が無ければ何も描かない）。床に同じものを立たせる。 */
  readonly portrait: ReactNode
  /** 最新の吹き出しに添える話し手の名前（キャラビューの最新の吹き出しと同じ）。 */
  readonly speakerName: string | undefined
}

export function PresentationalSpeechLog({
  scrollerRef,
  open,
  entries,
  userCall,
  onOpen,
  onClose,
  portrait,
  speakerName,
}: PresentationalSpeechLogProps): ReactElement {
  return (
    <>
      <button
        type="button"
        className={styles["speech-log-open"]}
        aria-expanded={open}
        onClick={onOpen}
      >
        <LogIcon />
        {OPEN_LABEL}
      </button>
      <Dialog
        open={open}
        name={{ kind: "label", label: DIALOG_LABEL }}
        backdrop="clear"
        placement={{ kind: "auto" }}
        onClose={onClose}
        className={styles["speech-log"] ?? ""}
      >
        {/* 枠の中を丸ごと覆う。空いたところを押しても target が `<dialog>` にならない
            （＝枠の外を押したときだけ閉じる）。 */}
        <div className={styles["speech-log-stage"]}>
          {/* 閉じる口を列より先に置く。`showModal()` は中の最初のフォーカスできる要素へ
              フォーカスを移すので、後ろに置くと転がる列（溢れると Tab で届く）が先に選ばれる。 */}
          <button type="button" className={styles["speech-log-close"]} onClick={onClose}>
            <CloseIcon />
            {CLOSE_LABEL}
          </button>
          <HStack
            element="div"
            name={{ kind: "none" }}
            ref={undefined}
            gap="none"
            align="end"
            justify="start"
            wrap="nowrap"
            className={styles["speech-log-floor"] ?? ""}
          >
            {portrait}
          </HStack>
          <VStack
            element="div"
            name={{ kind: "none" }}
            ref={scrollerRef}
            gap="none"
            align="stretch"
            justify="start"
            wrap="nowrap"
            className={styles["speech-log-scroller"] ?? ""}
          >
            <p className={styles["speech-log-more"]} aria-hidden="true">
              {MORE_LABEL}
            </p>
            {entries.length === 0 ? (
              <Text
                element="p"
                size="secondary"
                tone="ink-quiet"
                weight="inherit"
                className={styles["speech-log-empty"] ?? ""}
              >
                {EMPTY_MESSAGE}
              </Text>
            ) : (
              <ol className={styles["speech-log-entries"]}>
                {entries.map((entry) => (
                  <SpeechLogRow
                    key={entry.key}
                    entry={entry}
                    speakerName={speakerName}
                    userCall={userCall}
                  />
                ))}
              </ol>
            )}
          </VStack>
        </div>
      </Dialog>
    </>
  )
}

/** 並びの1行。依頼の区切りは横罫で挟んだ1行、セリフは吹き出し1つ。 */
function SpeechLogRow(props: {
  readonly entry: SpeechLogEntry
  readonly speakerName: string | undefined
  readonly userCall: string | undefined
}): ReactElement {
  const { entry } = props
  if (entry.kind === "request") {
    return (
      <li className={styles["speech-log-request"]} data-current={entry.current}>
        {/* 依頼が長いときに切るのは文面だけで、時刻は切らない。 */}
        <span className={styles["speech-log-request-text"]} title={entry.requestText}>
          {props.userCall}「{entry.heading}」
        </span>
        {entry.time.kind === "known" && (
          <time className={styles["speech-log-request-time"]} dateTime={entry.time.dateTime}>
            {entry.time.text}
          </time>
        )}
      </li>
    )
  }
  const latest = entry.age === "latest"
  return (
    <li className={styles["speech-log-speech"]} data-age={entry.age}>
      <Balloon text={entry.text} latest={latest} speaker={latest ? props.speakerName : undefined} />
    </li>
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

/** 閉じる印（×）。 */
function CloseIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M6 6l12 12M18 6L6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
