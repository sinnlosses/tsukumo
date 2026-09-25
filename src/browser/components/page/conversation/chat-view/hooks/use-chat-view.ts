// `<ChatView>` のロジック（docs/design.md 2章「機能の中を分ける」の container / presenter）。
// 立ち絵に出す表情（押して留めた行か、出した吹き出しか）、ログに並べる行（日の区切り・時刻・印・
// 弾む行を畳んだもの）、「...」を出すか、立ち絵をつついたときの送り先を組み立てて返す。
//
// **行を押して遡る・印・出すタイミング・「...」の決め方**は docs/screen-design.md 13.7。ここは
// それを「部品がそのまま置ける値」へ畳むだけで、部品（`components/`）は判定を持たない。

import { useState, type RefObject } from "react"

import {
  chatLogEntries,
  chatLogRows,
  type ChatLogEntry,
} from "../../../../../../shared/chat-log.ts"
import { resolveOutfit, type Expression, type Outfit } from "../../../../../../shared/expression.ts"
import { type RecordedPromptImage } from "../../../../../../shared/prompt-image.ts"
import { type RecordTime } from "../../../../../../shared/session-state.ts"
import { portraitAppearance } from "../../../../../domain/portrait-appearance.ts"
import {
  useSessionDispatch,
  useSessionSelector,
  useTurnRunning,
} from "../../../../../stores/session.tsx"
import {
  clockDateTime,
  clockTime,
  localTimeZoneId,
  zonedDateTime,
} from "../../../../../utils/clock.ts"
import { dayLabel } from "../../../../../utils/day-label.ts"
import { useRevealedChatLog } from "./use-speech-reveal.ts"
import { useStickToBottom } from "./use-stick-to-bottom.ts"

/**
 * 発言の脇に添える時刻。**前のセッションを組み直した発言は `unknown`** で、何も出さない
 * （docs/screen-design.md 13.7。流し直した時刻を代わりに出すと昨日の一言が「いま」に見える）。
 */
export type ChatTimeStamp =
  | { readonly kind: "unknown" }
  | { readonly kind: "known"; readonly dateTime: string; readonly text: string }

/**
 * ログの1行を、部品がそのまま置ける形に畳んだもの。並びは末尾に積むだけで、途中に差し込まれる
 * ことも並べ替えもないので、`key` は行の番号（日の区切りは日付）でよい。
 */
export type ChatRow =
  | {
      /** 日の区切り（docs/screen-design.md 13.7「時刻と日の区切り」）。日が変わった発言の手前にだけ入る。 */
      readonly kind: "day"
      readonly key: string
      readonly dateTime: string
      readonly label: string
    }
  | {
      /** 圧縮の区切り（docs/glossary.md「圧縮の区切り」）。文言を持たない。 */
      readonly kind: "boundary"
      readonly key: string
    }
  | {
      readonly kind: "speech"
      readonly key: string
      readonly text: string
      /** 印を付ける行（= 立ち絵が従っている行）か。 */
      readonly selected: boolean
      /** 現れるとき短く弾む行（docs/screen-design.md 13.7「セリフは全文で現れ、吹き出しは2秒空ける」）か。 */
      readonly pop: boolean
      readonly time: ChatTimeStamp
      readonly onToggle: () => void
    }
  | {
      readonly kind: "user"
      readonly key: string
      readonly text: string
      readonly images: readonly RecordedPromptImage[]
      readonly time: ChatTimeStamp
    }

/** `<ChatView>` が画面に出す形。presenter はこれをそのまま部品へ渡すだけ。 */
export type ChatViewModel = {
  /** 立ち絵の素材 URL。character が届いていなければ `undefined`（立ち絵を出さない）。 */
  readonly portraitUrl: string | undefined
  readonly accent: string | undefined
  /** **出ている絵をそのまま説明する**（行を押して遡れば、その行の表情の名前になる）。 */
  readonly altText: string
  readonly expression: Expression
  readonly outfit: Outfit
  readonly turnInProgress: boolean
  /** 立ち絵をつついたとき。**ターン進行中は何も送らない**（サーバ側も同じ条件で断る）。 */
  readonly onNudge: () => void
  /** ログの入れ物。下端付近を読んでいたときだけ最新へ寄せる（`use-stick-to-bottom.ts`）。 */
  readonly logRef: RefObject<HTMLDivElement | null>
  readonly rows: readonly ChatRow[]
  /** 返事を待っている間、末尾に「...」を出すか（docs/screen-design.md 13.7「返事を待つ間の「...」」）。 */
  readonly showTyping: boolean
  /** まだ何も話しておらず「...」も出ていないとき、最初の一言を促す案内を出すか。 */
  readonly showEmptyMessage: boolean
}

/**
 * 立ち絵がいま従っているセリフ。**既定は「最新」**（何も押していない状態。docs/screen-design.md 13.7）で、
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

export function useChatView(): ChatViewModel {
  const records = useSessionSelector((session) => session.state.records)
  const speechExpression = useSessionSelector((session) => session.state.speechExpression)
  const model = useSessionSelector((session) => session.state.model)
  const character = useSessionSelector((session) => session.state.character)
  const turnInProgress = useTurnRunning()
  const speechCalledInTurn = useSessionSelector((session) => session.state.speechCalledInTurn)
  const dispatch = useSessionDispatch()
  const entries = chatLogEntries(records)
  const outfit = resolveOutfit(model)
  // **ログに並べるのは、出してよいと決まった前置きだけ**（docs/screen-design.md 13.7「セリフは
  // 全文で現れ、吹き出しは2秒空ける」）。以下の遡り・自動スクロール・表情はすべてこの
  // `shown` を見る——出していない行を先に選べたり、自動スクロールが先取りしたりしないように。
  const { entries: shown, pending } = useRevealedChatLog(entries)
  const logRef = useStickToBottom(shown.length)

  // 現れるとき短く弾む行（docs/screen-design.md 13.7）。**弾むのは画面を開いたあとに届いた
  // 記録だけ**で、開いた時点で並んでいた記録（前の雑談の続き）には掛からない——遡って読む
  // ためのログが、開くたびに弾みながら組み上がることにならないように。
  const [initialCount] = useState(entries.length)

  // 立ち絵がいま従っているセリフ。押していなければ「最新（出した吹き出し）」で、印は
  // 最新のセリフの行に付く。**新しいセリフが来たら留めた選択はその場で失効する** — 立ち絵は
  // 常に「いまのセリフ」を表す側へ倒す。読み返しの最中でも下へ攫わないスクロールの規則
  // （`use-stick-to-bottom.ts`）とは**揃えない**: 流れていった行の印は画面の外にあるので、
  // 表情だけが遡ったまま動かないと、なぜ古いのかが画面から分からなくなる。
  //
  // 失効は effect で追いかけず、**レンダー中に件数を突き合わせて決める**（state から計算できる値。
  // docs/coding-standards.md「useEffect の代わりに使うもの」）。**件数は `shown` で数える**
  // （待たせている間は、まだ画面に出ていないセリフぶんで先に失効させない）。
  const [viewed, setViewed] = useState<ViewedSpeech>({ kind: "latest" })
  const speechCount = countSpeeches(shown)
  const pinnedIndex = pinnedSpeechIndex(viewed, speechCount)
  const shownSpeechIndex = lastSpeechIndex(shown)
  // 印を付ける行 = 立ち絵が従っている行（docs/screen-design.md 13.7）。留めていなければ最新のセリフ。
  const selectedIndex = pinnedIndex ?? shownSpeechIndex
  // **`SessionState` に新しい旗は増やさない** — 今のターンでまだ `speak` が呼ばれていないかは
  // `speechCalledInTurn` が既に持っている。**待たせているセリフが残っているあいだも出す**
  // （ターンが終わっていても、まだ出していない吹き出しがあれば「まだ喋ってくれる」の合図を
  // 続ける）。
  const showTyping = (turnInProgress && !speechCalledInTurn) || pending
  // 表情は「留めた行 → 出した吹き出し」の順に決まる（docs/screen-design.md 13.7）。
  // **留めていないときも `speechExpression`（届いた最新）をそのまま読まない** — 待たせている
  // 間は、届いたセリフではなく**すでに出した吹き出し**の表情のままにする。ただし**新しいターンの
  // 始まり（まだ何も話していない）は、待っている吹き出しがあっても構わず既定へ戻す**
  // （キャラビューと同じ扱い。`speechExpression` は `beginTurn` でここだけ即座に既定へ戻るので、
  // そのまま使ってよい）。
  const shownExpression =
    turnInProgress && !speechCalledInTurn
      ? speechExpression
      : (speechExpressionAt(shown, shownSpeechIndex) ?? speechExpression)
  const expression = speechExpressionAt(shown, pinnedIndex) ?? shownExpression

  function toggle(index: number): void {
    // **留めた行をもう一度押したら「最新」へ戻す**（新しいセリフを待たずに追従へ戻す道）。
    // 見るのは `selectedIndex` ではなく `pinnedIndex` — 既定で印が付いている最新の行を
    // 押したときは、解くものが無いので**留める**側に倒す（印の位置は変わらないが、
    // 次のターンが始まっても表情がその行に留まる）。
    setViewed(pinnedIndex === index ? { kind: "latest" } : { kind: "pinned", index, speechCount })
  }

  return {
    ...portraitAppearance(character, expression, outfit),
    expression,
    outfit,
    turnInProgress,
    onNudge: () => {
      if (turnInProgress) {
        return
      }
      dispatch.session.nudge()
    },
    logRef,
    // 日の境目と行ごとの時刻は、画面を見ている人のタイムゾーンで決める。
    rows: chatRows(shown, localTimeZoneId(), selectedIndex, initialCount, toggle),
    showTyping,
    showEmptyMessage: shown.length === 0 && !showTyping,
  }
}

/**
 * ログの並び（`shared/chat-log.ts` の `chatLogRows`）を、部品がそのまま置ける行へ畳む。
 * 日付と時刻の文字もここで組む（部品は `<time>` に置くだけ）。
 */
function chatRows(
  entries: readonly ChatLogEntry[],
  timeZone: string,
  selectedIndex: number | undefined,
  initialCount: number,
  onToggle: (index: number) => void,
): readonly ChatRow[] {
  return chatLogRows(entries, timeZone).map((row): ChatRow => {
    if (row.kind === "day") {
      return {
        kind: "day",
        key: `day-${row.date.toString()}`,
        dateTime: row.date.toString(),
        // 年も「今日」「昨日」も書かない —— ログが持つのは雑談の 100 ターンぶんで年をまたいでも
        // 並びの順で読めるし、時計を読んで書くと日付が変わったあとに描き直すまで古い呼び名が残る。
        label: dayLabel(row.date),
      }
    }
    const { entry, index } = row
    const key = String(index)
    switch (entry.speaker) {
      case "boundary":
        return { kind: "boundary", key }
      case "character":
        return {
          kind: "speech",
          key,
          text: entry.text,
          selected: index === selectedIndex,
          pop: index >= initialCount,
          time: timeStamp(entry.time, timeZone),
          onToggle: () => {
            onToggle(index)
          },
        }
      case "user":
        return {
          kind: "user",
          key,
          text: entry.text,
          images: entry.images,
          time: timeStamp(entry.time, timeZone),
        }
    }
  })
}

/** 発言の脇の時刻（`HH:MM`。秒は出さない）。組み直した発言は時刻が分からない。 */
function timeStamp(time: RecordTime, timeZone: string): ChatTimeStamp {
  if (time.kind === "restored") {
    return { kind: "unknown" }
  }
  const at = zonedDateTime(time.at, timeZone)
  return {
    kind: "known",
    dateTime: clockDateTime(at),
    text: clockTime(at),
  }
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
 * （docs/screen-design.md 13.7）。まだ1件も話していなければ undefined で、印はどこにも付かない。
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
