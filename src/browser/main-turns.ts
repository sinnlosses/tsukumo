// メインビューのやり取りタブ。**本文は push のたびに丸ごと差し替わる**ので、選択は差し替え後に
// 付け直す（`MutationObserver` で差し替えを検知する。購読スクリプト側に手を入れずに済む）。
//
// - **選択はやり取りの通し番号（`data-turn-id`）で覚える。** 新しいやり取りが増えても
//   「1つ前」の指す中身がずれない。選んでいたやり取りが窓から外れたら今回に戻す
// - **新しいやり取りが始まったら先頭へ戻す**（今回の通し番号が変わったことで判定）。
//   利用者が過去のタブを見ている間は動かさない（ユーザーの決定 2026-09-10 の論点7）
// - スクロールする要素の決め方は `src/browser/region-subscription.ts` の `scrollerFor` と同じ

/** `document` から `.layout-main` を探して {@link bindMainTurns} を呼ぶ。見つからなければ何もしない。 */
export function wireMainTurns(): void {
  const element = document.querySelector(".layout-main")
  if (element === null) {
    return
  }
  bindMainTurns(element)
}

/**
 * やり取りタブの選択・スクロール制御を配線する。`element` はメインビューの領域そのもの
 * （`.layout-main`）で、タブ（`.turn-tab`）・パネル（`.turn-panel`）はこの中の子孫。
 */
export function bindMainTurns(element: Element): void {
  let selectedTurnId: string | undefined = undefined
  let lastNewestId: string | undefined = undefined

  function scroller(): Element {
    return element.scrollHeight > element.clientHeight
      ? element
      : (document.scrollingElement ?? document.documentElement)
  }

  function tabIds(): readonly (string | undefined)[] {
    return Array.from(element.querySelectorAll<HTMLElement>(".turn-tab")).map(
      (tab) => tab.dataset.turnId,
    )
  }

  function apply(): void {
    const ids = tabIds()
    const first = ids[0]
    if (first === undefined) {
      return
    }
    const active = ids.includes(selectedTurnId) ? selectedTurnId : first
    selectedTurnId = active
    for (const tab of element.querySelectorAll<HTMLElement>(".turn-tab")) {
      tab.classList.toggle("is-active", tab.dataset.turnId === active)
    }
    for (const panel of element.querySelectorAll<HTMLElement>(".turn-panel")) {
      panel.hidden = panel.dataset.turnId !== active
    }
  }

  element.addEventListener("click", (event) => {
    // click イベントの target は常に要素なので、Event の型がゆるく持つ EventTarget から
    // 絞り込むだけ（実行時のチェックは足さない。`docs/coding-standards.md`「エラー
    // ハンドリング」— 描画ループに try/catch を散らさないのと同じ考え方）。
    const target = event.target as Element | null
    if (target === null) {
      return
    }
    const tab = target.closest<HTMLElement>(".turn-tab")
    if (tab === null) {
      return
    }
    selectedTurnId = tab.dataset.turnId
    apply()
    scroller().scrollTop = 0
  })

  function onUpdated(): void {
    const ids = tabIds()
    const newest = ids[0]
    // 「今回」を見ていた人だけを新しいやり取りへ連れていく。**やり取りの数ではなく今回の
    // 通し番号で見る**（上限に達すると数は増えないまま中身だけが進むため）。
    const wasNewest = selectedTurnId === undefined || selectedTurnId === lastNewestId
    const started = lastNewestId !== undefined && newest !== lastNewestId
    apply()
    if (started && wasNewest) {
      selectedTurnId = newest
      apply()
      scroller().scrollTop = 0
    }
    lastNewestId = newest
  }

  new MutationObserver(onUpdated).observe(element, { childList: true })
  onUpdated()
}
