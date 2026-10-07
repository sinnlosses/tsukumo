// 送信⇄中断のボタンと経過/所要の表示の器。
//
// `<Composer>` の `<form>` の中に置くことを前提にする。
// 送るほう（`action.kind === "send"`）は `type="submit"` で、押すと Composer の `onSubmit` がそのまま依頼を送る。

import clsx from "clsx"
import type { ReactElement } from "react"

import { Button } from "../../../../../../ui/button/button.tsx"
import { HStack } from "../../../../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import dispatchStyles from "../../dispatch.module.css"
import type { TurnStatusModel } from "./hooks/use-turn-status.ts"
import styles from "./turn-status.module.css"

/** Command+Enter で送信できることを示す記号（`dispatch.module.css` が `::after` で描く）。 */
const SEND_SHORTCUT_HINT = "⌘⏎"

export type PresentationalTurnStatusProps = TurnStatusModel

export function PresentationalTurnStatus(props: PresentationalTurnStatusProps): ReactElement {
  return (
    <HStack
      element="div"
      name={{ kind: "none" }}
      ref={undefined}
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
      {props.action.kind === "interrupt" ? (
        <Button
          variant="outline-hover-danger"
          size="secondary"
          pressed="none"
          disabled={false}
          ariaLabel={undefined}
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title={undefined}
          className={dispatchStyles["dispatch-interrupt"]}
          onClick={props.action.onInterrupt}
        >
          <Text element="span" size="inherit" tone="inherit" weight="bold" className="">
            {props.action.label}
          </Text>
        </Button>
      ) : (
        <button
          type="submit"
          disabled={props.action.disabled}
          className={clsx(
            dispatchStyles["dispatch-send"],
            props.action.emphasis === "quiet" && dispatchStyles["is-quiet"],
          )}
          data-shortcut={SEND_SHORTCUT_HINT}
          data-emphasis={props.action.emphasis}
          title={props.action.title}
        >
          {props.action.label}
        </button>
      )}
    </HStack>
  )
}
