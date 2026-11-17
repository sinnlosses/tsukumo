// 本文の scroll を、1 フレームに 1 回だけ配る共有の購読。
// 転がる祖先は画面の幅で入れ替わるので、どれが転がっても拾えるよう `document` で capture して捕まえる。
// 購読者がいくつ増えても `document` に付くのは 1 つで、購読者が 0 になると外す。

const listeners = new Set<() => void>()
let frame: number | undefined = undefined

/** 次の描画の直前に 1 回だけ `listener` を呼ぶ scroll の購読。返す関数で外す。 */
export function subscribeScrollFrame(listener: () => void): () => void {
  if (listeners.size === 0) {
    document.addEventListener("scroll", onScroll, { capture: true, passive: true })
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) {
      return
    }
    document.removeEventListener("scroll", onScroll, { capture: true })
    if (frame !== undefined) {
      cancelAnimationFrame(frame)
      frame = undefined
    }
  }
}

function onScroll(): void {
  if (frame !== undefined) {
    return
  }
  frame = requestAnimationFrame(() => {
    frame = undefined
    for (const listener of listeners) {
      listener()
    }
  })
}
