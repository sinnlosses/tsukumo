// 重なる面（モーダル・ポップオーバー・メニュー）がいま開いているか。
// 開く面は開いているあいだだけ `acquireOverlay` で登録し、返された関数で解く。

import { create } from "zustand"

type OpenOverlayState = {
  readonly count: number
}

const useOpenOverlay = create<OpenOverlayState>()(() => ({ count: 0 }))

/** 開いたときに呼ぶ。返した関数を閉じたときに呼ぶ。 */
export function acquireOverlay(): () => void {
  useOpenOverlay.setState((state) => ({ count: state.count + 1 }))
  return () => {
    useOpenOverlay.setState((state) => ({ count: state.count - 1 }))
  }
}

export function isOverlayOpen(): boolean {
  return useOpenOverlay.getState().count > 0
}
