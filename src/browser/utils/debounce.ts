// 値の変化のたびに起きる副作用（送信・書き込み）を、鍵ごとにためて最後の1回だけにする。
// 見た目の即時反映（state 更新・DOM への直接反映）はここを通さず呼び出し側がそのまま行い、
// 重い副作用だけをここに渡す（`docs/coding-standards.md`「useEffect は4類型だけ」の
// タイマー）。同じ鍵の呼び出しが連続するとタイマーを引き直し、`delayMs` 止まった1回だけが効く。
// 鍵が違えば互いのタイマーに干渉しない（複数の入力を続けて動かしても、それぞれの最後の値を
// 落とさない）。
//
// アンマウント時に待機中の鍵が残っていれば、待たずにそのまま実行する
// （引きずったまま画面を閉じても、まだ送っていない最後の値を失わない）。

import { useEffectEvent, useEffect, useRef } from "react"

export function useDebouncedCallback<Key, Value>(
  callback: (key: Key, value: Value) => void,
  delayMs: number,
): (key: Key, value: Value) => void {
  const run = useEffectEvent(callback)
  const timers = useRef(new Map<Key, ReturnType<typeof setTimeout>>())
  // 値そのものではなく `{ value }` で持つ。`Value` が `undefined` を取りうる型でも
  // 「ためた値が無い」と区別できる（`Map.get` の `undefined` が両方を指してしまうため）。
  const pending = useRef(new Map<Key, { readonly value: Value }>())

  useEffect(() => {
    const timersAtMount = timers.current
    const pendingAtMount = pending.current
    return () => {
      for (const [key, timer] of timersAtMount) {
        clearTimeout(timer)
        const held = pendingAtMount.get(key)
        if (held !== undefined) {
          run(key, held.value)
        }
      }
      timersAtMount.clear()
      pendingAtMount.clear()
    }
  }, [])

  return (key: Key, value: Value) => {
    pending.current.set(key, { value })
    const existing = timers.current.get(key)
    if (existing !== undefined) {
      clearTimeout(existing)
    }
    timers.current.set(
      key,
      setTimeout(() => {
        timers.current.delete(key)
        pending.current.delete(key)
        run(key, value)
      }, delayMs),
    )
  }
}
