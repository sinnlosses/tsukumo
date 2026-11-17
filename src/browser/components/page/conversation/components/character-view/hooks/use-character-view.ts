// `<CharacterView>` のロジック。
// 表情・立ち絵の URL・動き・狭い画面の顔と最新の1件を、直近の `speak` とセッションの記録から組み立てて返す。
//
// 表情は `state.speechExpression`（直近の `speak` の引数）か、反応を出しているあいだはその行の表情。
// 時間経過で顔が変わるのは、依頼を待つ間に待ちの一言（反応）を出し始めたときだけ。
//
// 過去のターンのタブを選んでいる間は、そのターンの最後のセリフと表情に戻す（`useTurnSelection`）。
// 立ち絵の「動き」は時間相対のアニメーションなので遡らない。
//
// セリフのログの行を押すと、そのセリフの表情へ立ち絵が遡る。
// 留めた状態（`ViewedSpeech`）はここが持ち、セリフのログにも `pinnedSpeech` / `onToggleSpeech` として渡す（床に立つ立ち絵も同じものを共有するため）。

import { useState } from "react"

import type { Expression } from "../../../../../../../shared/character-pack/expression.ts"
import type { ItemSeatMap } from "../../../../../../../shared/item/item.ts"
import type { ShownReaction } from "../../../../../../../shared/session/shown-reaction.ts"
import { reportDraftingOf } from "../../../../../../../shared/session/turn-progress.ts"
import type { Speech } from "../../../../../../../shared/session/turn-speech.ts"
import { turnSpeeches, type TurnSpeech } from "../../../../../../../shared/session/turn-speech.ts"
import {
  characterFaceInfo,
  type CharacterFaceInfo,
} from "../../../../../../domain/character-face.ts"
import { portraitAppearance } from "../../../../../../domain/portrait-appearance.ts"
import {
  nextPortraitMotionTransitionDelayMs,
  resolvePortraitMotion,
  type PortraitMotion,
  type PortraitMotionInput,
} from "../../../../../../domain/portrait-motion.ts"
import { prefersReducedMotion } from "../../../../../../domain/reveal/reduced-motion.ts"
import { useExternalSync } from "../../../../../../hooks/use-external-sync.ts"
import { useSession } from "../../../../../../stores/session.ts"
import { useTurnSelection } from "../../../../../../stores/turn-selection.ts"
import { nowEpochMilliseconds } from "../../../../../../utils/clock.ts"
import { recordClockStampWithDay, type ClockStamp } from "../../../domain/clock-stamp.ts"
import { welcomeHeadOf } from "../../../domain/welcome-entry-list.ts"
import { useShownReaction, useWaitingLineDueAt } from "../../../stores/shown-reaction.ts"
import { useWelcomeCards } from "../../hooks/use-welcome-card-list.ts"
import {
  LATEST_VIEWED_SPEECH,
  pinnedSpeechOf,
  resolvePinnedSpeech,
  toggledViewedSpeech,
  type PinnedSpeech,
  type ViewedSpeech,
} from "../domain/pinned-speech.ts"
import { useTabVisibility } from "./use-tab-visibility.ts"
import { useWelcomeGreetingRecord } from "./use-welcome-greeting-record.ts"

/** そのターンにセリフが1件も無かったときに当てる表情（`INITIAL_SESSION_STATE` と同じ既定）。 */
const DEFAULT_PAST_TURN_EXPRESSION = "default"

/** `<CharacterView>` が画面に出す形。presenter はこれをそのまま部品へ渡すだけ。 */
export type CharacterViewModel = {
  /** 立ち絵の素材 URL。character が届いていなければ `undefined`（立ち絵を出さない）。 */
  readonly portraitUrl?: string
  readonly altText: string
  readonly expression: Expression
  readonly motion: PortraitMotion
  /** セリフのログの最新の吹き出しに添える話し手の名前。キャラクターが届いていない・名前が無ければ `undefined`。 */
  readonly speakerName?: string
  /** セリフのログへ渡す、いま留めている行（`<SpeechLog>` と印・表情の状態を共有する）。 */
  readonly pinnedSpeech?: PinnedSpeech
  /** セリフのログの行を押したとき（`<SpeechLog>` から呼ぶ。立ち絵の表情が遡る）。 */
  readonly onToggleSpeech: (turnId: number, index: number) => void
  /** セリフのログが開いているか。開く口は狭い画面の吹き出し。 */
  readonly speechLogOpen: boolean
  readonly onOpenSpeechLog: () => void
  readonly onCloseSpeechLog: () => void
  /** 狭い画面の顔（パックの `face` の1枚）。 */
  readonly face: CharacterFaceInfo
  /** 狭い画面の吹き出しに出す最新の1件。 */
  readonly phoneLine: PhoneBalloonLine
  /** 使用中のパックの3つの席に置いたアイテム。行が無ければ全席が空。 */
  readonly seats: ItemSeatMap
}

/**
 * 狭い画面の吹き出しに出す最新の1件。
 * 反応を出していればその字（迎えの挨拶を書いている途中なら `writing`）、無ければ表示中のセリフの最後の1件。
 */
export type PhoneBalloonLine =
  | { readonly kind: "none" }
  | { readonly kind: "writing" }
  | { readonly kind: "text"; readonly text: string; readonly time: ClockStamp }

export function useCharacterView(): CharacterViewModel {
  const { activeTurnId, newestTurnId } = useTurnSelection()
  const records = useSession((session) => session.state.records)
  const speeches = useSession((session) => session.state.speeches)
  const speechExpression = useSession((session) => session.state.speechExpression)
  const character = useSession((session) => session.state.character)
  const itemSeats = useSession((session) => session.state.itemSeats)
  const turn = useSession((session) => session.state.turn)
  const lastToolFailureAt = useSession((session) => session.state.lastToolFailureAt)
  const draftingReport = useSession(
    (session) => reportDraftingOf(session.state.sdkTurn).kind === "drafting",
  )
  const backgroundRunning = useSession((session) => session.state.backgroundTasks.length > 0)
  const interrupted = records
    .slice(records.findLastIndex((r) => r.kind === "request") + 1)
    .some((record) => record.kind === "turn-interrupted")
  const askedAt = useSession((session) => session.state.pending[0]?.askedAt)
  const sentAt = useSession((session) => session.lastSentAt)
  const tab = useTabVisibility()
  const [reducedMotion] = useState(() => prefersReducedMotion((query) => window.matchMedia(query)))
  const waitingDueAt = useWaitingLineDueAt()
  const { cards: welcomeCards } = useWelcomeCards()
  const welcomeHead = welcomeHeadOf(welcomeCards)
  useWelcomeGreetingRecord(welcomeHead)

  // 留めた行（ターンの番号と位置）は、どのターンも `turnSpeeches(records)` の並びで引く（セリフのログと同じ並び）。
  const turns = turnSpeeches(records)
  const speechesOfTurn = (turnId: number): readonly Speech[] | undefined =>
    turns.find((t) => t.id === turnId)?.speeches

  const [viewed, setViewed] = useState<ViewedSpeech>(LATEST_VIEWED_SPEECH)
  const [speechLogOpen, setSpeechLogOpen] = useState(false)

  const now = useCharacterClock(
    {
      turn,
      lastToolFailureAt,
      backgroundRunning,
      interrupted,
      askedAt,
      tab,
      sentAt,
      reducedMotion,
    },
    waitingDueAt,
  )
  const latestReaction = useShownReaction(welcomeHead, now)
  const pastTurn =
    activeTurnId === undefined || newestTurnId === undefined
      ? undefined
      : pastTurnSpeech(turns, activeTurnId, newestTurnId)
  const activeSpeeches = pastTurn === undefined ? speeches : pastTurn.speeches
  const reaction: ShownReaction = pastTurn === undefined ? latestReaction : { kind: "none" }
  // 過去のターンでは、記録に残った表情（そのターンの最後のセリフのもの）をそのまま当てる。
  const currentExpression = reaction.kind === "shown" ? reaction.line.expression : speechExpression
  const fallbackExpression =
    pastTurn === undefined
      ? currentExpression
      : (pastTurn.expression ?? DEFAULT_PAST_TURN_EXPRESSION)
  const pinnedSpeech = resolvePinnedSpeech(viewed, speechesOfTurn)
  // 失効した印を古い行に残すと、表情（最新に戻る）と印の位置が食い違う。
  const pinned = pinnedSpeech === undefined ? undefined : pinnedSpeechOf(viewed)
  const expression = pinnedSpeech?.expression ?? fallbackExpression
  const toggleSpeech = (turnId: number, index: number): void => {
    const current = pinnedSpeech === undefined ? LATEST_VIEWED_SPEECH : viewed
    setViewed(toggledViewedSpeech(current, turnId, index, speechesOfTurn(turnId)?.length ?? 0))
  }
  const motion = resolvePortraitMotion(
    {
      turn,
      lastToolFailureAt,
      draftingReport,
      backgroundRunning,
      interrupted,
      askedAt,
      tab,
      sentAt,
      reducedMotion,
    },
    now,
  )

  const { portraitUrl, altText } = portraitAppearance(character, expression)

  return {
    portraitUrl,
    altText,
    expression,
    motion,
    speakerName: character?.name,
    pinnedSpeech: pinned,
    onToggleSpeech: toggleSpeech,
    speechLogOpen,
    onOpenSpeechLog: () => setSpeechLogOpen(true),
    onCloseSpeechLog: () => setSpeechLogOpen(false),
    face: characterFaceInfo(character),
    phoneLine: phoneLineOf(reaction, activeSpeeches, now),
    seats: (character === undefined ? undefined : itemSeats[character.pack]) ?? EMPTY_SEATS,
  }
}

const EMPTY_SEATS: ItemSeatMap = {
  topLeft: undefined,
  belowLeft: undefined,
  belowRight: undefined,
}

function phoneLineOf(
  reaction: ShownReaction,
  speeches: readonly Speech[],
  now: number,
): PhoneBalloonLine {
  if (reaction.kind === "shown") {
    return {
      kind: "text",
      text: reaction.line.text,
      time: recordClockStampWithDay(reaction.time, now),
    }
  }
  if (reaction.kind === "writing") {
    return { kind: "writing" }
  }
  const latest = speeches.at(-1)
  return latest === undefined
    ? { kind: "none" }
    : { kind: "text", text: latest.text, time: recordClockStampWithDay(latest.time, now) }
}

/**
 * 過去のターンを見ているときだけ、そのターンのセリフ（出し始めた反応を含む）と表情を返す（今回を見ていれば undefined）。
 * 今のターンを記録から導き直さないのは、`request` で空に戻るなどの規則が `SessionState.speeches` 側にしか無いため。
 */
function pastTurnSpeech(
  turns: readonly TurnSpeech[],
  activeTurnId: number,
  newestTurnId: number,
): TurnSpeech | undefined {
  if (activeTurnId === newestTurnId) {
    return undefined
  }
  return turns.find((turn) => turn.id === activeTurnId)
}

/**
 * 立ち絵の動きと待ちの一言が時間だけで変わる瞬間に読み直すための時計。いまの時刻を返す。
 * 完了の反応・失敗でびくっ・呼ぶ・うなずくの期間が過ぎた瞬間と、待ちの一言を出し始める時刻（`waitingDueAt`）にだけ描き直す。
 *
 * 期間と期日は同時に効いていることがある（ツールが失敗した直後にターンが終わる、など）。
 * 次の描き直しまでの遅延はいちばん早いものだけなので、1回だけのタイマーだと、発火して `now` を進めたあとに残りがあっても次のタイマーが立たないまま止まる。
 * `lastToolFailureAt` / `turn` / `waitingDueAt` 自体はその後変わらないので、依存配列では再計算のきっかけにならない。
 * そこで、タイマーが発火するたびに次までの遅延を計算し直して、無くなるまで立て直す。
 *
 * 遅延を計算する前に必ず `now` を進める。
 * 効果が走るまでに時刻をすでに過ぎていると、遅延が負でタイマーが立たず、古い `now` のまま戻らなくなる。
 */
function useCharacterClock(
  motionInput: Pick<
    PortraitMotionInput,
    | "turn"
    | "lastToolFailureAt"
    | "backgroundRunning"
    | "interrupted"
    | "askedAt"
    | "tab"
    | "sentAt"
    | "reducedMotion"
  >,
  waitingDueAt?: number,
): number {
  const {
    turn,
    lastToolFailureAt,
    backgroundRunning,
    interrupted,
    askedAt,
    tab,
    sentAt,
    reducedMotion,
  } = motionInput
  const [now, setNow] = useState(() => nowEpochMilliseconds())

  useExternalSync(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const scheduleNext = (): void => {
      const at = nowEpochMilliseconds()
      setNow(at)
      const delays = [
        nextPortraitMotionTransitionDelayMs(
          {
            turn,
            lastToolFailureAt,
            backgroundRunning,
            interrupted,
            askedAt,
            tab,
            sentAt,
            reducedMotion,
          },
          at,
        ),
        waitingDueAt === undefined ? undefined : waitingDueAt - at,
      ].filter((ms): ms is number => ms !== undefined && ms > 0)
      if (delays.length === 0) {
        return
      }
      timer = setTimeout(scheduleNext, Math.min(...delays))
    }

    scheduleNext()
    return () => {
      if (timer !== undefined) {
        clearTimeout(timer)
      }
    }
  }, [
    turn,
    lastToolFailureAt,
    backgroundRunning,
    interrupted,
    askedAt,
    tab,
    sentAt,
    reducedMotion,
    waitingDueAt,
  ])

  return now
}
