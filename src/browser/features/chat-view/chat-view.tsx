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
// **印は「立ち絵がいま従っている行」に付き、既定では最新のセリフに付いている**
// （docs/design.md 13.7。何も押していないと印がどこにも無く、行が押せること自体に
// 気づけなかった）。**枠も操作子も増やさない**（13.1 原則2）。**遡るのは押したときだけ**で、
// 行に載せただけでは立ち絵は動かない（2026-09-22 ユーザーの指示で、先に応える仕掛けを戻した）。
//
// **届いたばかりのセリフは末尾の行で育つ**（docs/design.md 13.7「末尾のセリフは育つ」。
// {@link ChatSpeech} と `hooks/use-speech-growth.ts`）。**サーバの契約は変えていない** —
// 1件まるごと届いたセリフを、ブラウザ側が1文字ずつ出すだけ。
//
// **返事を待っている間はログの末尾に「...」を出す**（docs/design.md 13.7「返事を待つ間の
// 「...」」。{@link ChatTyping}）。育つ吹き出しとは別の行で、そのターンの `speech` が届くと
// 入れ替わる。**サーバの契約は増やしていない** — 今のターンでまだ `speak` が呼ばれていないかは
// `SessionState.speechCalledInTurn` にすでにある。
//
// **立ち絵をつつくと話しかけてくれる**（docs/design.md 13.7。{@link NudgePortrait}）。
// 押すと `nudge` コマンドが1つ飛ぶだけで、**送る文面はブラウザが持たない**
// （`src/server/core/chat-nudge.ts`）。送った文面はログにも記録にも残らない。
//
// **これはプロトタイプ**。立ち絵の動きは「待っているか」だけで決めていて、
// キャラビューが持つ4つの動き（`features/character-view/` の `usePortraitMotion`）は
// 再現していない。手触りを見てから詰める。

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
} from "react"

import { resolveOutfitAccent, resolvePortraitUrl } from "../../../shared/character.ts"
import { chatLogEntries, type ChatLogEntry } from "../../../shared/chat-log.ts"
import { resolveExpressionLabel } from "../../../shared/expression-choice.ts"
import { resolveOutfit, type Expression, type Outfit } from "../../../shared/expression.ts"
import { Portrait } from "../../components/portrait.tsx"
import { PromptImageThumbnails } from "../../components/prompt-image.tsx"
import { useSessionDispatch, useSessionSelector } from "../../stores/session.tsx"
import styles from "./chat-view.module.css"
import { useSpeechGrowth } from "./hooks/use-speech-growth.ts"

/** character.json に `name` が無い・定義自体が無いときの、立ち絵 alt テキストの既定名。 */
const DEFAULT_CHARACTER_ALT_NAME = "キャラクター"

/**
 * まだ一度も話していないときの案内（吹き出しの「（まだ発話がありません）」と同じ立場）。
 * **最初の一言を促すのはこの文面**（docs/design.md 13.7）— 促す操作子が立ち絵へ移ったので、
 * ログが空のときに「どこを押せばよいか」を指すものがここ以外に無い。
 */
const EMPTY_LOG_MESSAGE = "（まだ何も話していません。立ち絵をつつくと話しかけてくれます）"

/**
 * 立ち絵に載せたときに出る案内（docs/design.md 13.7）。**ホバーの間だけ見えるので常設の枠は
 * 増えない**（13.1 原則2）が、**支援技術には常に届く**（立ち絵を包むボタンの
 * `aria-describedby` が指す）。
 *
 * **ターン進行中はこの案内ごと出さない**（2026-09-22 ユーザーの指示。それまでは押せない理由の
 * 定型文に差し替えていた）。返事を待っている間は字を増やさない。
 */
const NUDGE_HINT = "話しかけてもらう"

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
 * 立ち絵がいま従っているセリフ。**既定は「最新」**（何も押していない状態。docs/design.md 13.7）で、
 * 行を押すと「留めた」へ移る。
 *
 * 留めた側は**行の番号だけでなく、押した時点のセリフの件数も持つ** — 件数が変われば留めた
 * 選択は失効し、「最新」と同じ見え方へ戻る（{@link pinnedSpeechIndex}）。
 * **「最新」と「留めた」を `undefined` で書き分けない**のは、既定が「印がどこにも無い」では
 * なく「最新の行に印が付いている」になったため（`docs/coding-standards.md`
 * 「複数の「無い」が1つの状態」）。
 */
type ViewedSpeech =
  | { readonly kind: "latest" }
  | { readonly kind: "pinned"; readonly index: number; readonly speechCount: number }

export function ChatView(): ReactElement {
  const records = useSessionSelector((session) => session.state.records)
  const speechExpression = useSessionSelector((session) => session.state.speechExpression)
  const model = useSessionSelector((session) => session.state.model)
  const character = useSessionSelector((session) => session.state.character)
  const turnInProgress = useSessionSelector((session) => session.state.turn.kind === "running")
  const speechCalledInTurn = useSessionSelector((session) => session.state.speechCalledInTurn)
  const entries = chatLogEntries(records)
  const outfit = resolveOutfit(model)

  // 立ち絵がいま従っているセリフ。押していなければ「最新」で、印は最新のセリフの行に付く。
  // **新しいセリフが来たら留めた選択はその場で失効する** — 立ち絵は常に「いまのセリフ」を
  // 表す側へ倒す。読み返しの最中でも下へ攫わないスクロールの規則
  // （{@link NEAR_BOTTOM_THRESHOLD_PX}）とは**揃えない**: 流れていった行の印は画面の外にあるので、
  // 表情だけが遡ったまま動かないと、なぜ古いのかが画面から分からなくなる。
  //
  // 失効は effect で追いかけず、**レンダー中に件数を突き合わせて決める**（state から計算できる値。
  // docs/coding-standards.md「useEffect の代わりに使うもの」）。
  const [viewed, setViewed] = useState<ViewedSpeech>({ kind: "latest" })
  const speechCount = countSpeeches(entries)
  const pinnedIndex = pinnedSpeechIndex(viewed, speechCount)
  const latestSpeechIndex = lastSpeechIndex(entries)
  // 印を付ける行 = 立ち絵が従っている行（docs/design.md 13.7）。留めていなければ最新のセリフ。
  const selectedIndex = pinnedIndex ?? latestSpeechIndex
  // 育てる行（docs/design.md 13.7「末尾のセリフは育つ」）。**育つのは画面を開いたあとに届いた
  // セリフだけ**で、開いた時点で並んでいた記録（前の雑談の続き）には掛からない——遡って読む
  // ためのログが、開くたびに端から書き直されることになる。
  const [initialSpeechCount] = useState(speechCount)
  const growingIndex = speechCount > initialSpeechCount ? latestSpeechIndex : undefined
  // 返事を待っている間だけ、ログの末尾に「...」を出す（docs/design.md 13.7「返事を待つ間の
  // 「...」」）。**`SessionState` に新しい旗は増やさない** — 今のターンでまだ `speak` が
  // 呼ばれていないかは `speechCalledInTurn` が既に持っている。
  const showTyping = turnInProgress && !speechCalledInTurn
  // 表情は「留めた行 → 最新」の順に決まる（docs/design.md 13.7）。
  // **留めていないときに読むのは `speechExpression`** で、最新の行の表情ではない —
  // 次のターンが始まると `speak` が来るまで既定へ戻る（キャラビューと同じ扱い。表情の源は
  // `speak` の1つだけ。docs/requirements.md 4.3）。印はその間も最新のセリフの行に残る。
  const expression = speechExpressionAt(entries, pinnedIndex) ?? speechExpression

  const portraitUrl =
    character === undefined ? undefined : resolvePortraitUrl(character.portraits, expression)
  const accent =
    character === undefined ? undefined : resolveOutfitAccent(character.outfitAccents, outfit)
  // **alt は出ている絵をそのまま説明する**（行を押して遡れば、その行の表情の名前になる）。
  const altText = `${character?.name ?? DEFAULT_CHARACTER_ALT_NAME}（${resolveExpressionLabel(
    character?.expressions ?? [],
    expression,
  )}）`

  return (
    <div className={styles["chat-region"]}>
      {portraitUrl !== undefined && (
        <NudgePortrait
          url={portraitUrl}
          accent={accent}
          altText={altText}
          expression={expression}
          outfit={outfit}
          turnInProgress={turnInProgress}
        />
      )}
      <ChatLog
        entries={entries}
        selectedIndex={selectedIndex}
        growingIndex={growingIndex}
        showTyping={showTyping}
        onToggle={(index) => {
          // **留めた行をもう一度押したら「最新」へ戻す**（新しいセリフを待たずに追従へ戻す道）。
          // 見るのは `selectedIndex` ではなく `pinnedIndex` — 既定で印が付いている最新の行を
          // 押したときは、解くものが無いので**留める**側に倒す（印の位置は変わらないが、
          // 次のターンが始まっても表情がその行に留まる）。
          setViewed(
            pinnedIndex === index ? { kind: "latest" } : { kind: "pinned", index, speechCount },
          )
        }}
      />
    </div>
  )
}

/**
 * ログに並んでいるキャラクターのセリフの件数。**留めた選択がまだ生きているか**を測る物差しで、
 * これが変われば {@link pinnedSpeechIndex} が選択を失効させる。
 */
function countSpeeches(entries: readonly ChatLogEntry[]): number {
  return entries.reduce((count, entry) => (entry.speaker === "character" ? count + 1 : count), 0)
}

/**
 * 押して留めている行。**押した時点から件数が変わっていれば undefined**（新しいセリフが来た、
 * または窓から古い記録が落ちた）で、印も立ち絵も「最新」の側へ戻る。
 *
 * 件数1つで両方を捌けるのは、**セリフは末尾に積むだけ**で、窓
 * （`MAX_SESSION_STATE_TURNS`）を当てるのは利用者の発言が来たときだけだから
 * （`shared/session-state.ts` の `speech` と `request`）。つまり件数が同じなら並びは前へ
 * 詰まっておらず、押した番号は押した行を指したままになる。
 */
function pinnedSpeechIndex(viewed: ViewedSpeech, speechCount: number): number | undefined {
  if (viewed.kind === "latest" || viewed.speechCount !== speechCount) {
    return undefined
  }
  return viewed.index
}

/**
 * いちばん新しいキャラクターのセリフの行。**何も押していないときに印が付く行**
 * （docs/design.md 13.7）。まだ1件も話していなければ undefined で、印はどこにも付かない。
 */
function lastSpeechIndex(entries: readonly ChatLogEntry[]): number | undefined {
  const index = entries.findLastIndex((entry) => entry.speaker === "character")
  return index === -1 ? undefined : index
}

/**
 * その行のセリフに添えられた表情。行を指していなければ undefined（呼び出し側が次の手へ倒す）。
 *
 * **番号が指せるのはキャラクターのセリフだけ**だが、番号で持っている以上は型の上で外れうるので、
 * 外れたら undefined を返す（印も同じ番号で決まるので、立ち絵と印が食い違うことはない）。
 */
function speechExpressionAt(
  entries: readonly ChatLogEntry[],
  index: number | undefined,
): Expression | undefined {
  if (index === undefined) {
    return undefined
  }
  const entry = entries[index]
  return entry === undefined || entry.speaker !== "character" ? undefined : entry.expression
}

/**
 * つつくと話しかけてくれる立ち絵（docs/design.md 13.7）。**押した事実だけを送る** —
 * 文面は `src/server/core/chat-nudge.ts` が持ち、ブラウザは話題も一言も持たない（原則4）。
 *
 * **押せることを持たせるのはここで、`components/portrait.tsx` ではない**。立ち絵は
 * キャラビューとキャラクター画面も使う共有部品で、そちら（仕事のとき・整える面）の立ち絵は
 * 押せないままにする。**包むのは `<button>`** — セリフの行と違って立ち絵には選ぶ文字が無いので、
 * `role="button"` ＋ 自前のキーの受け（{@link isActivationKey}）が要らず、キーボードで押せる
 * 道はブラウザが最初から持っている。
 *
 * **ターンが動いている間は押せない**（モードの `<select>` と同じ立場。サーバ側も同じ条件で
 * 断る）。ただし `disabled` にはしない — ブラウザが `disabled` の要素にホバーもフォーカスも
 * 通さないので、キーボードで辿り着ける道ごと消える。`aria-disabled` で伝え、送らないのは
 * ここで止める。**案内（{@link NUDGE_HINT}）はその間だけ出さない**ので、`aria-describedby` も
 * 指す先を持たない。**立ち絵そのものは薄めない**（要素の `opacity` は地ごと透かす。
 * docs/design.md 13.8）。
 */
function NudgePortrait(props: {
  readonly url: string
  readonly accent: string | undefined
  readonly altText: string
  readonly expression: Expression
  readonly outfit: Outfit
  readonly turnInProgress: boolean
}): ReactElement {
  const dispatch = useSessionDispatch()
  const hintId = useId()

  return (
    <button
      type="button"
      className={styles["chat-poke"]}
      // 名前は立ち絵の alt のまま（中身から計算される）。**何が起きるかは説明のほう**に置く
      // ので、`aria-label` で alt を覆わない。
      aria-describedby={props.turnInProgress ? undefined : hintId}
      aria-disabled={props.turnInProgress}
      onClick={() => {
        if (props.turnInProgress) {
          return
        }
        dispatch({ type: "nudge" })
      }}
    >
      <Portrait
        url={props.url}
        accent={props.accent}
        altText={props.altText}
        expression={props.expression}
        outfit={props.outfit}
        motion={props.turnInProgress ? "waiting" : "reading"}
        className={styles["chat-portrait"]}
      />
      {/* 案内はホバーの間だけ見えるが、**支援技術には常に届く**（`aria-describedby` は
          見た目ではなく木の中に在るかで決まるので、`display: none` ではなく透明にして隠す）。
          **ターン進行中は木からも消す** — 押せないうえに、代わりに出す字を持たない。 */}
      {!props.turnInProgress && (
        <span className={styles["chat-poke-hint"]} id={hintId}>
          {NUDGE_HINT}
        </span>
      )}
    </button>
  )
}

/**
 * 会話のログ。**古い→新しいの順にそのまま積み**、下端付近を読んでいたときだけ新しい1件で
 * 最新へ寄せる（読み返している最中は動かさない。docs/design.md 13.7）。`column-reverse` を
 * 使わないのは、この並びが「最新だけを読む」吹き出しではなく**遡って読み返せるログ**だから。
 */
function ChatLog(props: {
  readonly entries: readonly ChatLogEntry[]
  /** 印を付ける行（= 立ち絵が従っている行）。セリフが1件も無ければどこにも付かない。 */
  readonly selectedIndex: number | undefined
  /** 育てる行（docs/design.md 13.7）。届いたばかりのセリフが無ければどこも育たない。 */
  readonly growingIndex: number | undefined
  /**
   * 返事を待っている間、末尾に「...」を出すか（docs/design.md 13.7「返事を待つ間の「...」」）。
   */
  readonly showTyping: boolean
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

  // React の外にある DOM（スクロール位置）への書き込み。**下端付近を読んでいたときだけ**
  // 最新へ寄せる（読み返している最中に下へ攫わない。docs/design.md 13.7）。
  //
  // 呼ぶのは2か所で、**どちらも同じこの規則に従う**: 件数が増えたとき（下の effect）と、
  // 末尾のセリフが育って高さが伸びたとき（その下の effect）。**育っている最中に上へ転がせば
  // そこで追従が外れる**（寄せた直後の `scroll` は下端に居るままなので、自分で自分を外さない）。
  const stickToBottom = useCallback(() => {
    const log = logRef.current
    if (log === null || !nearBottomRef.current) {
      return
    }
    log.scrollTop = log.scrollHeight
  }, [])

  useEffect(() => {
    if (count === 0) {
      return
    }
    stickToBottom()
  }, [count, stickToBottom])

  // 外部システム（DOM の文字の変化）の購読。**末尾のセリフは1文字ずつ増えて育つ**
  // （{@link ChatSpeech}）ので、件数が変わらないまま高さが伸びる。伸びたぶんを同じ規則で
  // 追いかける口がここ。
  //
  // **行の側から知らせ返さない**（育っている行がログのスクロールを知らずに済む）。見るのは
  // 文字の変化だけなので、押して印が移ったとき（class と `aria-pressed` が変わるだけ）には
  // 動かない。
  useEffect(() => {
    const log = logRef.current
    if (log === null) {
      return
    }
    const observer = new MutationObserver(stickToBottom)
    observer.observe(log, { subtree: true, characterData: true, childList: true })
    return () => {
      observer.disconnect()
    }
  }, [stickToBottom])

  return (
    <div className={styles["chat-log"]} ref={logRef}>
      {count === 0 && !props.showTyping ? (
        <p className={styles["chat-empty"]}>{EMPTY_LOG_MESSAGE}</p>
      ) : (
        <>
          {props.entries.map((entry, index) =>
            // 圧縮の区切り（docs/glossary.md「圧縮の区切り」）。**文言を添えない細い線1本**で、
            // 押せない・畳めない（利用者の操作の対象にしない。docs/requirements.md 4.9）。`<hr>`
            // は元々「文言を持たない区切り」を表す要素なので、ここに説明文を足す必要が無い。
            entry.speaker === "boundary" ? (
              <hr key={index} className={styles["chat-boundary"]} data-speaker="boundary" />
            ) : entry.speaker === "character" ? (
              <ChatSpeech
                // 並びは末尾に積むだけで、途中に差し込まれることも並べ替えもない。
                key={index}
                text={entry.text}
                selected={index === props.selectedIndex}
                grow={index === props.growingIndex}
                onToggle={() => {
                  props.onToggle(index)
                }}
              />
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
          )}
          {/* 返事を待っている間だけ末尾に出す「...」（docs/design.md 13.7「返事を待つ間の
              「...」」）。育つ吹き出しとは別の行で、そのターンの `speech` が届くとこの行は
              消え、届いたセリフの行が育ち始める。 */}
          {props.showTyping && <ChatTyping />}
        </>
      )}
    </div>
  )
}

/**
 * 返事を待っている間、ログの末尾に出す「...」（docs/design.md 13.7「返事を待つ間の「...」」。
 * Discord などと同じ、キャラクター側の吹き出しとしての typing indicator）。
 *
 * **育つ吹き出し（{@link ChatSpeech}）の初期状態ではなく、別の行**——セリフの文字がまだ
 * 無いので育てようが無い。そのターンの `speech` が届くと `showTyping` が下りてこの行は消え、
 * 入れ替わりに届いたセリフの行（{@link ChatSpeech}）が育ち始める。
 *
 * **押せる行にしない**（利用者の発言の行と同じ立場。遡る先の表情を持たないので `role="button"`
 * も `tabIndex` も付けない）。ドット3つは装飾で、待っていること自体は `<TurnStatus>` の経過
 * 表示（`features/dispatch/turn-status.tsx`）が文字で伝えているので、支援技術の木からは
 * `aria-hidden` で外す。
 */
function ChatTyping(): ReactElement {
  return (
    <div
      className={`${styles["chat-entry"]} ${styles["chat-entry-typing"]}`}
      data-speaker="typing"
      aria-hidden="true"
    >
      <span className={styles["chat-typing-dot"]} />
      <span className={styles["chat-typing-dot"]} />
      <span className={styles["chat-typing-dot"]} />
    </div>
  )
}

/**
 * キャラクターのセリフ1件（docs/design.md 13.7）。**押すとその時の表情へ立ち絵が遡り**、
 * **届いたばかりの1件はここで育つ**（{@link useSpeechGrowth}）。
 *
 * **`<button>` ではなく `role="button"` の `<div>`**。ブラウザは `<button>` の中の文字を
 * ドラッグで掴ませず（`user-select` を何にしても選べないことを実機の Chrome で確認した）、
 * **セリフをコピーできなかった**。押せることは role と `aria-pressed` で表し、キーの受けだけ
 * 自前で足す（{@link isActivationKey}）。
 *
 * **育っている最中の押しは打ち切りに使い、遡りはその回には起きない**（docs/design.md 13.7）。
 * 揃うより先に留めても、何を留めたのかが読めないため。
 */
function ChatSpeech(props: {
  readonly text: string
  readonly selected: boolean
  readonly grow: boolean
  readonly onToggle: () => void
}): ReactElement {
  const growth = useSpeechGrowth(props.text, props.grow)
  // 押し始めた場所。**セリフの行は文字をドラッグで選べる**ので、選び終えて手を離したときの
  // click と、押した click を、動いた距離で見分ける（{@link isSelectionDrag}）。
  const pressOriginRef = useRef<PressOrigin | undefined>(undefined)

  return (
    <div
      className={`${styles["chat-entry"]} ${styles["chat-entry-character"]}${
        props.selected ? ` ${styles["is-selected"]}` : ""
      }`}
      data-speaker="character"
      // 育っている間だけ立てる印（筆先を出す CSS の掛かり先と、目視・テストの手がかり）。
      data-growing={growth.growing ? "yes" : undefined}
      role="button"
      tabIndex={0}
      aria-pressed={props.selected}
      onMouseDown={(event) => {
        pressOriginRef.current = { x: event.clientX, y: event.clientY }
      }}
      onClick={(event) => {
        const origin = pressOriginRef.current
        pressOriginRef.current = undefined
        // **育っている最中は、押しても遡らずその場で全文を出す**（文字を選ぼうとしたときも
        // 同じ — 選べる字が揃う）。
        if (growth.growing) {
          growth.finish()
          return
        }
        // **文字を選んだだけのときは遡らない**（選び終えて手を離すと click も飛ぶ）。
        if (isSelectionDrag(origin, event)) {
          return
        }
        props.onToggle()
      }}
      onKeyDown={(event) => {
        if (!isActivationKey(event.key)) {
          return
        }
        // Space はログを1画面送る既定の動作を持つので、押したことにする側で止める。
        event.preventDefault()
        if (growth.growing) {
          growth.finish()
          return
        }
        props.onToggle()
      }}
    >
      {growth.shown}
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
