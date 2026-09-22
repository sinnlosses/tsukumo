// キャラビュー本体（<CharacterView>。docs/design.md 6.1）。立ち絵（<Portrait>）と吹き出しの並び
// （<BalloonTrack>）を同じ領域に同居させる（`docs/glossary.md`「キャラビュー」）。
//
// 表情は `state.speechExpression`（直近の `speak` の引数）、衣装は `resolveOutfit(state.model)`
// で決める。**表情の源は `speak` だけ**なので、時間経過で顔が変わることはない（ツールの実行中に
// 「作業中」へ自動で切り替える経路と、そのための遅延タイマーは撤去した。
// docs/requirements.md 4.3）。
//
// **立ち絵の素材（URL）が無いときは `<Portrait>` を出さず、吹き出しだけで成立させる**
// （docs/requirements.md 4.2「フォールバック」）。
//
// **過去のターンのタブを選んでいる間は、そのターンの吹き出しと表情に戻す**
// （`useTurnSelection`。レポート同様にセリフも遡る）。
// **立ち絵の「動き」は遡らない**（時間相対のアニメーションで、遡るには
// `docs/requirements.md` 4.3 の決定の見直しが要る。別タスク）。

import { useEffect, useState, type ReactElement } from "react"

import { resolveOutfitAccent, resolvePortraitUrl } from "../../../shared/character.ts"
import { resolveExpressionLabel } from "../../../shared/expression-choice.ts"
import { resolveOutfit } from "../../../shared/expression.ts"
import {
  nextPortraitMotionTransitionDelayMs,
  resolvePortraitMotion,
  type PortraitMotion,
  type PortraitMotionInput,
} from "../../../shared/portrait-motion.ts"
import { type SessionRecord } from "../../../shared/session-state.ts"
import { turnSpeeches, type TurnSpeech } from "../../../shared/turn-speech.ts"
import { Portrait } from "../../components/portrait.tsx"
import { useSessionSelector } from "../../stores/session.tsx"
import { useTurnSelection } from "../../stores/turn-selection.tsx"
import { BalloonTrack } from "./balloon-track.tsx"
import styles from "./character-view.module.css"

/** character.json に `name` が無い・定義自体が無いときの、立ち絵 alt テキストの既定名。 */
const DEFAULT_CHARACTER_ALT_NAME = "キャラクター"

/**
 * セリフが1件も無い**過去の**ターンを見ているときの文言。今のターンの「（まだ発話がありません）」
 * （`balloon-track.tsx`）は、もう終わったターンには合わない（「まだ」＝これから来る、の言い方）。
 */
const PAST_TURN_EMPTY_MESSAGE = "（このターンでは発話がありませんでした）"

/** そのターンにセリフが1件も無かったときに当てる表情（`INITIAL_SESSION_STATE` と同じ既定）。 */
const DEFAULT_PAST_TURN_EXPRESSION = "default"

/**
 * 立ち絵の動きの「完了の反応」「失敗でびくっ」を、時間の窓が過ぎた瞬間に読み直すための時計。
 *
 * **この2つの窓は同時に効いていることがある**（ツールが失敗した直後にターンが終わる、など）。
 * 1回だけ先のタイマーを立てる形だと、`nextPortraitMotionTransitionDelayMs` が返すのは
 * **いちばん早く終わる窓**だけなので、そのタイマーが1回発火して `now` を進めたあとに
 * **もう一方の窓がまだ残っていても、次のタイマーが立たないまま止まってしまう**
 * （`lastToolFailureAt` / `turnFinishedAt` 自体はその後変わらないので、依存配列だけを見ている
 * 素朴な1回きりのタイマーでは再計算のきっかけが無い）。そこで、**タイマーが発火するたびに
 * 自分で次の窓までの遅延を計算し直して、無くなるまで立て直す**。
 */
function useNowForPortraitMotion(input: PortraitMotionInput): number {
  // 材料の3つは分解して受ける（入れ物ごと依存にすると、中身が同じでもレンダーのたびに
  // 別物になり、タイマーを張り直してしまう）。
  const { turnInProgress, turnFinishedAt, lastToolFailureAt } = input
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const scheduleNext = (): void => {
      const delay = nextPortraitMotionTransitionDelayMs(
        { turnInProgress, turnFinishedAt, lastToolFailureAt },
        Date.now(),
      )
      if (delay === undefined) {
        return
      }
      timer = setTimeout(() => {
        setNow(Date.now())
        scheduleNext()
      }, delay)
    }

    scheduleNext()
    return () => {
      if (timer !== undefined) {
        clearTimeout(timer)
      }
    }
  }, [turnInProgress, turnFinishedAt, lastToolFailureAt])

  return now
}

/** 立ち絵にいま当てる動き。 */
function usePortraitMotion(input: PortraitMotionInput): PortraitMotion {
  const now = useNowForPortraitMotion(input)
  return resolvePortraitMotion(input, now)
}

/**
 * 過去のターンを見ているときだけ、そのターンのセリフと表情を返す（今回を見ていれば undefined）。
 * 今のターンを記録から導き直さないのは、`request` の時点で「前のターンの最後の1件だけ残す」
 * 規則（docs/requirements.md 4.2）が `SessionState.speeches` 側にしか無いため。
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

export function CharacterView(): ReactElement {
  const { activeTurnId, newestTurnId } = useTurnSelection()
  const records = useSessionSelector((session) => session.state.records)
  const speeches = useSessionSelector((session) => session.state.speeches)
  const speechExpression = useSessionSelector((session) => session.state.speechExpression)
  const model = useSessionSelector((session) => session.state.model)
  const character = useSessionSelector((session) => session.state.character)
  const turnInProgress = useSessionSelector((session) => session.state.turnInProgress)
  const turnFinishedAt = useSessionSelector((session) => session.state.turnFinishedAt)
  const lastToolFailureAt = useSessionSelector((session) => session.state.lastToolFailureAt)
  const pastTurn = pastTurnSpeech(records, activeTurnId, newestTurnId)
  // 過去のターンでは、記録に残った表情（そのターンの最後のセリフのもの）をそのまま当てる。
  const expression =
    pastTurn === undefined
      ? speechExpression
      : (pastTurn.expression ?? DEFAULT_PAST_TURN_EXPRESSION)
  const outfit = resolveOutfit(model)
  const motion = usePortraitMotion({ turnInProgress, turnFinishedAt, lastToolFailureAt })

  const portraitUrl =
    character === undefined ? undefined : resolvePortraitUrl(character.portraits, expression)
  const accent =
    character === undefined ? undefined : resolveOutfitAccent(character.outfitAccents, outfit)
  // 表情のラベルはキャラクターパックの定義から来る（docs/design.md 7章）。定義が届く前・
  // ラベルが無い表情では、表情名そのものがラベルになる。
  const altText = `${character?.name ?? DEFAULT_CHARACTER_ALT_NAME}（${resolveExpressionLabel(
    character?.expressions ?? [],
    expression,
  )}）`

  return (
    <div className={styles["character-region"]}>
      <div className={styles["character-layout"]}>
        {portraitUrl !== undefined && (
          <Portrait
            url={portraitUrl}
            accent={accent}
            altText={altText}
            expression={expression}
            outfit={outfit}
            motion={motion}
            className={styles["portrait"]}
          />
        )}
        <BalloonTrack
          speeches={pastTurn === undefined ? speeches : pastTurn.speeches}
          emptyMessage={pastTurn === undefined ? undefined : PAST_TURN_EMPTY_MESSAGE}
        />
      </div>
    </div>
  )
}
