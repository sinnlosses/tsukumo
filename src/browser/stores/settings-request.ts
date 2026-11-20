// 設定のモーダルを開いているか、最後に見たページ、開いたときに送る行。開閉はここに1つだけ持つ。
// 最後に見たページは保存しない。タブを開き直すと先頭のページへ戻る（`faceKey` が `undefined` の間は先頭）。

import { create } from "zustand"

/** 開く先。ページの key と、そのページの中で送る行の key（行は省ける）。 */
export type SettingsTarget = {
  readonly faceKey: string
  readonly itemKey?: string
}

type SettingsRequestState = {
  readonly open: boolean
  /** 最後に見たページの key。まだ選んでいないときは `undefined`（先頭のページ）。 */
  readonly faceKey?: string
  /** 開いたときに送る行の key。送り終えたら無しに戻す。 */
  readonly itemKey?: string
  /** ページと行を指定しないと、最後に見たページで開く。 */
  readonly openSettings: (target?: SettingsTarget) => void
  readonly closeSettings: () => void
  readonly selectFace: (faceKey: string) => void
  readonly clearItem: () => void
}

export const useSettingsRequest = create<SettingsRequestState>()((set) => ({
  open: false,
  openSettings: (target) => {
    set((state) => ({
      open: true,
      faceKey: target?.faceKey ?? state.faceKey,
      itemKey: target?.itemKey,
    }))
  },
  closeSettings: () => {
    set({ open: false, itemKey: undefined })
  },
  selectFace: (faceKey) => {
    set({ faceKey, itemKey: undefined })
  },
  clearItem: () => {
    set({ itemKey: undefined })
  },
}))
