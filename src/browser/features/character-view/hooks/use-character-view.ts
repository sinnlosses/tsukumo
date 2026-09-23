// `<CharacterView>` のロジック（docs/design.md 2章「機能の中を分ける」の container /
// presenter。1件目の `task-board` と同じ形）。表情・衣装・立ち絵の URL・動き・吹き出しに
// 出すセリフを、直近の `speak` とセッションの記録から組み立てて返す。
//
// 表情は `state.speechExpression`（直近の `speak` の引数）、衣装は `resolveOutfit(state.model)`
// で決める。**表情の源は `speak` だけ**なので、時間経過で顔が変わることはない（ツールの実行中に
// 「作業中」へ自動で切り替える経路と、そのための遅延タイマーは撤去した。
// docs/requirements.md 4.3）。
//
// **過去のターンのタブを選んでいる間は、そのターンの吹き出しと表情に戻す**
// （`useTurnSelection`。レポート同様にセリフも遡る）。
// **立ち絵の「動き」は遡らない**（時間相対のアニメーションで、遡るには
// `docs/requirements.md` 4.3 の決定の見直しが要る。別タスク）。

import { useEffect, useState } from "react"

import { isBlankText } from "../../../../shared/blank-text.ts"
import { resolveOutfit, type Expression, type Outfit } from "../../../../shared/expression.ts"
import {
  nextPortraitMotionTransitionDelayMs,
  resolvePortraitMotion,
  type PortraitMotion,
  type PortraitMotionInput,
} from "../../../../shared/portrait-motion.ts"
import { type SessionRecord } from "../../../../shared/session-state.ts"
import { turnSpeeches, type TurnSpeech } from "../../../../shared/turn-speech.ts"
import { portraitAppearance } from "../../../domain/portrait-appearance.ts"
import { useSessionSelector } from "../../../stores/session.tsx"
import { useTurnSelection } from "../../../stores/turn-selection.tsx"
import { nowEpochMilliseconds } from "../../../utils/clock.ts"

/**
 * セリフが1件も無い**過去の**ターンを見ているときの文言。今のターンの「（まだ発話がありません）」
 * （`balloon-track.tsx`）は、もう終わったターンには合わない（「まだ」＝これから来る、の言い方）。
 */
const PAST_TURN_EMPTY_MESSAGE = "（このターンでは発話がありませんでした）"

/** そのターンにセリフが1件も無かったときに当てる表情（`INITIAL_SESSION_STATE` と同じ既定）。 */
const DEFAULT_PAST_TURN_EXPRESSION = "default"

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
  readonly speeches: readonly string[]
  /** セリフが1件も無いときに出す文言。今回のターンを見ていれば `undefined`（既定文に任せる）。 */
  readonly emptyMessage: string | undefined
  /** 最新の吹き出しに添える話し手の名前。キャラクターが届いていない・名前が無ければ `undefined`。 */
  readonly speakerName: string | undefined
}

export function useCharacterView(): CharacterViewModel {
  const { activeTurnId, newestTurnId } = useTurnSelection()
  const records = useSessionSelector((session) => session.state.records)
  const speeches = useSessionSelector((session) => session.state.speeches)
  const speechExpression = useSessionSelector((session) => session.state.speechExpression)
  const model = useSessionSelector((session) => session.state.model)
  const character = useSessionSelector((session) => session.state.character)
  const turn = useSessionSelector((session) => session.state.turn)
  const lastToolFailureAt = useSessionSelector((session) => session.state.lastToolFailureAt)
  const speechCalledInTurn = useSessionSelector((session) => session.state.speechCalledInTurn)
  const partialUtterance = useSessionSelector((session) => session.state.partialUtterance)

  const pastTurn = pastTurnSpeech(records, activeTurnId, newestTurnId)
  // 過去のターンでは、記録に残った表情（そのターンの最後のセリフのもの）をそのまま当てる。
  const expression =
    pastTurn === undefined
      ? speechExpression
      : (pastTurn.expression ?? DEFAULT_PAST_TURN_EXPRESSION)
  const outfit = resolveOutfit(model)
  // 導き方の理由は `PortraitMotionInput.hasPartialUtteranceAfterSpeech` の説明にある。
  const hasPartialUtteranceAfterSpeech = speechCalledInTurn && !isBlankText(partialUtterance)
  const motion = usePortraitMotion({ turn, lastToolFailureAt, hasPartialUtteranceAfterSpeech })

  const { portraitUrl, accent, altText } = portraitAppearance(character, expression, outfit)

  return {
    portraitUrl,
    accent,
    altText,
    expression,
    outfit,
    motion,
    speeches: pastTurn === undefined ? speeches : pastTurn.speeches,
    emptyMessage: pastTurn === undefined ? undefined : PAST_TURN_EMPTY_MESSAGE,
    speakerName: character?.name,
  }
}

/**
 * 過去のターンを見ているときだけ、そのターンのセリフと表情を返す（今回を見ていれば undefined）。
 * 今のターンを記録から導き直さないのは、`request` の時点で「前のターンの最後の1件だけ残す」
 * 規則（docs/display.md 4.2）が `SessionState.speeches` 側にしか無いため。
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
 * 立ち絵にいま当てる動き。**完了の反応・失敗でびくっの時間の窓が過ぎた瞬間に読み直すための
 * 時計を自前で持つ**（元は `useNowForPortraitMotion` と `usePortraitMotion` の2つに分けていたが、
 * 呼び出しは後者からの1箇所だけだったので1つの関数に畳んだ。**振る舞いは変えていない**）。
 *
 * この2つの窓は同時に効いていることがある（ツールが失敗した直後にターンが終わる、など）。
 * 1回だけ先のタイマーを立てる形だと、`nextPortraitMotionTransitionDelayMs` が返すのは
 * **いちばん早く終わる窓**だけなので、そのタイマーが1回発火して `now` を進めたあとに
 * **もう一方の窓がまだ残っていても、次のタイマーが立たないまま止まってしまう**
 * （`lastToolFailureAt` / `turn` 自体はその後変わらないので、依存配列だけを見ている
 * 素朴な1回きりのタイマーでは再計算のきっかけが無い）。そこで、**タイマーが発火するたびに
 * 自分で次の窓までの遅延を計算し直して、無くなるまで立て直す**。
 */
function usePortraitMotion(input: PortraitMotionInput): PortraitMotion {
  // 材料は分解して受ける（`input` の入れ物ごと依存にすると、中身が同じでもレンダーのたびに
  // 別物になり、タイマーを張り直してしまう）。**`turn` は入れ物だが姿が持っているものそのもの**
  // で、進み具合が変わったときだけ入れ替わるので依存にしてよい。
  const { turn, lastToolFailureAt } = input
  const [now, setNow] = useState(() => nowEpochMilliseconds())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const scheduleNext = (): void => {
      const delay = nextPortraitMotionTransitionDelayMs(
        { turn, lastToolFailureAt },
        nowEpochMilliseconds(),
      )
      if (delay === undefined) {
        return
      }
      timer = setTimeout(() => {
        setNow(nowEpochMilliseconds())
        scheduleNext()
      }, delay)
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
