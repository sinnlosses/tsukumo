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

import { useEffect, useState, type ReactElement } from "react"

import { resolveOutfitAccent, resolvePortraitUrl } from "../../protocol/character.ts"
import {
  expressionLabel,
  nextWorkingTransitionDelayMs,
  resolveOutfit,
} from "../../protocol/expression.ts"
import { currentExpression, type ToolActivity } from "../../protocol/session-state.ts"
import { useSession } from "../app.tsx"
import { BalloonTrack } from "./balloon-track.tsx"
import { Portrait } from "./portrait.tsx"

/** character.json に `name` が無い・定義自体が無いときの、立ち絵 alt テキストの既定名。 */
const DEFAULT_CHARACTER_ALT_NAME = "キャラクター"

/**
 * 表情の「作業中」への遅延切り替えを、部品側のタイマーで再計算する。ツールの開始・終了だけでは
 * 遅延が経過した「その瞬間」に何のイベントも来ないので、実行中のツールがあってまだ「作業中」に
 * なっていないときだけ、遅延の残り時間ぶん先に1回だけ再描画するタイマーを立てる
 * （`nextWorkingTransitionDelayMs`。移行前は `usecase/event-sink.ts` がサーバ側で同じことをしていた）。
 */
function useNowForExpression(runningTools: readonly ToolActivity[]): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const delay = nextWorkingTransitionDelayMs(runningTools, Date.now())
    if (delay === undefined) {
      return undefined
    }
    const timer = setTimeout(() => setNow(Date.now()), delay)
    return () => clearTimeout(timer)
  }, [runningTools])

  return now
}

export function CharacterView(): ReactElement {
  const { state } = useSession()
  const now = useNowForExpression(state.runningTools)
  const expression = currentExpression(state, now)
  const outfit = resolveOutfit(state.model)
  const character = state.character

  const portraitUrl =
    character === undefined ? undefined : resolvePortraitUrl(character.portraits, expression)
  const accent =
    character === undefined ? undefined : resolveOutfitAccent(character.outfitAccents, outfit)
  const altText = `${character?.name ?? DEFAULT_CHARACTER_ALT_NAME}（${expressionLabel(expression)}）`

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
          />
        )}
        <BalloonTrack speeches={state.speeches} />
      </div>
    </div>
  )
}
