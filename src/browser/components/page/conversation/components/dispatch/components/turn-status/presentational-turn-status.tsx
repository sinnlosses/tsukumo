// 送信⇄中断のボタンと経過/所要の表示の器だけ（<PresentationalTurnStatus>。
// docs/design.md 6.1）。フックも算出も持たず、`hooks/use-turn-status.ts` が畳んだ値と呼び先を
// そのまま置く（docs/design.md 2章「機能の中を分ける」）。
//
// `<Composer>` の `<form>` の中に置くことを前提にする — 送るほう（`action.kind === "send"`）は
// `type="submit"` で、押すと Composer の `onSubmit` がそのまま依頼を送る。

import { type ReactElement } from "react"

import { HStack } from "../../../../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import styles from "../../dispatch.module.css"
import { type TurnStatusModel } from "./hooks/use-turn-status.ts"

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
      className={styles["dispatch-row"] ?? ""}
    >
      {/* API の知らせ（再試行中・利用上限・失敗の理由）。行に出すのは短い字だけで、全文は
          `title` で読ませる。`role="status"` で、変わったことを支援技術にも伝える。 */}
      {props.notice.kind === "shown" && (
        <Text
          element="span"
          size="secondary"
          tone={props.notice.tone === "warn" ? "state-warn" : "state-ng"}
          weight="inherit"
          className={styles["dispatch-notice"] ?? ""}
        >
          <span role="status" title={props.notice.detail}>
            {props.notice.label}
          </span>
        </Text>
      )}
      <Text
        element="span"
        size="secondary"
        tone="ink-quiet"
        weight="inherit"
        className={styles["dispatch-elapsed-row"] ?? ""}
      >
        <span>{props.elapsedLabel}</span>{" "}
        <Text
          element="span"
          size="inherit"
          tone="ink"
          weight="inherit"
          className={styles["dispatch-elapsed"] ?? ""}
        >
          {props.elapsedText}
        </Text>
      </Text>
      {props.action.kind === "interrupt" ? (
        <button
          type="button"
          className={styles["dispatch-interrupt"]}
          onClick={props.action.onInterrupt}
        >
          {props.action.label}
        </button>
      ) : (
        <button
          type="submit"
          className={styles["dispatch-send"]}
          data-shortcut={SEND_SHORTCUT_HINT}
        >
          {props.action.label}
        </button>
      )}
    </HStack>
  )
}
