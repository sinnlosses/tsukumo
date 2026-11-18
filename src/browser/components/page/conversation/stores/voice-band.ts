// 入力欄のすぐ上に高さを取った声の帯の要素。
// 帯はレイアウトの差し込み口に置かれ、メインビューが直近のセリフ1件をその中へ描く（置き場が離れているので store を挟む）。

import { create } from "zustand"

type VoiceBandElement =
  | { readonly kind: "none" }
  | { readonly kind: "open"; readonly element: HTMLElement }

type VoiceBandState = {
  readonly band: VoiceBandElement
  readonly open: (element: HTMLElement) => void
  readonly close: () => void
}

export const useVoiceBand = create<VoiceBandState>()((set) => ({
  band: { kind: "none" },
  open: (element) => {
    set({ band: { kind: "open", element } })
  },
  close: () => {
    set({ band: { kind: "none" } })
  },
}))
