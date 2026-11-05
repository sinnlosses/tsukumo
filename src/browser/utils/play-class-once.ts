// CSS の animation を持つ class を要素に付けて1回だけ流し、その要素自身の animation が終わったら外す。

export function playClassOnce(element: Element, className: string): void {
  // 付いたままだと付け直しても animation が始まらないので、外して描き直させてから付ける。
  if (element.classList.contains(className)) {
    element.classList.remove(className)
    void element.getBoundingClientRect()
  }
  element.classList.add(className)
  // 中の要素の animationend も泡で上がってくるので、その要素自身の終わりだけで外す。
  const finish = (event: Event): void => {
    if (event.target !== element) {
      return
    }
    element.classList.remove(className)
    element.removeEventListener("animationend", finish)
  }
  element.addEventListener("animationend", finish)
}
