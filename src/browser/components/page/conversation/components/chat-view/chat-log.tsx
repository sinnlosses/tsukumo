// 雑談の会話のログ。古い→新しいの順にそのまま積む。

import type { ReactElement, RefCallback } from "react"

import { Text } from "../../../../ui/text/text.tsx"
import { PromptImageThumbnails } from "../prompt-image/prompt-image.tsx"
import { StreamPostRow, StreamSpeechRow, StreamTyping } from "../stream-row/stream-row.tsx"
import { ChatDay } from "./chat-day.tsx"
import styles from "./chat-view.module.css"
import type { ChatRow } from "./hooks/use-chat-view.ts"

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
  readonly logRef: RefCallback<HTMLDivElement>
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
                  <StreamSpeechRow
                    key={row.key}
                    text={row.text}
                    time={row.time}
                    selected={row.selected}
                    pop={row.pop}
                    liveness="plain"
                    aim={undefined}
                    speakerName=""
                    onToggle={row.onToggle}
                    className=""
                  />
                )
              case "user":
                // 利用者の発言は押せない（遡る先の表情を持たないので、押しても何も起きない）。
                // 添えた画像の控えは吹き出しの中に並ぶ（控えだけは押すと拡大する）。
                return (
                  <StreamPostRow key={row.key} time={row.time} speakerName="" className="">
                    {row.text}
                    <PromptImageThumbnails images={row.images} />
                  </StreamPostRow>
                )
            }
          })}
          {/* 返事を待っている間・出していない吹き出しが控えている間、末尾に出す「...」。 */}
          {showTyping && <StreamTyping />}
        </>
      )}
    </div>
  )
}
