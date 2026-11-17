// 要素から外へ辿って、縦に転がる祖先を探す。
// 転がる祖先は画面の幅で入れ替わるので、呼ぶ側は決め打ちにせずここで探す。

/** 最初に縦に転がる祖先。無ければ文書の転がり。 */
export function scrollerOf(element: Element): Element {
  for (let ancestor = element.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
    const overflowY = getComputedStyle(ancestor).overflowY
    if (overflowY === "auto" || overflowY === "scroll") {
      return ancestor
    }
  }
  return document.scrollingElement ?? document.documentElement
}
