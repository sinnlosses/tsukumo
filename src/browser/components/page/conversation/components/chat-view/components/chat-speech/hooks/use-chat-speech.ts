// キャラクターのセリフ1件（`components/chat-speech.tsx`）の押し方の読み替え。**押すとその時の
// 表情へ立ち絵が遡る**（docs/screen-design.md 13.7「会話を遡る」）。
//
// **セリフをドラッグで選んでコピーできる**ので、押したのか文字を選び終えて手を離したのかを
// 見分ける必要がある——それがこのフックの役目。

import { useRef, type KeyboardEvent, type MouseEvent } from "react"

/**
 * 「押した」ではなく「ドラッグで文字を選んだ」とみなす、押し始めからの距離（px）。文字を1つ
 * 選ぶだけでも1文字ぶん（本文の大きさなら十数px）は動くので、手のぶれ（数px）と混ざらない。
 */
const DRAG_THRESHOLD_PX = 4

/** 押し始めた場所（ドラッグと押すの見分けに使う。{@link isSelectionDrag}）。 */
type PressOrigin = {
  readonly x: number
  readonly y: number
}

/** 見分けに使うマウスの値（押し始めと手を離したとき）。 */
type PointerAt = Pick<MouseEvent, "clientX" | "clientY" | "detail">

export type ChatSpeechView = {
  readonly onMouseDown: (event: PointerAt) => void
  readonly onClick: (event: PointerAt) => void
  readonly onKeyDown: (event: Pick<KeyboardEvent, "key" | "preventDefault">) => void
}

export function useChatSpeech(onToggle: () => void): ChatSpeechView {
  // 押し始めた場所。**セリフの行は文字をドラッグで選べる**ので、選び終えて手を離したときの
  // click と、押した click を、動いた距離で見分ける（{@link isSelectionDrag}）。
  const pressOriginRef = useRef<PressOrigin | undefined>(undefined)

  return {
    onMouseDown: (event) => {
      pressOriginRef.current = { x: event.clientX, y: event.clientY }
    },
    onClick: (event) => {
      const origin = pressOriginRef.current
      pressOriginRef.current = undefined
      // **文字を選んだだけのときは遡らない**（選び終えて手を離すと click も飛ぶ）。
      if (isSelectionDrag(origin, event)) {
        return
      }
      onToggle()
    },
    onKeyDown: (event) => {
      if (!isActivationKey(event.key)) {
        return
      }
      // Space はログを1画面送る既定の動作を持つので、押したことにする側で止める。
      event.preventDefault()
      onToggle()
    },
  }
}

/**
 * その click が「押した」ではなく「文字をドラッグで選び終えた」ものか。**選び終えて手を離した
 * 瞬間にも click は飛ぶ**ので、見分けないとコピーしようとするたびに立ち絵が遡ってしまう。
 *
 * 見るのは**押し始めてから動いた距離**だけ（{@link DRAG_THRESHOLD_PX}）。
 * **いま選ばれている文字（`window.getSelection()`）は見ない** — 選んだ直後にその行を押すと、
 * 選択が消えるのは手を離したあと（ブラウザが「選択を掴んで運ぶ」動きを待つため）なので、
 * その回の click が丸ごと落ちて押せなくなる（実機の Chrome で確認）。
 *
 * `detail === 0` はマウスから来ていない click（支援技術が送るもの）で、押し始めの場所を
 * 持たないので、押したものとして扱う。
 */
function isSelectionDrag(origin: PressOrigin | undefined, event: PointerAt): boolean {
  if (origin === undefined || event.detail === 0) {
    return false
  }
  return Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > DRAG_THRESHOLD_PX
}

/**
 * 押したことにするキー（WAI-ARIA の button パターンと同じ Enter と Space）。
 * **`<button>` と違って `role="button"` の要素にはブラウザが click を送らない**ので、
 * キーボードで遡る道はここで自分で開ける。
 */
function isActivationKey(key: string): boolean {
  return key === "Enter" || key === " "
}
