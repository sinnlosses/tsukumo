// 会話のログ（docs/screen-design.md 13.7）。**古い→新しいの順にそのまま積む**。下端付近を読んでいた
// ときだけ最新へ寄せるのは `hooks/use-stick-to-bottom.ts` で、ここは受け取った ref を入れ物に
// 付けるだけ。行は `hooks/use-chat-view.ts` が畳んだ形（`ChatRow`）で受け、判定を持たない。

import { type ReactElement, type RefObject } from "react"

import { Text } from "../../../../../../components/ui/text/text.tsx"
import { PromptImageThumbnails } from "../../prompt-image/prompt-image.tsx"
import styles from "../chat-view.module.css"
import { type ChatRow } from "../hooks/use-chat-view.ts"
import { ChatDay } from "./chat-day.tsx"
import { ChatSpeech } from "./chat-speech.tsx"
import { ChatTime } from "./chat-time.tsx"
import { ChatTyping } from "./chat-typing.tsx"

/**
 * まだ一度も話していないときの案内（吹き出しの「（まだ発話がありません）」と同じ立場）。
 * **最初の一言を促すのはこの文面**（docs/screen-design.md 13.7）— 促す操作子が立ち絵へ移ったので、
 * ログが空のときに「どこを押せばよいか」を指すものがここ以外に無い。
 */
const EMPTY_LOG_MESSAGE = "（まだ何も話していません。立ち絵をつつくと話しかけてくれます）"

/**
 * **props はここだけ分解して受ける**。ref を持つ入れ物を `props.logRef` の形で描画中に読むと
 * `react(refs)`（規約「レンダー中に ref を読み書きしない」）が落ちるため
 * （`layout/presentational-layout.tsx` と同じ理由）。
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
          className={styles["chat-empty"] ?? ""}
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
                // 圧縮の区切り（docs/glossary.md「圧縮の区切り」）。**文言を添えない細い線1本**で、
                // 押せない・畳めない（利用者の操作の対象にしない。docs/chat-mode.md 4.9）。
                // `<hr>` は元々「文言を持たない区切り」を表す要素なので、説明文を足す必要が無い。
                return (
                  <hr key={row.key} className={styles["chat-boundary"]} data-speaker="boundary" />
                )
              case "speech":
                return (
                  <div
                    key={row.key}
                    className={`${styles["chat-row"]} ${styles["chat-row-character"]}`}
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
                  <div key={row.key} className={`${styles["chat-row"]} ${styles["chat-row-user"]}`}>
                    {/* 利用者の発言は押せない（遡る先の表情を持たないので、押しても何も起きない）。
                     **添えた画像の控えは吹き出しの中に並ぶ**（`docs/requirements.md` 4.10。
                     控えだけは押すと拡大する）。 */}
                    <div
                      className={`${styles["chat-entry"]} ${styles["chat-entry-user"]}`}
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
          {/* 返事を待っている間・出していない吹き出しが控えている間、末尾に出す「...」
              （docs/screen-design.md 13.7「返事を待つ間の「...」」）。セリフの吹き出しとは
              別の行で、控えていた吹き出しが出るとこの行は消え、入れ替わりにその行が現れる。 */}
          {showTyping && <ChatTyping />}
        </>
      )}
    </div>
  )
}
