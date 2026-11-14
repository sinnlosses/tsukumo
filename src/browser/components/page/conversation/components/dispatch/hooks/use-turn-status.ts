// `<TurnStatus>` のロジック。経過時間の刻みと、送信⇄中断のどちらを出すかを畳んだ値にして返す。
//
// 経過時間を出すのは雑談モードのときだけ。再試行中の知らせは雑談モードのときだけ。
// 1秒の刻みはローカルなタイマーで、`SessionState` に秒数は持たない。
//
// 押す先を決めるのもここ。
// 進行中でなければ `type="submit"` で、押すと `<Composer>` の `onSubmit` がそのまま依頼を送る（この部品は `<form>` の中に置かれることを前提にする）。
// 進行中は `interrupt` を dispatch する `type="button"` にして、送信と中断が同時に押せる状態を作らない。
//
// API の知らせもこの行に出す。出すのは1つだけで、強いほうを選ぶ（`turnStatusNotice`）。
// 仕事のときは利用上限だけで、再試行中と失敗の理由も出すのは雑談モードのときだけ。

import type { ApiTrouble } from "../../../../../../../shared/session-driver/api-trouble.ts"
import type { RateLimit } from "../../../../../../../shared/session-driver/rate-limit.ts"
import type { TurnProgress } from "../../../../../../../shared/session/turn-progress.ts"
import { useEventListener } from "../../../../../../hooks/use-event-listener.ts"
import { useNowWhile } from "../../../../../../stores/clock.ts"
import { useSession } from "../../../../../../stores/session.ts"
import {
  apiRetryNotice,
  turnFailureDetail,
  turnFailureLabel,
} from "../../../domain/api-error-label.ts"
import { rateLimitResetText, rateLimitSubject } from "../../../domain/rate-limit-label.ts"
import { isTurnCounting, turnElapsedLabel, turnElapsedText } from "../../../domain/turn-elapsed.ts"
import { useComposerDraft } from "../../../stores/composer-draft.ts"
import { useInquiryAnswer } from "../../../stores/inquiry-answer.ts"

const SEND_LABEL = "送信"
/** 答え待ちの質問があるあいだの送るボタンの字（最後の1問なら「答える」、手前なら「次へ」）。 */
const ANSWER_LABEL = "答える"
const NEXT_LABEL = "次へ"
const INTERRUPT_LABEL = "中断"
const STOP_LABEL = "止める"
/** 新しい器の入力欄で作業を止めるキー（⌘. か Ctrl+.）の札。 */
const STOP_KEY_HINT = "⌘."
const STOP_KEY = "."
const WORK_SEND_TITLE = "⌘⏎ で送る（委譲中は補足メッセージ）· ⌘⇧⏎ で新しい依頼として送る"
const CHAT_SEND_TITLE = "⌘⏎ で送る"
const ANSWER_TITLE = "⌘⏎ で答える"

/**
 * ボタン。送信と中断は同時に出さないので、どちらか1つに畳んでから presenter へ渡す。
 * `send` の `emphasis` は塗るか（`solid`）枠だけか（`quiet`）。答え待ちの質問のあいだは、自由入力の字があるときだけ塗る。
 */
type TurnStatusAction =
  | {
      readonly kind: "send"
      readonly label: string
      readonly emphasis: "solid" | "quiet"
      /** サーバと切れている間と、会話が終わったあとは押せない。 */
      readonly disabled: boolean
      readonly title: string
    }
  | {
      readonly kind: "interrupt"
      readonly label: string
      /** 押す代わりに打てるキーの札。`strip` では出さず空。 */
      readonly keyHint: string
      readonly onInterrupt: () => void
    }

/**
 * 進み具合を出す場所。`strip` はやり取りの札の頭（過去のやり取りを見ているあいだと狭い幅の入力欄）、`paper` は紙の計画と入力欄の札。
 * `paper` では、止めるボタンを「止める」と言い、⌘. で止められる。仕事のときの経過は紙の頭が出すので、入力欄には出さない。
 */
export type TurnStatusPlace = "strip" | "paper"

/**
 * 経過時間の行に添える API の知らせ（再試行中・利用上限・失敗の理由）。
 * `label` は行に出す短い字、`detail` は `title` で読ませる全文。
 * `tone` は枠と字の色（`warn` は続く・まだ使える、`ng` は止まった・使えない）。
 */
type TurnStatusNotice =
  | { readonly kind: "none" }
  | {
      readonly kind: "shown"
      readonly tone: "warn" | "ng"
      readonly label: string
      readonly detail: string
    }

/**
 * 経過時間の表示。仕事のときは出さない（`none`）。
 * `label` は進行中は「経過」、終わったあとは「所要」、失敗で終わったら「失敗」。
 * `text` は経過・所要で、まだ一度も依頼が無ければ `-`。
 */
type TurnStatusElapsed =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly label: string; readonly text: string }

/** `<TurnStatus>` が画面に出す形。 */
export type TurnStatusModel = {
  readonly elapsed: TurnStatusElapsed
  readonly action: TurnStatusAction
  readonly notice: TurnStatusNotice
}

export function useTurnStatus(place: TurnStatusPlace): TurnStatusModel {
  const dispatch = useSession((session) => session.dispatch)
  // 質問に答えている間は、ターンが進行中でも「中断」ではなく答えるボタンを出す（SDK は答えを待って止まっているので、押す先は中断ではなく送信）。
  const inquiry = useInquiryAnswer()
  const connected = useSession((session) => session.connection === "open")
  const ended = useSession((session) => session.state.endedReason !== undefined)
  const drafted = useComposerDraft((state) => state.draft.text.trim() !== "")
  // 姿の `turn` は進み具合が変わったときだけ入れ替わるので、そのまま依存にしてよい。
  const turn = useSession((session) => session.state.turn)
  const apiTrouble = useSession((session) => session.state.apiTrouble)
  const rateLimit = useSession((session) => session.state.rateLimit)
  const chatMode = useSession((session) => session.state.chatMode)
  const backgroundTaskCount = useSession((session) => session.state.backgroundTasks.length)
  const counting = isTurnCounting(turn, backgroundTaskCount)
  const paper = place === "paper"
  const now = useNowWhile((chatMode || paper) && counting)
  const interruptible = turn.kind === "running" && inquiry.kind !== "question"
  const interrupt = (): void => {
    void dispatch.session.interrupt()
  }
  useEventListener(
    window,
    "keydown",
    (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === STOP_KEY && !event.isComposing) {
        event.preventDefault()
        interrupt()
      }
    },
    { enabled: paper && interruptible },
  )

  return {
    elapsed: chatMode
      ? {
          kind: "shown",
          label: turnElapsedLabel(turn, backgroundTaskCount),
          text: turnElapsedText(turn, backgroundTaskCount, now),
        }
      : { kind: "none" },
    action: interruptible
      ? {
          kind: "interrupt",
          label: paper ? STOP_LABEL : INTERRUPT_LABEL,
          keyHint: paper ? STOP_KEY_HINT : "",
          onInterrupt: interrupt,
        }
      : {
          kind: "send",
          label: inquiry.kind === "question" ? questionSendLabel(inquiry.last) : SEND_LABEL,
          emphasis: inquiry.kind === "question" && !drafted ? "quiet" : "solid",
          disabled: !connected || ended,
          title: sendTitle(inquiry.kind === "question", chatMode),
        },
    notice: turnStatusNotice({ turn, apiTrouble, rateLimit, chatMode, now }),
  }
}

/**
 * 行に出す API の知らせ。強い順に1つだけ: 進行中の再試行 → 利用上限に達した → 失敗で終わったターンの理由。
 * 仕事のときは利用上限だけ（再試行中は進み具合のプログレスバー、失敗の理由はレポートの頭の失敗の表示が出す）。
 * 「利用上限が近い」は出さない（枠の残り具合は使用量の紙のプラン使用量が出す）。
 * 利用上限に達した知らせは戻る時刻を過ぎても次の知らせが来るまで出し続ける（戻ったかどうかは tsukumo からは分からず、次に API を呼んだときの知らせで消える）。
 */
function turnStatusNotice(source: {
  readonly turn: TurnProgress
  readonly apiTrouble: ApiTrouble
  readonly rateLimit: RateLimit
  readonly chatMode: boolean
  readonly now: number
}): TurnStatusNotice {
  const { turn, apiTrouble, rateLimit, chatMode } = source
  if (chatMode && turn.kind === "running" && apiTrouble.kind === "retrying") {
    return { kind: "shown", tone: "warn", ...apiRetryNotice(apiTrouble) }
  }
  if (rateLimit.kind === "rejected") {
    return rateLimitNotice(rateLimit, source.now)
  }
  if (chatMode && turn.kind === "finished" && turn.ending.kind === "failed") {
    return {
      kind: "shown",
      tone: "ng",
      label: turnFailureLabel(turn.ending.failure),
      detail: turnFailureDetail(turn.ending.failure),
    }
  }
  return { kind: "none" }
}

function rateLimitNotice(
  rateLimit: Extract<RateLimit, { readonly kind: "rejected" }>,
  now: number,
): TurnStatusNotice {
  const resetText = rateLimitResetText(rateLimit, now)
  const state = `${rateLimitSubject(rateLimit.bucket)}に達した`
  return {
    kind: "shown",
    tone: "ng",
    label: resetText.kind === "known" ? `利用上限 ${resetText.text}まで` : "利用上限",
    detail: resetText.kind === "known" ? `${state}。${resetText.text}に戻る` : state,
  }
}

/**
 * 送るボタンの `title`。脇の話になりうるのは仕事のときに依頼を送るときだけなので、⌘⇧⏎ の案内もそのときだけ添える。
 */
function sendTitle(answering: boolean, chatMode: boolean): string {
  if (answering) {
    return ANSWER_TITLE
  }
  return chatMode ? CHAT_SEND_TITLE : WORK_SEND_TITLE
}

/** 答え待ちの質問があるときの送るボタンの字。最後の1問だけ「答える」で手前は「次へ」。 */
function questionSendLabel(lastQuestion: boolean): string {
  return lastQuestion ? ANSWER_LABEL : NEXT_LABEL
}
