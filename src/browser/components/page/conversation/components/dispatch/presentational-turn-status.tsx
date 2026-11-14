// 送信⇄中断のボタンと経過/所要の表示の器。
//
// `<Composer>` の `<form>` の中に置くことを前提にする。
// 送るほう（`action.kind === "send"`）は `type="submit"` で、押すと Composer の `onSubmit` がそのまま依頼を送る。

import { ArrowUp, Square } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

import { HStack } from "../../../../ui/h-stack/h-stack.tsx"
import { RoundButton } from "../../../../ui/round-button/round-button.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import styles from "./dispatch.module.css"
import type { PhoneTurnActionModel } from "./hooks/use-phone-turn-action.ts"
import type { TurnStatusModel } from "./hooks/use-turn-status.ts"

const PHONE_ASK_LABEL = "中断する"
const PHONE_STOP_LABEL = "止める"
const PHONE_KEEP_LABEL = "続ける"
const PHONE_CONFIRM_LABEL = "作業を止めるか確かめる"

export function PresentationalPhoneTurnAction(props: PhoneTurnActionModel): ReactElement {
  if (props.kind === "send") {
    return (
      <button
        type="submit"
        disabled={props.disabled}
        className={styles["phone-turn-send"]}
        aria-label={props.label}
        title={props.title}
      >
        ↑
      </button>
    )
  }
  return (
    <>
      <button
        type="button"
        className={styles["phone-turn-stop"]}
        aria-label={PHONE_ASK_LABEL}
        onClick={props.onAsk}
      >
        <span className={styles["phone-turn-stop-mark"]} />
      </button>
      {props.confirming && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className={styles["phone-turn-cover"]}
            onClick={props.onKeep}
          />
          <div
            role="group"
            aria-label={PHONE_CONFIRM_LABEL}
            className={styles["phone-turn-confirm"]}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation()
                props.onKeep()
              }
            }}
          >
            <button
              type="button"
              className={styles["phone-turn-confirm-stop"]}
              onClick={props.onStop}
            >
              {PHONE_STOP_LABEL}
            </button>
            <button
              type="button"
              autoFocus
              className={styles["phone-turn-confirm-keep"]}
              onClick={props.onKeep}
            >
              {PHONE_KEEP_LABEL}
            </button>
          </div>
        </>
      )}
    </>
  )
}

/** Command+Enter で送信できることを示す記号。送信ボタンの左に添える。 */
const SEND_SHORTCUT_HINT = "⌘⏎"

type PresentationalTurnStatusProps = TurnStatusModel & {
  /** 経過の右、送信⇄中断の左に挟むもの（道具の行の「新規」）。 */
  readonly betweenElapsedAndAction: ReactNode
  /** 経過の左に置く段の狐火の並び（新しい器で働くあいだ）。 */
  readonly lamps: ReactNode
}

export function PresentationalTurnStatus(props: PresentationalTurnStatusProps): ReactElement {
  return (
    <HStack
      element="div"
      name={{ kind: "none" }}
      gap="md"
      align="center"
      justify="start"
      wrap="nowrap"
      className={styles["dispatch-row"]}
    >
      {/* API の知らせ（再試行中・利用上限・失敗の理由）。行に出すのは短い字だけで、全文は `title` で読ませる。
          `role="status"` で、変わったことを支援技術にも伝える。 */}
      {props.notice.kind === "shown" && (
        <Text
          element="span"
          size="secondary"
          tone={props.notice.tone === "warn" ? "state-warn" : "state-ng"}
          weight="inherit"
          className={styles["dispatch-notice"]}
        >
          <span role="status" title={props.notice.detail}>
            {props.notice.label}
          </span>
        </Text>
      )}
      <span className={styles["dispatch-lamps"]}>{props.lamps}</span>
      {props.elapsed.kind === "shown" && (
        <Text
          element="span"
          size="secondary"
          tone="ink-quiet"
          weight="inherit"
          className={styles["dispatch-elapsed-row"]}
        >
          <Text element="span" size="inherit" tone="inherit" weight="inherit" className="">
            {props.elapsed.label}
          </Text>{" "}
          <Text
            element="span"
            size="inherit"
            tone="ink"
            weight="inherit"
            className={styles["dispatch-elapsed"]}
          >
            {props.elapsed.text}
          </Text>
        </Text>
      )}
      {props.betweenElapsedAndAction}
      {props.action.kind === "interrupt" ? (
        <span className={styles["dispatch-action"]}>
          {props.action.keyHint !== "" && (
            <kbd className={styles["dispatch-key-hint"]}>{props.action.keyHint}</kbd>
          )}
          <RoundButton
            action={{ kind: "press", onClick: props.action.onInterrupt }}
            ariaLabel={props.action.label}
            title={props.action.label}
            disabled={false}
            emphasis="neutral"
            className=""
          >
            <Square size={14} fill="currentColor" aria-hidden="true" />
          </RoundButton>
        </span>
      ) : (
        <span className={styles["dispatch-action"]}>
          <kbd className={styles["dispatch-key-hint"]}>{SEND_SHORTCUT_HINT}</kbd>
          <RoundButton
            action={{ kind: "submit" }}
            ariaLabel={props.action.label}
            title={props.action.title}
            disabled={props.action.disabled}
            emphasis={props.action.emphasis}
            className=""
          >
            <ArrowUp size={18} strokeWidth={2.2} aria-hidden="true" />
          </RoundButton>
        </span>
      )}
    </HStack>
  )
}
