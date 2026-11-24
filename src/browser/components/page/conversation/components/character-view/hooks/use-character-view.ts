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
// 留めた状態（`ViewedSpeech`）はページの `useViewedSpeech` が持ち、ここは読んで、セリフのログにも `pinnedSpeech` / `onToggleSpeech` として渡す（床に立つ立ち絵も同じものを共有するため）。

import { useState } from "react"

import { faceAtOf } from "../../../../../../../shared/character-pack/character.ts"
import type { Expression } from "../../../../../../../shared/character-pack/expression.ts"
import type { ItemSeatMap } from "../../../../../../../shared/item/item.ts"
import { reportDraftingOf } from "../../../../../../../shared/session/turn-progress.ts"
import type { Speech } from "../../../../../../../shared/session/turn-speech.ts"
import { turnSpeeches } from "../../../../../../../shared/session/turn-speech.ts"
import {
  characterFaceInfo,
  type CharacterFaceInfo,
} from "../../../../../../domain/character-face.ts"
import { portraitAppearance } from "../../../../../../domain/portrait-appearance.ts"
import {
  endingManpuOf,
  isListeningPose,
  newestTurnFinishedTask,
  resolvePortraitMotion,
  type EndingManpu,
  type PortraitMotion,
  type PortraitMotionInput,
} from "../../../../../../domain/portrait-motion.ts"
import { prefersReducedMotionNow } from "../../../../../../stores/gear-preference-seed.ts"
import { useSession } from "../../../../../../stores/session.ts"
import { useTurnSelection } from "../../../../../../stores/turn-selection.ts"
import { nowEpochMilliseconds } from "../../../../../../utils/clock.ts"
import type { PinnedSpeech } from "../../../domain/pinned-speech.ts"
import { SPEECH_ARRIVALS, type SpeechManpu, type VoiceAt } from "../../../domain/speech-arrival.ts"
import { welcomeHeadOf } from "../../../domain/welcome-entry-list.ts"
import { useComposerDraft } from "../../../stores/composer-draft.ts"
import { useShownReaction, useWaitingLineDueAt } from "../../../stores/shown-reaction.ts"
import { useSpeechArrival } from "../../../stores/speech-arrival.ts"
import { useViewedSpeech } from "../../../stores/viewed-speech.ts"
import { useWelcomeCards } from "../../hooks/use-welcome-card-list.ts"
import { arrivalManpuOf, newerManpu, type ArrivalManpu } from "../domain/arrival-manpu.ts"
import { viewedSpeechOf } from "../domain/past-turn-view.ts"
import { phoneLineOf, type PhoneBalloonLine } from "../domain/phone-line.ts"
import { scrollToFollowedRow } from "./scroll-to-followed-row.ts"
import { useCharacterClock } from "./use-character-clock.ts"
import { useTabVisibility } from "./use-tab-visibility.ts"
import { useWelcomeGreetingRecord } from "./use-welcome-greeting-record.ts"

/** `<CharacterView>` が画面に出す形。presenter はこれをそのまま部品へ渡すだけ。 */
export type CharacterViewModel = {
  /** 立ち絵の素材 URL。character が届いていなければ `undefined`（立ち絵を出さない）。 */
  readonly portraitUrl?: string
  readonly altText: string
  readonly expression: Expression
  readonly motion: PortraitMotion
  /** 入力欄に字があって、聞く姿勢を取るか（`isListeningPose`）。 */
  readonly listeningPose: boolean
  /** セリフのログの最新の吹き出しに添える話し手の名前。キャラクターが届いていない・名前が無ければ `undefined`。 */
  readonly speakerName?: string
  /** セリフのログへ渡す、いま留めている行（`<SpeechLog>` と印・表情の状態を共有する）。 */
  readonly pinnedSpeech?: PinnedSpeech
  /**
   * 立ち絵を押したとき。留めた行があれば、留めたままその行の動きと出方をもう一度掛ける。
   * 無ければ、いまの一言まで流れを送り、その動きと出方をもう一度掛ける。
   */
  readonly onPortraitPress: () => void
  /** セリフのログの行を押したとき（`<SpeechLog>` から呼ぶ。立ち絵の表情が遡る）。 */
  readonly onToggleSpeech: (turnId: number, index: number) => void
  /** セリフのログが開いているか。開く口は狭い画面の吹き出し。 */
  readonly speechLogOpen: boolean
  readonly onOpenSpeechLog: () => void
  readonly onCloseSpeechLog: () => void
  /** セリフが届いた瞬間の漫符。出さないときは `none`。`at` が替わるたびに作り直して1回だけ再生させる。 */
  readonly manpu: ArrivalManpu
  /** エフェクトを出したとき。立ち絵を押して掛け直すときに同じものを出すため、出した声と組で控える。 */
  readonly onManpuShown: (manpu: SpeechManpu | EndingManpu, voice?: VoiceAt) => void
  /** 狭い画面の顔（パックの `face` の1枚）。 */
  readonly face: CharacterFaceInfo
  /** 狭い画面の吹き出しに出す最新の1件。 */
  readonly phoneLine: PhoneBalloonLine
  /** 使用中のパックの3つの席に置いたアイテム。行が無ければ全席が空。 */
  readonly seats: ItemSeatMap
}

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
  const taskFinished = newestTurnFinishedTask(records)
  const askedAt = useSession((session) => session.state.pending[0]?.askedAt)
  const sentAt = useSession((session) => session.lastSentAt)
  const tab = useTabVisibility()
  const arrived = useSpeechArrival((state) => state.arrival)
  const arrivalMotion =
    arrived.kind === "arrived" ? SPEECH_ARRIVALS[arrived.expression].motion : "still"
  const arrival: PortraitMotionInput["arrival"] =
    arrived.kind === "arrived" && arrivalMotion !== "still"
      ? { at: arrived.at, motion: arrivalMotion }
      : undefined
  const [reducedMotion] = useState(prefersReducedMotionNow)
  const waitingDueAt = useWaitingLineDueAt()
  const { cards: welcomeCards } = useWelcomeCards()
  const welcomeHead = welcomeHeadOf(welcomeCards)
  useWelcomeGreetingRecord(welcomeHead)

  // 留めた行（ターンの番号と位置）は、どのターンも `turnSpeeches(records)` の並びで引く（セリフのログと同じ並び）。
  const turns = turnSpeeches(records)
  const speechesOfTurn = (turnId: number): readonly Speech[] | undefined =>
    turns.find((t) => t.id === turnId)?.speeches

  const viewed = useViewedSpeech((state) => state.viewed)
  const toggleSpeech = useViewedSpeech((state) => state.toggle)
  const draftHasText = useComposerDraft((state) => state.draft.text !== "")
  const releaseSpeech = useViewedSpeech((state) => state.release)
  const replayArrival = useSpeechArrival((state) => state.replay)
  const recordShownManpu = useSpeechArrival((state) => state.recordShown)
  const [speechLogOpen, setSpeechLogOpen] = useState(false)

  const motionBase = {
    turn,
    lastToolFailureAt,
    backgroundRunning,
    interrupted,
    askedAt,
    tab,
    reducedMotion,
    taskFinished,
  }
  const now = useCharacterClock({ ...motionBase, sentAt, arrival }, waitingDueAt)
  const latestReaction = useShownReaction(welcomeHead, now)
  const { activeSpeeches, reaction, expression, pinnedSpeech, pinned } = viewedSpeechOf({
    turns,
    activeTurnId,
    newestTurnId,
    speeches,
    speechExpression,
    latestReaction,
    viewed,
    speechesOfTurn,
  })
  const motion = resolvePortraitMotion({ ...motionBase, draftingReport, sentAt, arrival }, now)

  const { portraitUrl, altText } = portraitAppearance(character, expression)

  return {
    portraitUrl,
    altText,
    expression,
    motion,
    listeningPose: isListeningPose(motion, draftHasText, reducedMotion),
    speakerName: character?.name,
    pinnedSpeech: pinned,
    onPortraitPress: () => {
      if (pinned !== undefined && pinnedSpeech !== undefined) {
        replayArrival(nowEpochMilliseconds(), {
          kind: "pinned",
          ...pinned,
          expression: pinnedSpeech.expression,
        })
        return
      }
      releaseSpeech()
      replayArrival(nowEpochMilliseconds(), { kind: "newest" })
      requestAnimationFrame(() => {
        scrollToFollowedRow()
      })
    },
    onToggleSpeech: toggleSpeech,
    speechLogOpen,
    onOpenSpeechLog: () => setSpeechLogOpen(true),
    onCloseSpeechLog: () => setSpeechLogOpen(false),
    manpu: newerManpu(
      arrivalManpuOf(arrived, reducedMotion, now, character),
      endingManpuOf(motionBase, now),
      faceAtOf(expression, character),
    ),
    onManpuShown: recordShownManpu,
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
