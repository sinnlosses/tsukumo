// 差し色1系統（衣装ごと・画面の仕事 / 雑談のどちらか）の「引きずっている間は見た目だけ先に進め、送信は止めてから1回にまとめる」。
//
// 見た目（立ち絵の `accent` と `<input>` の表示）はその場で更新し、送信は `useDebouncedCallback` で `ACCENT_DEBOUNCE_MS` まとめる。
// サーバが送信のたびに `character.json` を書き直すため。

import { useState } from "react"
import { omitBy } from "remeda"

import { useDebouncedCallback } from "../../../../../utils/debounce.ts"

/** 差し色の送信をまとめる間隔。ドラッグ中の1回1回を送らず、離れてから1回にする。 */
const ACCENT_DEBOUNCE_MS = 200

/**
 * まとめて送る差し色1つ。
 * 書き込む先のパックは引きずった時点のものを値と一緒に持つ（まとめている間に一覧で別のパックを選んでも、別のパックへ書かない）。
 */
type PendingAccent<Target> = {
  readonly pack: string
  readonly target: Target
  readonly color: string
}

/**
 * 引きずっている間だけ見た目を先に進める上書き。
 * パックごとに分けて持つ（一覧で別のパックへ移ったとき、前のパックで引きずった色を持ち込まない）。
 */
type HeldColors<Target extends string> = Readonly<Record<string, Partial<Record<Target, string>>>>

/** `set` は色を動かして送る。`reset` は上書きを外すだけで送らない（送り先の側で戻す）。 */
export type HeldAccentChange =
  | { readonly kind: "set"; readonly color: string }
  | { readonly kind: "reset" }

export type HeldAccent<Target extends string> = {
  /** パックの上書き（引きずっていない欄は入っていない）。 */
  readonly heldOf: (pack: string) => Partial<Record<Target, string>>
  readonly hold: (pack: string, target: Target, change: HeldAccentChange) => void
}

export function useHeldAccent<Target extends string>(
  send: (accent: PendingAccent<Target>) => void,
): HeldAccent<Target> {
  const [held, setHeld] = useState<HeldColors<Target>>({})
  // 鍵は「パックと欄」の組（別のパックの同じ欄を続けて動かしても、前の値を落とさない）。
  const sendDebounced = useDebouncedCallback<string, PendingAccent<Target>>((_key, accent) => {
    send(accent)
  }, ACCENT_DEBOUNCE_MS)

  return {
    heldOf: (pack) => held[pack] ?? {},
    hold: (pack, target, change) => {
      setHeld((current) => ({
        ...current,
        [pack]:
          change.kind === "set"
            ? { ...current[pack], [target]: change.color }
            : omitBy(current[pack] ?? {}, (_color, key) => key === target),
      }))
      if (change.kind === "set") {
        sendDebounced(`${pack}/${target}`, { pack, target, color: change.color })
      }
    },
  }
}
