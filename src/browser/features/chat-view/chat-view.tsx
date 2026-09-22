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
// **キャラクターから話しかけてもらうボタン**はログの末尾にある（docs/design.md 13.7）。
// 押すと `nudge` コマンドが1つ飛ぶだけで、**送る文面はブラウザが持たない**
// （`src/server/core/chat-nudge.ts`）。送った文面はログにも記録にも残らない。
//
// **これはプロトタイプ**。立ち絵の動きは「待っているか」だけで決めていて、
// キャラビューが持つ4つの動き（`features/character-view/` の `usePortraitMotion`）は
// 再現していない。手触りを見てから詰める。

import { useEffect, useRef, useState, type MouseEvent, type ReactElement } from "react"

import { resolveOutfitAccent, resolvePortraitUrl } from "../../../shared/character.ts"
import { chatLogEntries, type ChatLogEntry } from "../../../shared/chat-log.ts"
import { resolveExpressionLabel } from "../../../shared/expression-choice.ts"
import { resolveOutfit, type Expression } from "../../../shared/expression.ts"
import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import { Portrait } from "../../components/portrait.tsx"
import { PromptImageThumbnails } from "../../components/prompt-image.tsx"
import { useSessionDispatch, useSessionSelector } from "../../stores/session.tsx"
import styles from "./chat-view.module.css"

/** character.json に `name` が無い・定義自体が無いときの、立ち絵 alt テキストの既定名。 */
const DEFAULT_CHARACTER_ALT_NAME = "キャラクター"

/** まだ一度も話していないときの案内（吹き出しの「（まだ発話がありません）」と同じ立場）。 */
const EMPTY_LOG_MESSAGE = "（まだ何も話していません）"

/** キャラクターから話しかけてもらうボタンの字（docs/design.md 13.7）。 */
const NUDGE_LABEL = "話しかけてもらう"

/**
 * ターン進行中に押せない理由。**サーバが断るときと同じ1つの定型文**（`shared` の
 * `FRAME_ERROR_REASON`）を使う（サイドバーのキャラクターの `<select>` と同じ形）。
 */
const NUDGE_BLOCKED_TITLE = FRAME_ERROR_REASON.nudgeDuringTurn

/**
 * 「下端付近」とみなす、下端からの残り距離（px）。0 にすると、フォントの読み込みや
 * 小数点の丸めで scrollHeight がわずかにぶれただけで「読み返し中」と誤判定してしまうので、
 * 発言1件分の高さ（`.chat-entry` の padding・line-height から見て 60〜90px 程度）より
 * 少し広めに取る。
 */
const NEAR_BOTTOM_THRESHOLD_PX = 120

/**
 * 「押した」ではなく「ドラッグで文字を選んだ」とみなす、押し始めからの距離（px）。文字を1つ
 * 選ぶだけでも1文字ぶん（本文の大きさなら十数px）は動くので、手のぶれ（数px）と混ざらない。
 */
const DRAG_THRESHOLD_PX = 4

/** 押し始めた場所（ドラッグと押すの見分けに使う。{@link isSelectionDrag}）。 */
type PressOrigin = {
  readonly x: number
  readonly y: number
}

/**
 * 遡って見ているセリフ。**押した行の番号だけでなく、押した時点のセリフの件数も持つ** —
 * 件数が変われば選択は失効し、立ち絵は最新の表情へ戻る（{@link viewedIndex}）。
 */
type ViewedSpeech = {
  readonly index: number
  readonly speechCount: number
}

export function ChatView(): ReactElement {
  const records = useSessionSelector((session) => session.state.records)
  const speechExpression = useSessionSelector((session) => session.state.speechExpression)
  const model = useSessionSelector((session) => session.state.model)
  const character = useSessionSelector((session) => session.state.character)
  const turnInProgress = useSessionSelector((session) => session.state.turnInProgress)
  const entries = chatLogEntries(records)
  const outfit = resolveOutfit(model)

  // 遡って見ているセリフ。選んでいなければ undefined で、立ち絵は最新の表情に従う。
  // **新しいセリフが来たらその場で失効する** — 立ち絵は常に「いまのセリフ」を
  // 表す側へ倒す。読み返しの最中でも下へ攫わないスクロールの規則
  // （{@link NEAR_BOTTOM_THRESHOLD_PX}）とは**揃えない**: 流れていった行の印は画面の外にあるので、
  // 表情だけが遡ったまま動かないと、なぜ古いのかが画面から分からなくなる。
  //
  // 失効は effect で追いかけず、**レンダー中に件数を突き合わせて決める**（state から計算できる値。
  // docs/coding-standards.md「useEffect の代わりに使うもの」）。
  const [viewed, setViewed] = useState<ViewedSpeech | undefined>(undefined)
  const speechCount = countSpeeches(entries)
  const selectedIndex = viewedIndex(viewed, speechCount)
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
          // もう一度押したら解除する（新しいセリフを待たずに最新へ戻す道）。
          setViewed(selectedIndex === index ? undefined : { index, speechCount })
        }}
      />
    </div>
  )
}

/**
 * ログに並んでいるキャラクターのセリフの件数。**選択がまだ生きているか**を測る物差しで、
 * これが変われば {@link viewedIndex} が選択を失効させる。
 */
function countSpeeches(entries: readonly ChatLogEntry[]): number {
  return entries.reduce((count, entry) => (entry.speaker === "character" ? count + 1 : count), 0)
}

/**
 * いま印を付けて立ち絵を合わせる行。**押した時点から件数が変わっていれば undefined**
 * （新しいセリフが来た、または窓から古い記録が落ちた）。
 *
 * 件数1つで両方を捌けるのは、**セリフは末尾に積むだけ**で、窓
 * （`MAX_SESSION_STATE_TURNS`）を当てるのは利用者の発言が来たときだけだから
 * （`shared/session-state.ts` の `speech` と `request`）。つまり件数が同じなら並びは前へ
 * 詰まっておらず、押した番号は押した行を指したままになる。
 */
function viewedIndex(viewed: ViewedSpeech | undefined, speechCount: number): number | undefined {
  if (viewed === undefined || viewed.speechCount !== speechCount) {
    return undefined
  }
  return viewed.index
}

/**
 * 選んでいる行のセリフに添えられた表情。選んでいなければ undefined（立ち絵は最新のまま）。
 *
 * **選べるのはキャラクターのセリフだけ**だが、番号で持っている以上は型の上で外れうるので、
 * 外れたら最新へ戻す（印も同じ番号で決まるので、立ち絵と印が食い違うことはない）。
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
  // 押し始めた場所。**セリフの行は文字をドラッグで選べる**ので、選び終えて手を離したときの
  // click と、押した click を、動いた距離で見分ける（{@link isSelectionDrag}）。
  const pressOriginRef = useRef<PressOrigin | undefined>(undefined)
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
          // 圧縮の区切り（docs/glossary.md「圧縮の区切り」）。**文言を添えない細い線1本**で、
          // 押せない・畳めない（利用者の操作の対象にしない。docs/requirements.md 4.9）。`<hr>`
          // は元々「文言を持たない区切り」を表す要素なので、ここに説明文を足す必要が無い。
          entry.speaker === "boundary" ? (
            <hr key={index} className={styles["chat-boundary"]} data-speaker="boundary" />
          ) : entry.speaker === "character" ? (
            // **`<button>` ではなく `role="button"` の `<div>`**。ブラウザは
            // `<button>` の中の文字をドラッグで掴ませず（`user-select` を何にしても選べないことを
            // 実機の Chrome で確認した）、**セリフをコピーできなかった**。押せることは role と
            // `aria-pressed` で表し、キーの受けだけ自前で足す（{@link isActivationKey}）。
            <div
              // 並びは末尾に積むだけで、途中に差し込まれることも並べ替えもない。
              key={index}
              className={`${styles["chat-entry"]} ${styles["chat-entry-character"]}${
                index === props.selectedIndex ? ` ${styles["is-selected"]}` : ""
              }`}
              data-speaker="character"
              role="button"
              tabIndex={0}
              aria-pressed={index === props.selectedIndex}
              onMouseDown={(event) => {
                pressOriginRef.current = { x: event.clientX, y: event.clientY }
              }}
              onClick={(event) => {
                const origin = pressOriginRef.current
                pressOriginRef.current = undefined
                // **文字を選んだだけのときは遡らない**（選び終えて手を離すと click も飛ぶ）。
                if (isSelectionDrag(origin, event)) {
                  return
                }
                props.onToggle(index)
              }}
              onKeyDown={(event) => {
                if (!isActivationKey(event.key)) {
                  return
                }
                // Space はログを1画面送る既定の動作を持つので、押したことにする側で止める。
                event.preventDefault()
                props.onToggle(index)
              }}
            >
              {entry.text}
            </div>
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
      {/* **ログの末尾に置く**（docs/design.md 13.7）。区画も帯も作らないので、増えるのは
          操作子1つだけ（13.1 原則2）。ログが空のときは案内のすぐ下に出る。 */}
      <NudgeButton />
    </div>
  )
}

/**
 * その click が「押した」ではなく「文字をドラッグで選び終えた」ものか。**選び終えて手を離した
 * 瞬間にも click は飛ぶ**ので、見分けないとコピーしようとするたびに立ち絵が遡ってしまう。
 *
 * 見るのは**押し始めてから動いた距離**だけ（{@link DRAG_THRESHOLD_PX}）。
 * **いま選ばれている文字（`window.getSelection()`）は見ない** — 選んだ直後にその行を押すと、
 * 選択が消えるのは手を離したあと（ブラウザが「選択を掴んで運ぶ」動きを待つため）なので、
 * その回の click が丸ごと落ちて押せなくなる（実機の Chrome で確認）。
 *
 * `detail === 0` はマウスから来ていない click（支援技術が送るもの）で、押し始めの場所を
 * 持たないので、押したものとして扱う。
 */
function isSelectionDrag(origin: PressOrigin | undefined, event: MouseEvent<HTMLElement>): boolean {
  if (origin === undefined || event.detail === 0) {
    return false
  }
  return Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > DRAG_THRESHOLD_PX
}

/**
 * 押したことにするキー（WAI-ARIA の button パターンと同じ Enter と Space）。
 * **`<button>` と違って `role="button"` の要素にはブラウザが click を送らない**ので、
 * キーボードで遡る道はここで自分で開ける。
 */
function isActivationKey(key: string): boolean {
  return key === "Enter" || key === " "
}

/**
 * キャラクターから話しかけてもらう（docs/design.md 13.7）。**押した事実だけを送る** —
 * 文面は `src/server/core/chat-nudge.ts` が持ち、ブラウザは話題も一言も持たない（原則4）。
 *
 * **ターンが動いている間は押せない**（キャラクターの `<select>` と同じ立場。サーバ側も
 * 同じ条件で断る）。
 */
function NudgeButton(): ReactElement {
  const dispatch = useSessionDispatch()
  const turnInProgress = useSessionSelector((session) => session.state.turnInProgress)

  return (
    <button
      type="button"
      className={styles["chat-nudge"]}
      disabled={turnInProgress}
      title={turnInProgress ? NUDGE_BLOCKED_TITLE : undefined}
      onClick={() => {
        dispatch({ type: "nudge" })
      }}
    >
      {NUDGE_LABEL}
    </button>
  )
}
