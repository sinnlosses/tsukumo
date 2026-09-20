// 雑談ビュー（<ChatView>。docs/design.md 13.7）。**雑談モードの間だけ、メインビューの場所に
// 出る**（入れ替えるのは入口の `src/browser/main.tsx`）。左に立ち絵、右に会話のログを置く。
//
// **仕事のときのメインビュー（`features/main-view/`）とは並びの規則が違う**ので、部品を分けて
// ある: あちらは依頼を境目にやり取りへまとめてタブで遡り、こちらは素直な時系列で積む。
//
// **過去のセリフの行を押すと、そのときの表情へ立ち絵が遡る**（キャラビューが過去のターンの
// タブでやっていることの、雑談での対応物。docs/design.md 13.7「会話を遡る」）。遡る先が
// 「ターン」ではなく「1件のセリフ」なのは、雑談のログが依頼で区切られていないため。
// **立ち絵の動きは遡らない**（キャラビューと同じ。時間相対のアニメーションなので別タスク）。
//
// **これはプロトタイプ**（2026-09-20）。立ち絵の動きは「待っているか」だけで決めていて、
// キャラビューが持つ4つの動き（`features/character-view/` の `usePortraitMotion`）は
// 再現していない。手触りを見てから詰める。

import { useEffect, useRef, useState, type ReactElement } from "react"

import { resolveOutfitAccent, resolvePortraitUrl } from "../../../shared/character.ts"
import { chatLogEntries, type ChatLogEntry } from "../../../shared/chat-log.ts"
import { resolveExpressionLabel } from "../../../shared/expression-choice.ts"
import { resolveOutfit, type Expression } from "../../../shared/expression.ts"
import { Portrait } from "../../components/portrait.tsx"
import { PromptImageThumbnails } from "../../components/prompt-image.tsx"
import { useSessionSelector } from "../../stores/session.tsx"
import styles from "./chat-view.module.css"

/** character.json に `name` が無い・定義自体が無いときの、立ち絵 alt テキストの既定名。 */
const DEFAULT_CHARACTER_ALT_NAME = "キャラクター"

/** まだ一度も話していないときの案内（吹き出しの「（まだ発話がありません）」と同じ立場）。 */
const EMPTY_LOG_MESSAGE = "（まだ何も話していません）"

/**
 * 「下端付近」とみなす、下端からの残り距離（px）。0 にすると、フォントの読み込みや
 * 小数点の丸めで scrollHeight がわずかにぶれただけで「読み返し中」と誤判定してしまうので、
 * 発言1件分の高さ（`.chat-entry` の padding・line-height から見て 60〜90px 程度）より
 * 少し広めに取る。
 */
const NEAR_BOTTOM_THRESHOLD_PX = 120

export function ChatView(): ReactElement {
  const records = useSessionSelector((session) => session.state.records)
  const speechExpression = useSessionSelector((session) => session.state.speechExpression)
  const model = useSessionSelector((session) => session.state.model)
  const character = useSessionSelector((session) => session.state.character)
  const turnInProgress = useSessionSelector((session) => session.state.turnInProgress)
  const entries = chatLogEntries(records)
  const outfit = resolveOutfit(model)

  // 遡って見ているセリフの行（ログの並びの何件目か）。選んでいなければ undefined で、
  // 立ち絵は最新の表情に従う。**新しいセリフが来ても解除しない** — 選ぶこと自体が
  // 「読み返している」という意思表示なので、下端付近に居るときだけ最新へ寄せる
  // スクロールの規則（{@link NEAR_BOTTOM_THRESHOLD_PX}）と同じ立場に置く。
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>(undefined)
  const expression = selectedSpeechExpression(entries, selectedIndex) ?? speechExpression

  const portraitUrl =
    character === undefined ? undefined : resolvePortraitUrl(character.portraits, expression)
  const accent =
    character === undefined ? undefined : resolveOutfitAccent(character.outfitAccents, outfit)
  const altText = `${character?.name ?? DEFAULT_CHARACTER_ALT_NAME}（${resolveExpressionLabel(
    character?.expressions ?? [],
    expression,
  )}）`

  return (
    <div className={styles["chat-region"]}>
      {portraitUrl !== undefined && (
        <Portrait
          url={portraitUrl}
          accent={accent}
          altText={altText}
          expression={expression}
          outfit={outfit}
          motion={turnInProgress ? "waiting" : "reading"}
          className={styles["chat-portrait"]}
        />
      )}
      <ChatLog
        entries={entries}
        selectedIndex={selectedIndex}
        onToggle={(index) => {
          // もう一度押したら解除する（最新の表情へ戻る道は、遡るのに使ったのと同じ操作だけ）。
          setSelectedIndex((current) => (current === index ? undefined : index))
        }}
      />
    </div>
  )
}

/**
 * 選んでいる行のセリフに添えられた表情。選んでいなければ undefined（立ち絵は最新のまま）。
 *
 * **選べるのはキャラクターのセリフだけ**だが、窓（`MAX_SESSION_STATE_TURNS`）から古い記録が
 * 落ちると並びが前へ詰まるので、選んだ番号が利用者の発言に当たることがある。そのときも
 * 最新へ戻すだけで、選択そのものは持ったままにする（押した行の印も同じ番号で決まるので、
 * 立ち絵と印が食い違うことはない）。
 */
function selectedSpeechExpression(
  entries: readonly ChatLogEntry[],
  selectedIndex: number | undefined,
): Expression | undefined {
  if (selectedIndex === undefined) {
    return undefined
  }
  const entry = entries[selectedIndex]
  return entry === undefined || entry.speaker !== "character" ? undefined : entry.expression
}

/**
 * 会話のログ。**古い→新しいの順にそのまま積み**、下端付近を読んでいたときだけ新しい1件で
 * 最新へ寄せる（読み返している最中は動かさない。docs/design.md 13.7）。`column-reverse` を
 * 使わないのは、この並びが「最新だけを読む」吹き出しではなく**遡って読み返せるログ**だから。
 */
function ChatLog(props: {
  readonly entries: readonly ChatLogEntry[]
  readonly selectedIndex: number | undefined
  readonly onToggle: (index: number) => void
}): ReactElement {
  const logRef = useRef<HTMLDivElement>(null)
  // 利用者が下端付近を読んでいるかどうか。新着が来た「あと」に測ったのでは元の位置が
  // わからないので、スクロール操作のたびに更新しておく（初期値は true — まだ何も
  // 積まれていない・積まれたばかりの状態は下端に等しい）。
  const nearBottomRef = useRef(true)
  const count = props.entries.length

  // 外部システム（スクロール操作）の購読。利用者がどこを読んでいるかを、下の
  // 「件数が増えたら寄せる」effect より前からずっと追い続ける必要があるので、件数の
  // 変化とは別の effect として張る。
  useEffect(() => {
    const log = logRef.current
    if (log === null) {
      return
    }
    const updateNearBottom = (): void => {
      const distanceFromBottom = log.scrollHeight - log.scrollTop - log.clientHeight
      nearBottomRef.current = distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX
    }
    log.addEventListener("scroll", updateNearBottom)
    return () => {
      log.removeEventListener("scroll", updateNearBottom)
    }
  }, [])

  // React の外にある DOM（スクロール位置）との同期。件数が増えたときに、下端付近を
  // 読んでいた場合だけ最新へ寄せる（読み返している最中に下へ攫わない。docs/design.md 13.7）。
  useEffect(() => {
    const log = logRef.current
    if (log === null || count === 0 || !nearBottomRef.current) {
      return
    }
    log.scrollTop = log.scrollHeight
  }, [count])

  return (
    <div className={styles["chat-log"]} ref={logRef}>
      {count === 0 ? (
        <p className={styles["chat-empty"]}>{EMPTY_LOG_MESSAGE}</p>
      ) : (
        props.entries.map((entry, index) =>
          entry.speaker === "character" ? (
            <button
              type="button"
              // 並びは末尾に積むだけで、途中に差し込まれることも並べ替えもない。
              key={index}
              className={`${styles["chat-entry"]} ${styles["chat-entry-character"]}${
                index === props.selectedIndex ? ` ${styles["is-selected"]}` : ""
              }`}
              data-speaker="character"
              aria-pressed={index === props.selectedIndex}
              onClick={() => {
                props.onToggle(index)
              }}
            >
              {entry.text}
            </button>
          ) : (
            // 利用者の発言は押せない（遡る先の表情を持たないので、押しても何も起きない）。
            // **添えた画像の控えは吹き出しの中に並ぶ**（`docs/requirements.md` 4.10）。
            <div
              key={index}
              className={`${styles["chat-entry"]} ${styles["chat-entry-user"]}`}
              data-speaker="user"
            >
              {entry.text}
              <PromptImageThumbnails images={entry.images} />
            </div>
          ),
        )
      )}
    </div>
  )
}
