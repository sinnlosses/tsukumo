// 雑談の会話のログ。古い→新しいの順にそのまま積む。

import clsx from "clsx"
import type { ReactElement, RefObject } from "react"

import { Text } from "../../../../../../ui/text/text.tsx"
import { PromptImageThumbnails } from "../../../prompt-image/prompt-image.tsx"
import chatViewStyles from "../../chat-view.module.css"
import type { ChatRow } from "../../hooks/use-chat-view.ts"
import { ChatDay } from "../chat-day/chat-day.tsx"
import { ChatSpeech } from "../chat-speech/chat-speech.tsx"
import { ChatTime } from "../chat-time/chat-time.tsx"
import { ChatTyping } from "../chat-typing/chat-typing.tsx"
import styles from "./chat-log.module.css"

/**
 * まだ一度も話していないときの案内。
 * ログが空のときに「どこを押せばよいか」（立ち絵）を指すものがここ以外に無い。
 */
const EMPTY_LOG_MESSAGE = "（まだ何も話していません。立ち絵をつつくと話しかけてくれます）"

/**
 * props はここだけ分解して受ける。
 * ref を持つ入れ物を `props.logRef` の形で描画中に読むと、lint の `react(refs)` が落ちるため。
 */
export function ChatLog({
  logRef,
  rows,
  showTyping,
  showEmptyMessage,
}: {
  readonly logRef: RefObject<HTMLDivElement | null>
  readonly rows: readonly ChatRow[]
  readonly showTyping: boolean
  readonly showEmptyMessage: boolean
}): ReactElement {
  return (
    <div className={styles["chat-log"]} ref={logRef}>
      {showEmptyMessage ? (
        <Text
          element="p"
          size="secondary"
          tone="ink-quiet"
          weight="inherit"
          className={styles["chat-empty"]}
        >
          {EMPTY_LOG_MESSAGE}
        </Text>
      ) : (
        <>
          {rows.map((row) => {
            switch (row.kind) {
              case "day":
                return <ChatDay key={row.key} dateTime={row.dateTime} label={row.label} />
              case "boundary":
                // 圧縮の区切り。文言を添えない細い線1本で、押せない・畳めない。
                return (
                  <hr key={row.key} className={styles["chat-boundary"]} data-speaker="boundary" />
                )
              case "speech":
                return (
                  <div
                    key={row.key}
                    className={clsx(styles["chat-row"], styles["chat-row-character"])}
                  >
                    <ChatSpeech
                      text={row.text}
                      selected={row.selected}
                      pop={row.pop}
                      onToggle={row.onToggle}
                    />
                    <ChatTime time={row.time} />
                  </div>
                )
              case "user":
                return (
                  <div key={row.key} className={clsx(styles["chat-row"], styles["chat-row-user"])}>
                    {/* 利用者の発言は押せない（遡る先の表情を持たないので、押しても何も起きない）。
                     添えた画像の控えは吹き出しの中に並ぶ（控えだけは押すと拡大する）。 */}
                    <div
                      className={clsx(
                        chatViewStyles["chat-entry"],
                        chatViewStyles["chat-entry-user"],
                      )}
                      data-speaker="user"
                    >
                      {row.text}
                      <PromptImageThumbnails images={row.images} />
                    </div>
                    <ChatTime time={row.time} />
                  </div>
                )
            }
          })}
          {/* 返事を待っている間・出していない吹き出しが控えている間、末尾に出す「...」。 */}
          {showTyping && <ChatTyping />}
        </>
      )}
    </div>
  )
}
