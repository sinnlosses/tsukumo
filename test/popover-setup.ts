// `dom` の project の `setupFiles`。happy-dom に無い `showPopover`・`hidePopover`・`togglePopover` を、`:popover-open` を持たない最小の形で補う。
// 開いたかどうかは `data-popover-open` 属性に写す。フォーカスの戻りなどブラウザが持つ動きは補わない（E2E で見る）。

const POPOVER_OPEN = "data-popover-open"

function showPopover(this: HTMLElement): void {
  this.setAttribute(POPOVER_OPEN, "")
}

function hidePopover(this: HTMLElement): void {
  this.removeAttribute(POPOVER_OPEN)
}

function togglePopover(this: HTMLElement): boolean {
  if (this.hasAttribute(POPOVER_OPEN)) {
    hidePopover.call(this)
    return false
  }
  showPopover.call(this)
  return true
}

for (const [name, method] of [
  ["showPopover", showPopover],
  ["hidePopover", hidePopover],
  ["togglePopover", togglePopover],
] as const) {
  if (!(name in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, name, { value: method, configurable: true })
  }
}
