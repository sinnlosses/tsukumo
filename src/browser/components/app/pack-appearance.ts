// パックが差す見た目（`accent`・背景・日記の書体）を `document.documentElement` の CSS 変数へ流す。
// 帯と画面の外まで届かせる値なので、部品の class ではなく `:root` の既定値の上から差し替える。
// 届いていない・パックが持たないときは変数ごと外し、`theme.css` の既定値に戻す。

import { useEffect } from "react"

import { effectiveAccent } from "../../../shared/character-pack/character.ts"
import { useSession } from "../../stores/session.ts"

/** 画面の根で1回だけ呼ぶ。 */
export function usePackAppearance(): void {
  useAccent()
  useCharacterBackground()
  useDiaryFont()
}

/**
 * FontFace API に登録する名前。
 * 常に「いまのパック」の1件しか登録しない（切り替えたときは古い方を `document.fonts.delete` する）ので、固定の1つでよい。
 */
const DIARY_FONT_FAMILY_NAME = "tsukumo-diary"

function useAccent(): void {
  const accent = useSession((session) =>
    effectiveAccent(session.state.character, session.state.chatMode),
  )
  useEffect(() => {
    if (accent === undefined) {
      document.documentElement.style.removeProperty("--accent")
    } else {
      document.documentElement.style.setProperty("--accent", accent)
    }
  }, [accent])
}

/**
 * どこにどう敷くかは CSS の `.layout-ground` が持ち、ここは素材の URL と覆いの濃さを渡すだけ。
 * 素材の名前は `character.json` 由来の外部の値だが、`url()` を抜け出せない形であることは境界の `isBackgroundFileName` で見てある。
 */
function useCharacterBackground(): void {
  const backgroundImage = useSession((session) => session.state.character?.background?.image)
  const backgroundVeil = useSession((session) => session.state.character?.background?.veil)
  useEffect(() => {
    const style = document.documentElement.style
    if (backgroundImage === undefined || backgroundVeil === undefined) {
      style.removeProperty("--character-background-image")
      style.removeProperty("--character-background-veil")
      return
    }
    style.setProperty("--character-background-image", `url("${backgroundImage}")`)
    style.setProperty("--character-background-veil", String(backgroundVeil))
  }, [backgroundImage, backgroundVeil])
}

/**
 * `font-family` は `url()` を直接差せないので、FontFace API でブラウザに書体として登録してから、
 * 登録した名前を `--font-diary` に流す。読み込めないときは `--font-serif`（端末の明朝体）のまま。
 */
function useDiaryFont(): void {
  const diaryFont = useSession((session) => session.state.character?.diaryFont)
  useEffect(() => {
    const style = document.documentElement.style
    if (diaryFont === undefined) {
      style.removeProperty("--font-diary")
      return
    }

    const face = new FontFace(DIARY_FONT_FAMILY_NAME, `url("${diaryFont}")`)
    let cancelled = false
    document.fonts.add(face)
    face
      .load()
      .then(() => {
        if (!cancelled) {
          style.setProperty("--font-diary", `"${DIARY_FONT_FAMILY_NAME}", var(--font-serif)`)
        }
      })
      .catch(() => {
        // 壊れている・見つからない書体ファイルは既定の明朝体のまま。
      })
    return () => {
      cancelled = true
      document.fonts.delete(face)
      style.removeProperty("--font-diary")
    }
  }, [diaryFont])
}
