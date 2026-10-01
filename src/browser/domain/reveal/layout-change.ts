// レポートを「書き上げていくように見せる」演出で、測った box が古くなる出来事を知らせる。
//
// 拾うのは要素の寸法の変化（画像や図の読み込み・窓や領域の幅・要素が外されて寸法が 0 になる）と、窓の大きさの変化。
// 窓の高さだけが変わったとき、ページ自身が器だと見える高さはどの要素の寸法にも出ないので、`resize` を別に聞く。
//
// 位置だけがずれて寸法の変わらない要素は拾えない。
// 拾いたい位置のずれは、見張る側が「ずれの原因になる要素の寸法」を対象に含めて拾う。

/** 見張り。あとから現れた要素（遅れて描かれた図）を足せる。 */
export type LayoutWatch = {
  /** 見張る要素を足す。もう見ている要素を渡しても、寸法が変わっていなければ知らせない。 */
  readonly watch: (targets: readonly Element[]) => void
  /** 見張りを外す。 */
  readonly stop: () => void
}

/**
 * `targets` の寸法か窓の大きさが変わったら `onChange` を呼ぶ。
 *
 * `ResizeObserver` は観測を始めた直後に今の寸法を1回知らせてくる（寸法が 0 の要素でも）ので、要素ごとの1回目は寸法を覚えるだけにする（変わっていないのに知らせない）。
 */
export function watchLayoutChange(targets: readonly Element[], onChange: () => void): LayoutWatch {
  const known = new Map<Element, string>()
  const observer = new ResizeObserver((entries) => {
    const changed = entries.filter((entry) => {
      const size = sizeKeyOf(entry)
      const before = known.get(entry.target)
      known.set(entry.target, size)
      return before !== undefined && before !== size
    })
    if (changed.length > 0) {
      onChange()
    }
  })
  const watch = (more: readonly Element[]): void => {
    for (const target of more) {
      observer.observe(target)
    }
  }
  watch(targets)
  window.addEventListener("resize", onChange)

  return {
    watch,
    stop: () => {
      observer.disconnect()
      window.removeEventListener("resize", onChange)
    },
  }
}

function sizeKeyOf(entry: ResizeObserverEntry): string {
  const box = entry.borderBoxSize.at(0)
  return box === undefined
    ? `${String(entry.contentRect.width)}x${String(entry.contentRect.height)}`
    : `${String(box.inlineSize)}x${String(box.blockSize)}`
}
