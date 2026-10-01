// `<CharacterView>` のロジック。
// 表情・衣装・立ち絵の URL・動き・吹き出しに出すセリフを、直近の `speak` とセッションの記録から組み立てて返す。
//
// 表情は `state.speechExpression`（直近の `speak` の引数）か、反応を出しているあいだはその行の表情。衣装は `resolveOutfit(state.model)` で決める。
// 時間経過で顔が変わることはない。
//
// 過去のターンのタブを選んでいる間は、そのターンの吹き出しと表情に戻す（`useTurnSelection`）。
// 立ち絵の「動き」は時間相対のアニメーションなので遡らない。
//
// 吹き出し・セリフのログを押すと、そのセリフの表情へ立ち絵が遡る。
// 留めた状態（`ViewedSpeech`）はここが持ち、セリフのログにも `pinnedSpeech` / `onToggleSpeech` として渡す（床に立つ立ち絵も同じものを共有するため）。

import { useEffect, useState } from "react"

import type { ReactionKind } from "../../../../../../../shared/character-pack/character-reaction.ts"
import {
  resolveOutfit,
  type Expression,
  type Outfit,
} from "../../../../../../../shared/character-pack/expression.ts"
import {
  nextPortraitMotionTransitionDelayMs,
  resolvePortraitMotion,
  type PortraitMotion,
  type PortraitMotionInput,
} from "../../../../../../../shared/session/portrait-motion.ts"
import type { SessionRecord, Speech } from "../../../../../../../shared/session/session-state.ts"
import {
  shownReaction,
  type ShownReaction,
} from "../../../../../../../shared/session/shown-reaction.ts"
import { turnSpeeches, type TurnSpeech } from "../../../../../../../shared/session/turn-speech.ts"
import { portraitAppearance } from "../../../../../../domain/portrait-appearance.ts"
import { useSession } from "../../../../../../stores/session.ts"
import { useTurnSelection } from "../../../../../../stores/turn-selection.ts"
import { nowEpochMilliseconds } from "../../../../../../utils/clock.ts"
import {
  isSpeechSelected,
  LATEST_VIEWED_SPEECH,
  pinnedSpeechOf,
  resolvePinnedSpeech,
  toggledViewedSpeech,
  type PinnedSpeech,
  type ViewedSpeech,
} from "../domain/pinned-speech.ts"

/** そのターンにセリフが1件も無かったときに当てる表情（`INITIAL_SESSION_STATE` と同じ既定）。 */
const DEFAULT_PAST_TURN_EXPRESSION = "default"

/** 吹き出しに出す1件。押すとそのセリフの表情へ立ち絵が遡る。 */
export type CharacterViewSpeech = {
  readonly text: string
  /** 印を付ける行（= 立ち絵が従っている行）か。 */
  readonly selected: boolean
  readonly onToggle: () => void
}

/** 吹き出しの最新に出す反応。 */
export type BalloonReaction =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly reaction: ReactionKind; readonly text: string }

/** `<CharacterView>` が画面に出す形。presenter はこれをそのまま部品へ渡すだけ。 */
export type CharacterViewModel = {
  /** 立ち絵の素材 URL。character が届いていなければ `undefined`（吹き出しだけで成立させる）。 */
  readonly portraitUrl: string | undefined
  readonly accent: string | undefined
  readonly altText: string
  readonly expression: Expression
  readonly outfit: Outfit
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
}

export function useCharacterView(): CharacterViewModel {
  const { activeTurnId, newestTurnId } = useTurnSelection()
  const records = useSession((session) => session.state.records)
  const speeches = useSession((session) => session.state.speeches)
  const speechExpression = useSession((session) => session.state.speechExpression)
  const model = useSession((session) => session.state.model)
  const character = useSession((session) => session.state.character)
  const turn = useSession((session) => session.state.turn)
  const lastToolFailureAt = useSession((session) => session.state.lastToolFailureAt)
  const draftingReport = useSession((session) => session.state.reportDrafting.kind === "drafting")
  const state = useSession((session) => session.state)

  // いまも伸びているターン（今回）のセリフだけ `state.speeches` から引く。過去のターンは `turnSpeeches(records)` から引く。
  const speechesOfTurn = (turnId: number): readonly Speech[] | undefined =>
    turnId === newestTurnId
      ? speeches
      : turnSpeeches(records).find((t) => t.id === turnId)?.speeches

  const [viewed, setViewed] = useState<ViewedSpeech>(LATEST_VIEWED_SPEECH)

  const pastTurn = pastTurnSpeech(records, activeTurnId, newestTurnId)
  const activeSpeeches = pastTurn === undefined ? speeches : pastTurn.speeches
  const reaction: ShownReaction = pastTurn === undefined ? shownReaction(state) : { kind: "none" }
  // 何も留めていないとき、印が付くのは「いま表示しているターン」の最後の行。
  // 反応を出しているあいだは立ち絵が反応に従うので、どの行にも付けない。
  const defaultTurnId = activeTurnId
  const defaultIndex =
    activeSpeeches.length > 0 && reaction.kind === "none" ? activeSpeeches.length - 1 : undefined
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
  const outfit = resolveOutfit(model)
  const motion = usePortraitMotion({ turn, lastToolFailureAt, draftingReport })

  const { portraitUrl, accent, altText } = portraitAppearance(character, expression, outfit)

  return {
    portraitUrl,
    accent,
    altText,
    expression,
    outfit,
    motion,
    speeches: balloonSpeeches(activeSpeeches, defaultTurnId, pinned, defaultIndex, toggleSpeech),
    reaction:
      reaction.kind === "shown"
        ? { kind: "shown", reaction: reaction.reaction, text: reaction.line.text }
        : { kind: "none" },
    speakerName: character?.name,
    pinnedSpeech: pinned,
    onToggleSpeech: toggleSpeech,
  }
}

/**
 * `<BalloonTrack>` がそのまま置ける形に畳む。
 * `turnId` が undefined（記録にまだ乗っていないセリフを直に渡された、など）なら遡る先を特定できないので、文面だけ出して押しても何もしない。
 */
function balloonSpeeches(
  speeches: readonly Speech[],
  turnId: number | undefined,
  pinned: PinnedSpeech | undefined,
  defaultIndex: number | undefined,
  onToggle: (turnId: number, index: number) => void,
): readonly CharacterViewSpeech[] {
  return speeches.map((speech, index) => ({
    text: speech.text,
    selected: turnId !== undefined && isSpeechSelected(pinned, turnId, index, turnId, defaultIndex),
    onToggle: () => {
      if (turnId !== undefined) {
        onToggle(turnId, index)
      }
    },
  }))
}

/**
 * 過去のターンを見ているときだけ、そのターンのセリフと表情を返す（今回を見ていれば undefined）。
 * 今のターンを記録から導き直さないのは、`request` の時点で「前のターンの最後の1件だけ残す」規則が `SessionState.speeches` 側にしか無いため。
 */
function pastTurnSpeech(
  records: readonly SessionRecord[],
  activeTurnId: number | undefined,
  newestTurnId: number | undefined,
): TurnSpeech | undefined {
  if (activeTurnId === undefined || activeTurnId === newestTurnId) {
    return undefined
  }
  return turnSpeeches(records).find((turn) => turn.id === activeTurnId)
}

/**
 * 立ち絵にいま当てる動き。完了の反応・失敗でびくっの時間の窓が過ぎた瞬間に読み直すための時計を自前で持つ。
 *
 * この2つの窓は同時に効いていることがある（ツールが失敗した直後にターンが終わる、など）。
 * `nextPortraitMotionTransitionDelayMs` が返すのはいちばん早く終わる窓だけなので、1回だけのタイマーだと、発火して `now` を進めたあとにもう一方の窓が残っていても次のタイマーが立たないまま止まる。
 * `lastToolFailureAt` / `turn` 自体はその後変わらないので、依存配列では再計算のきっかけにならない。
 * そこで、タイマーが発火するたびに次の窓までの遅延を計算し直して、無くなるまで立て直す。
 *
 * 遅延を計算する前に必ず `now` を進める。
 * 効果が走るまでに窓をすでに過ぎていると、遅延が負でタイマーが立たず、古い `now` のまま動きが戻らなくなる。
 */
function usePortraitMotion(input: PortraitMotionInput): PortraitMotion {
  // 材料は分解して受ける（`input` の入れ物ごと依存にすると、中身が同じでもレンダーのたびに別物になり、タイマーを張り直してしまう）。
  // `turn` は入れ物だが、進み具合が変わったときだけ入れ替わるので依存にしてよい。
  const { turn, lastToolFailureAt } = input
  const [now, setNow] = useState(() => nowEpochMilliseconds())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const scheduleNext = (): void => {
      const at = nowEpochMilliseconds()
      setNow(at)
      const delay = nextPortraitMotionTransitionDelayMs({ turn, lastToolFailureAt }, at)
      if (delay === undefined) {
        return
      }
      timer = setTimeout(scheduleNext, delay)
    }

    scheduleNext()
    return () => {
      if (timer !== undefined) {
        clearTimeout(timer)
      }
    }
  }, [turn, lastToolFailureAt])

  return resolvePortraitMotion(input, now)
}
