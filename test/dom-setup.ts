// `dom` の project の `setupFiles`。happy-dom の環境は vitest の設定が作る。

import type { Window } from "happy-dom"

// React の act() まわりの警告（テスト環境だと自動検出できない）を止める公式の合図。
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)

// happy-dom の `fetch` は実際に接続しにいくので、差し替えていないテストでは通信させず失敗させる。
Reflect.set(globalThis, "fetch", () => Promise.reject(new TypeError("fetch failed")))

// happy-dom の `Animation.cancel()` は `finished` を誰も待っていなくても reject し、未処理の拒否になる。
// Astryx の動きが部品の取り外しで cancel するので、reject を受け止めておく。
const animationPrototype: unknown = Reflect.get(globalThis, "Animation")?.prototype
if (typeof animationPrototype === "object" && animationPrototype !== null) {
  const originalCancel: unknown = Reflect.get(animationPrototype, "cancel")
  if (typeof originalCancel === "function") {
    Reflect.set(
      animationPrototype,
      "cancel",
      function cancel(this: { finished: Promise<unknown> }) {
        this.finished.catch(() => undefined)
        return Reflect.apply(originalCancel, this, [])
      },
    )
  }
}

/** テストの中でページの URL を差し替える（ポートを見る部品のため）。 */
export function setPageUrl(url: string): void {
  const happyDOM: Window["happyDOM"] = Reflect.get(window, "happyDOM")
  happyDOM.setURL(url)
}
