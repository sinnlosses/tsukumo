// レポートの畳み（`ReportFold`。中身は Collapsible）の見出しと開く側を、role と開閉の参照でたどる道具。

/** 最初の畳みの見出し（開閉のボタン）と、それが開く中身。無ければどちらも `undefined`。 */
export function firstFold(container: ParentNode): {
  readonly trigger?: Element
  readonly content?: Element
} {
  const trigger = container.querySelector("button[aria-expanded][aria-controls]") ?? undefined
  const id = trigger?.getAttribute("aria-controls") ?? undefined
  const content =
    id === undefined ? undefined : (container.querySelector(`[id="${id}"]`) ?? undefined)
  return { trigger, content }
}
