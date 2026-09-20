// 雑談ビュー（<ChatView>。docs/design.md 13.7）。**雑談モードの間だけ、メインビューの場所に
// 出る**（入れ替えるのは入口の `src/browser/main.tsx`）。左に立ち絵、右に会話のログを置く。
//
// **仕事のときのメインビュー（`features/main-view/`）とは並びの規則が違う**ので、部品を分けて
// ある: あちらは依頼を境目にやり取りへまとめてタブで遡り、こちらは素直な時系列で積む。
//
// **これはプロトタイプ**（2026-09-20）。立ち絵の動きは「待っているか」だけで決めていて、
// キャラビューが持つ4つの動き（`features/character-view/` の `usePortraitMotion`）は
// 再現していない。手触りを見てから詰める。

import { useEffect, useRef, type ReactElement } from "react"

import { resolveOutfitAccent, resolvePortraitUrl } from "../../../shared/character.ts"
import { chatLogEntries, type ChatLogEntry } from "../../../shared/chat-log.ts"
import { resolveExpressionLabel } from "../../../shared/expression-choice.ts"
import { resolveOutfit } from "../../../shared/expression.ts"
import { Portrait } from "../../components/portrait.tsx"
import { useSessionSelector } from "../../stores/session.tsx"
import styles from "./chat-view.module.css"

/** character.json に `name` が無い・定義自体が無いときの、立ち絵 alt テキストの既定名。 */
const DEFAULT_CHARACTER_ALT_NAME = "キャラクター"

/** まだ一度も話していないときの案内（吹き出しの「（まだ発話がありません）」と同じ立場）。 */
const EMPTY_LOG_MESSAGE = "（まだ何も話していません）"

export function ChatView(): ReactElement {
  const records = useSessionSelector((session) => session.state.records)
  const speechExpression = useSessionSelector((session) => session.state.speechExpression)
  const model = useSessionSelector((session) => session.state.model)
  const character = useSessionSelector((session) => session.state.character)
  const turnInProgress = useSessionSelector((session) => session.state.turnInProgress)
  const entries = chatLogEntries(records)
  const outfit = resolveOutfit(model)

  const portraitUrl =
    character === undefined ? undefined : resolvePortraitUrl(character.portraits, speechExpression)
  const accent =
    character === undefined ? undefined : resolveOutfitAccent(character.outfitAccents, outfit)
  const altText = `${character?.name ?? DEFAULT_CHARACTER_ALT_NAME}（${resolveExpressionLabel(
    character?.expressions ?? [],
    speechExpression,
  )}）`

  return (
    <div className={styles["chat-region"]}>
      {portraitUrl !== undefined && (
        <Portrait
          url={portraitUrl}
          accent={accent}
          altText={altText}
          expression={speechExpression}
          outfit={outfit}
          motion={turnInProgress ? "waiting" : "reading"}
          className={styles["chat-portrait"]}
        />
      )}
      <ChatLog entries={entries} />
    </div>
  )
}

/**
 * 会話のログ。**古い→新しいの順にそのまま積み**、新しい1件が増えたら下端へ寄せる。
 * `column-reverse` を使わないのは、この並びが「最新だけを読む」吹き出しではなく
 * **遡って読み返せるログ**だから（13.7）。
 */
function ChatLog(props: { readonly entries: readonly ChatLogEntry[] }): ReactElement {
  const logRef = useRef<HTMLDivElement>(null)
  const count = props.entries.length

  // React の外にある DOM（スクロール位置）との同期。件数が増えたときだけ下端へ寄せる
  // （1件も無いうちは寄せる先が無い）。
  useEffect(() => {
    const log = logRef.current
    if (log === null || count === 0) {
      return
    }
    log.scrollTop = log.scrollHeight
  }, [count])

  return (
    <div className={styles["chat-log"]} ref={logRef}>
      {count === 0 ? (
        <p className={styles["chat-empty"]}>{EMPTY_LOG_MESSAGE}</p>
      ) : (
        props.entries.map((entry, index) => (
          <div
            // 並びは末尾に積むだけで、途中に差し込まれることも並べ替えもない。
            key={index}
            className={`${styles["chat-entry"]} ${
              entry.speaker === "character"
                ? styles["chat-entry-character"]
                : styles["chat-entry-user"]
            }`}
            data-speaker={entry.speaker}
          >
            {entry.text}
          </div>
        ))
      )}
    </div>
  )
}
