// `<CharacterView>` のロジック。
// 表情・立ち絵の URL・動き・吹き出しに出すセリフを、直近の `speak` とセッションの記録から組み立てて返す。
//
// 表情は `state.speechExpression`（直近の `speak` の引数）か、反応を出しているあいだはその行の表情。
// 時間経過で顔が変わるのは、依頼を待つ間に待ちの一言（反応）を出し始めたときだけ。
//
// 過去のターンのタブを選んでいる間は、そのターンの吹き出しと表情に戻す（`useTurnSelection`）。
// 立ち絵の「動き」は時間相対のアニメーションなので遡らない。
//
// 吹き出し・セリフのログを押すと、そのセリフの表情へ立ち絵が遡る。
// 留めた状態（`ViewedSpeech`）はここが持ち、セリフのログにも `pinnedSpeech` / `onToggleSpeech` として渡す（床に立つ立ち絵も同じものを共有するため）。

import { useEffect, useState } from "react"

import type { Expression } from "../../../../../../../shared/character-pack/expression.ts"
import type { ItemSeatMap } from "../../../../../../../shared/item/item.ts"
import type { ReactionKind } from "../../../../../../../shared/recommendation/reaction.ts"
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
import { useSession } from "../../../../../../stores/session.ts"
import { useTurnSelection } from "../../../../../../stores/turn-selection.ts"
import { nowEpochMilliseconds } from "../../../../../../utils/clock.ts"
import { recordClockStampWithDay, type ClockStamp } from "../../../domain/clock-stamp.ts"
import { welcomeHeadOf } from "../../../domain/welcome-entry-list.ts"
import { useShownReaction, useWaitingLineDueAt } from "../../../stores/shown-reaction.ts"
import { useWelcomeCards } from "../../hooks/use-welcome-card-list.ts"
import {
  balloonLineIndices,
  isSpeechSelected,
  LATEST_VIEWED_SPEECH,
  pinnedSpeechOf,
  resolvePinnedSpeech,
  toggledViewedSpeech,
  type MarkedSpeech,
  type PinnedSpeech,
  type SpeechTarget,
  type ViewedSpeech,
} from "../domain/pinned-speech.ts"
import { useWelcomeGreetingRecord } from "./use-welcome-greeting-record.ts"

/** そのターンにセリフが1件も無かったときに当てる表情（`INITIAL_SESSION_STATE` と同じ既定）。 */
const DEFAULT_PAST_TURN_EXPRESSION = "default"

/** 吹き出しに出す1件。押すとそのセリフの表情へ立ち絵が遡る。 */
export type CharacterViewSpeech = {
  readonly text: string
  /** 吹き出しに添える時刻（名前を添える最新の1件は名前の隣、ほかは吹き出しの脇）。今日でない日のものは日付つき。 */
  readonly time: ClockStamp
  /** 印を付ける行（= 立ち絵が従っている行）か。 */
  readonly selected: boolean
  /** 押すと遡る先。特定できなければ undefined（文面だけ出して押しても何もしない）。 */
  readonly target: SpeechTarget | undefined
}

/** 吹き出しの最新に出す反応。`writing` は迎えの挨拶を書いている途中で、「…」を出す。 */
export type BalloonReaction =
  | { readonly kind: "none" }
  | { readonly kind: "writing" }
  | {
      readonly kind: "shown"
      readonly reaction: ReactionKind
      readonly text: string
      /** 出し始めた時刻。分からなければ `unknown`。 */
      readonly time: ClockStamp
    }

/** `<CharacterView>` が画面に出す形。presenter はこれをそのまま部品へ渡すだけ。 */
export type CharacterViewModel = {
  /** 立ち絵の素材 URL。character が届いていなければ `undefined`（吹き出しだけで成立させる）。 */
  readonly portraitUrl: string | undefined
  readonly altText: string
  readonly expression: Expression
  readonly motion: PortraitMotion
  /** 吹き出しに出すセリフ（古い→新しい）。過去のターンを見ていればそのターンぶんに差し替わる。 */
  readonly speeches: readonly CharacterViewSpeech[]
  /** 吹き出しの最新に出す反応。過去のターンを見ているあいだは出さない。 */
  readonly reaction: BalloonReaction
  /** 最新の吹き出しに添える話し手の名前。キャラクターが届いていない・名前が無ければ `undefined`。 */
  readonly speakerName: string | undefined
  /** セリフのログへ渡す、いま留めている行（`<SpeechLog>` と印・表情の状態を共有する）。 */
  readonly pinnedSpeech: PinnedSpeech | undefined
  /** セリフのログの行を押したとき（`<SpeechLog>` から呼ぶ。吹き出しと同じ状態を動かす）。 */
  readonly onToggleSpeech: (turnId: number, index: number) => void
  /** セリフのログが開いているか。開く口は「ログ」と狭い画面の吹き出しの2つ。 */
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

  const now = useCharacterClock(turn, lastToolFailureAt, waitingDueAt)
  const latestReaction = useShownReaction(welcomeHead, now)
  const pastTurn =
    activeTurnId === undefined || newestTurnId === undefined
      ? undefined
      : pastTurnSpeech(turns, activeTurnId, newestTurnId)
  const activeSpeeches = pastTurn === undefined ? speeches : pastTurn.speeches
  // 吹き出しの各件が、留めた行の並びの何番目か。今のターンの吹き出しは反応を含まないので、並びの位置へ写す。
  const lineIndices =
    pastTurn === undefined
      ? balloonLineIndices(
          turns.find((t) => t.id === activeTurnId)?.speeches ?? [],
          speeches.length,
        )
      : pastTurn.speeches.map((_, index) => index)
  const reaction: ShownReaction = pastTurn === undefined ? latestReaction : { kind: "none" }
  // 何も留めていないとき、印が付くのは「いま表示しているターン」の最後の吹き出し。
  // 反応を出しているあいだは立ち絵が反応に従うので、どの行にも付けない。
  const defaultIndex = reaction.kind === "none" ? lineIndices?.at(-1) : undefined
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
  const marked: MarkedSpeech =
    pinned !== undefined
      ? { kind: "at", ...pinned }
      : activeTurnId !== undefined && defaultIndex !== undefined
        ? { kind: "at", turnId: activeTurnId, index: defaultIndex }
        : { kind: "none" }
  const anchor: BalloonAnchor =
    activeTurnId === undefined || lineIndices === undefined
      ? { kind: "none" }
      : { kind: "anchored", turnId: activeTurnId, lineIndices, marked }
  const toggleSpeech = (turnId: number, index: number): void => {
    const current = pinnedSpeech === undefined ? LATEST_VIEWED_SPEECH : viewed
    setViewed(toggledViewedSpeech(current, turnId, index, speechesOfTurn(turnId)?.length ?? 0))
  }
  const motion = resolvePortraitMotion({ turn, lastToolFailureAt, draftingReport }, now)

  const { portraitUrl, altText } = portraitAppearance(character, expression)

  return {
    portraitUrl,
    altText,
    expression,
    motion,
    speeches: balloonSpeeches(activeSpeeches, anchor, now),
    reaction: balloonReactionOf(reaction, now),
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

/** `ShownReaction` を `BalloonReaction` の形へ畳む（時刻を字にするほかは、持ち物をそのまま運ぶだけ）。 */
function balloonReactionOf(reaction: ShownReaction, now: number): BalloonReaction {
  switch (reaction.kind) {
    case "shown":
      return {
        kind: "shown",
        reaction: reaction.reaction,
        text: reaction.line.text,
        time: recordClockStampWithDay(reaction.time, now),
      }
    case "writing":
      return { kind: "writing" }
    case "none":
      return { kind: "none" }
  }
}

/**
 * 吹き出しが遡る先。
 * `lineIndices` は各件が留めた行の並びの何番目か（{@link balloonLineIndices}）。
 * 遡る先を特定できない（`none`）ときは、文面だけ出して押しても何もしない。
 */
type BalloonAnchor =
  | { readonly kind: "none" }
  | {
      readonly kind: "anchored"
      readonly turnId: number
      readonly lineIndices: readonly number[]
      readonly marked: MarkedSpeech
    }

/** `<BalloonTrack>` がそのまま置ける形に畳む。 */
function balloonSpeeches(
  speeches: readonly Speech[],
  anchor: BalloonAnchor,
  now: number,
): readonly CharacterViewSpeech[] {
  return speeches.map((speech, position) => {
    const text = speech.text
    const time = recordClockStampWithDay(speech.time, now)
    if (anchor.kind === "none") {
      return { text, time, selected: false, target: undefined }
    }
    const index = anchor.lineIndices[position]
    if (index === undefined) {
      return { text, time, selected: false, target: undefined }
    }
    return {
      text,
      time,
      selected: isSpeechSelected(anchor.marked, anchor.turnId, index),
      target: { turnId: anchor.turnId, index },
    }
  })
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
 * 完了の反応・失敗でびくっの時間の窓が過ぎた瞬間と、待ちの一言を出し始める時刻（`waitingDueAt`）にだけ描き直す。
 *
 * 窓と期日は同時に効いていることがある（ツールが失敗した直後にターンが終わる、など）。
 * 次の描き直しまでの遅延はいちばん早いものだけなので、1回だけのタイマーだと、発火して `now` を進めたあとに残りがあっても次のタイマーが立たないまま止まる。
 * `lastToolFailureAt` / `turn` / `waitingDueAt` 自体はその後変わらないので、依存配列では再計算のきっかけにならない。
 * そこで、タイマーが発火するたびに次までの遅延を計算し直して、無くなるまで立て直す。
 *
 * 遅延を計算する前に必ず `now` を進める。
 * 効果が走るまでに時刻をすでに過ぎていると、遅延が負でタイマーが立たず、古い `now` のまま戻らなくなる。
 */
function useCharacterClock(
  turn: PortraitMotionInput["turn"],
  lastToolFailureAt: PortraitMotionInput["lastToolFailureAt"],
  waitingDueAt: number | undefined,
): number {
  const [now, setNow] = useState(() => nowEpochMilliseconds())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const scheduleNext = (): void => {
      const at = nowEpochMilliseconds()
      setNow(at)
      const delays = [
        nextPortraitMotionTransitionDelayMs({ turn, lastToolFailureAt }, at),
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
  }, [turn, lastToolFailureAt, waitingDueAt])

  return now
}
