// キャラビュー本体（<CharacterView>。docs/design.md 6.1）。立ち絵（<Portrait>）と吹き出しの並び
// （<BalloonTrack>）を同じ領域に同居させる（`docs/glossary.md`「キャラビュー」）。
//
// 表情は `currentExpression(state, now)`（`protocol/session-state.ts`）、衣装は
// `resolveOutfit(state.model)` で決める。**「作業中」への遅延切り替えのタイマーは、移行前は
// サーバ（`usecase/event-sink.ts`）が持っていたが、段5でここの `useEffect` タイマーへ移した**
// （キャラビューが React の部品になったので、サーバが配り直す必要が無くなった。
// docs/design.md 4.1）。
//
// **立ち絵の素材（URL）が無いときは `<Portrait>` を出さず、吹き出しだけで成立させる**
// （docs/requirements.md 4.2「フォールバック」）。
//
// **過去のターンのタブを選んでいる間は、そのターンの吹き出しと表情に戻す**
// （`useTurnSelection`。ユーザーの指摘 2026-09-14「レポート同様にセリフも遡る」）。
// **立ち絵の「動き」は遡らない**（時間相対のアニメーションで、遡るには
// `docs/requirements.md` 4.3 の決定の見直しが要る。別タスク）。

import { useEffect, useState, type ReactElement } from "react"

import {
  resolveExpressionLabel,
  resolveOutfitAccent,
  resolvePortraitUrl,
} from "../../../protocol/character.ts"
import { nextWorkingTransitionDelayMs, resolveOutfit } from "../../../protocol/expression.ts"
import {
  nextPortraitMotionTransitionDelayMs,
  resolvePortraitMotion,
  type PortraitMotion,
  type PortraitMotionInput,
} from "../../../protocol/portrait-motion.ts"
import {
  currentExpression,
  type SessionRecord,
  type ToolActivity,
} from "../../../protocol/session-state.ts"
import { turnSpeeches, type TurnSpeech } from "../../../protocol/turn-speech.ts"
import { loadPortraitFixed } from "../../lib/portrait-fixed.ts"
import { useSession } from "../../stores/session.tsx"
import { useTurnSelection } from "../../stores/turn-selection.tsx"
import { BalloonTrack } from "./balloon-track.tsx"
import { Portrait } from "./portrait.tsx"

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
 * 表情の「作業中」への遅延切り替え・クールダウン明けを、部品側のタイマーで再計算する。
 * ツールの開始・終了だけでは遅延やクールダウンが経過した「その瞬間」に何のイベントも
 * 来ないので、`nextWorkingTransitionDelayMs` の戻り値ぶん先に再描画するタイマーを立てる。
 *
 * **発火するたびに次の遅延を計算し直して立て直す**（`useNowForPortraitMotion` と同じ形。
 * クールダウンが明める瞬間と、実行中のツールが遅延を超える瞬間の**両方が前後して控えている
 * ことがある**ため、1回きりのタイマーでは後ろの一方を取りこぼす。移行前は
 * `usecase/event-sink.ts` がサーバ側でこの再計算をしていた）。
 */
function useNowForExpression(
  runningTools: readonly ToolActivity[],
  lastToolFinishedAt: number | undefined,
): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const scheduleNext = (): void => {
      const delay = nextWorkingTransitionDelayMs(runningTools, lastToolFinishedAt, Date.now())
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
  }, [runningTools, lastToolFinishedAt])

  return now
}

/**
 * 立ち絵の動きの「完了の反応」「失敗でびくっ」を、時間の窓が過ぎた瞬間に読み直すための時計。
 *
 * `useNowForExpression`（表情の「作業中」への遅延切り替え）と違い、**この2つの窓は同時に
 * 効いていることがある**（ツールが失敗した直後にターンが終わる、など）。1回だけ先の
 * タイマーを立てる形だと、`nextPortraitMotionTransitionDelayMs` が返すのは
 * **いちばん早く終わる窓**だけなので、そのタイマーが1回発火して `now` を進めたあとに
 * **もう一方の窓がまだ残っていても、次のタイマーが立たないまま止まってしまう**
 * （`lastToolFailureAt` / `turnFinishedAt` 自体はその後変わらないので、依存配列だけを見ている
 * 素朴な1回きりのタイマーでは再計算のきっかけが無い）。そこで、**タイマーが発火するたびに
 * 自分で次の窓までの遅延を計算し直して、無くなるまで立て直す**。
 */
function useNowForPortraitMotion(input: PortraitMotionInput): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const scheduleNext = (): void => {
      const delay = nextPortraitMotionTransitionDelayMs(input, Date.now())
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
  }, [input.turnInProgress, input.turnFinishedAt, input.lastToolFailureAt])

  return now
}

/**
 * 立ち絵にいま当てる動き。「固定」（`loadPortraitFixed()`）を選んでいれば undefined
 * （`docs/requirements.md` 4.3「利用者は固定を選べる」）。
 */
function usePortraitMotion(input: PortraitMotionInput): PortraitMotion | undefined {
  const now = useNowForPortraitMotion(input)
  return loadPortraitFixed() ? undefined : resolvePortraitMotion(input, now)
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
  const { state } = useSession()
  const { activeTurnId, newestTurnId } = useTurnSelection()
  const now = useNowForExpression(state.runningTools, state.lastToolFinishedAt)
  const pastTurn = pastTurnSpeech(state.records, activeTurnId, newestTurnId)
  // 過去のターンでは、記録に残った表情（そのターンの最後のセリフのもの）をそのまま当てる。
  // **ツール実行中の「作業中」への上書きは今回を見ているときだけ**（決定 2026-09-14）。
  const expression =
    pastTurn === undefined
      ? currentExpression(state, now)
      : (pastTurn.expression ?? DEFAULT_PAST_TURN_EXPRESSION)
  const outfit = resolveOutfit(state.model)
  const character = state.character
  const motion = usePortraitMotion({
    turnInProgress: state.turnInProgress,
    turnFinishedAt: state.turnFinishedAt,
    lastToolFailureAt: state.lastToolFailureAt,
  })

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
    <div className="character-region">
      <div className="character-layout">
        {portraitUrl !== undefined && (
          <Portrait
            url={portraitUrl}
            accent={accent}
            altText={altText}
            expression={expression}
            outfit={outfit}
            motion={motion}
          />
        )}
        <BalloonTrack
          speeches={pastTurn === undefined ? state.speeches : pastTurn.speeches}
          emptyMessage={pastTurn === undefined ? undefined : PAST_TURN_EMPTY_MESSAGE}
        />
      </div>
    </div>
  )
}
