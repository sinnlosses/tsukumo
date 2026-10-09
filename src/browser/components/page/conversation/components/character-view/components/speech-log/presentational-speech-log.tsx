// セリフのログの器。開く口（右上の「ログ」）と、その中身の `<dialog>` を置く。
//
// 中身はキャラビューの舞台をそのまま上へ伸ばした形。
// 立ち絵はキャラビューのものと同じ `<Portrait>` を受け取って床（`.speech-log-floor`）に置き、吹き出しはキャラビューと同じ `<Balloon>` で描く。
// どこに重ねるかは CSS（`character-view.module.css` の anchor positioning）が決める。
//
// `<dialog>` は top layer に出るので、キャラビューの `overflow` には切り取られない。

import { History, X } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

import { Button } from "../../../../../../ui/button/button.tsx"
import { Dialog } from "../../../../../../ui/dialog/dialog.tsx"
import { HStack } from "../../../../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import { VStack } from "../../../../../../ui/v-stack/v-stack.tsx"
import characterViewStyles from "../../character-view.module.css"
import { Balloon } from "../balloon/balloon.tsx"
import type { SpeechLogEntry, SpeechLogModel } from "./hooks/use-speech-log.ts"
import styles from "./speech-log.module.css"

const OPEN_LABEL = "ログ"
const CLOSE_LABEL = "ログを閉じる"
const DIALOG_LABEL = "セリフのログ"
const MORE_LABEL = "もっと前を読む ↑"
const EMPTY_MESSAGE = "（まだ発話がありません）"

export type PresentationalSpeechLogProps = SpeechLogModel & {
  readonly open: boolean
  readonly onOpen: () => void
  readonly onClose: () => void
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
      <Button
        variant="outline-faint-ground"
        size="secondary"
        pressed="none"
        disabled={false}
        ariaLabel={undefined}
        ariaHasPopup={undefined}
        disclosure={{ kind: "expander", expanded: open }}
        title={undefined}
        className={styles["speech-log-open"]}
        onClick={onOpen}
      >
        <History size={16} />
        {OPEN_LABEL}
      </Button>
      <Dialog
        open={open}
        ariaLabel={DIALOG_LABEL}
        backdrop="clear"
        placement={{ kind: "auto" }}
        onClose={onClose}
        className={styles["speech-log"]}
      >
        {/* 枠の中を丸ごと覆う。
            空いたところを押しても target が `<dialog>` にならない（＝枠の外を押したときだけ閉じる）。 */}
        <div className={characterViewStyles["speech-log-stage"]}>
          {/* 閉じる口を列より先に置く。
              `showModal()` は中の最初のフォーカスできる要素へフォーカスを移すので、後ろに置くと転がる列（溢れると Tab で届く）が先に選ばれる。 */}
          <Button
            variant="outline-accent-tinted"
            size="action"
            pressed="none"
            disabled={false}
            ariaLabel={undefined}
            disclosure={{ kind: "none" }}
            ariaHasPopup={undefined}
            title={undefined}
            className={styles["speech-log-close"]}
            onClick={onClose}
          >
            <X size={16} />
            {CLOSE_LABEL}
          </Button>
          <HStack
            element="div"
            name={{ kind: "none" }}
            ref={undefined}
            gap="none"
            align="end"
            justify="start"
            wrap="nowrap"
            className={styles["speech-log-floor"]}
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
            className={characterViewStyles["speech-log-scroller"]}
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
                className={styles["speech-log-empty"]}
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
    <li className={characterViewStyles["speech-log-speech"]} data-age={entry.age}>
      <Balloon
        text={entry.text}
        latest={latest}
        speaker={latest ? props.speakerName : undefined}
        interaction={{ kind: "toggleable", selected: entry.selected, onToggle: entry.onToggle }}
      />
    </li>
  )
}
