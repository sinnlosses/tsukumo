// 設定の「ワークフロー」の面にある未保存の下書き。
// 下書きは面（`useWorkflowSetting`）の状態で、ページを移る・ダイアログを閉じると面ごと消える。
// 消える前に確かめられるよう、面が件数と保存の口をここへ預け、ダイアログが読む。

import { create } from "zustand"

export type WorkflowDraftEntry = {
  /** 下書きのある欄の数。 */
  readonly count: number
  /** 偽のあいだ「保存して閉じる」は押せない（空のコマンドが下書きにある）。 */
  readonly canSave: boolean
  /** 書いて、書けたかを返す。書けなかったときは下書きが残る。 */
  readonly save: () => Promise<boolean>
}

type WorkflowDraftState = {
  readonly entry?: WorkflowDraftEntry
  readonly register: (entry: WorkflowDraftEntry) => void
  readonly clear: () => void
}

export const useWorkflowDraft = create<WorkflowDraftState>()((set, get) => ({
  register: (entry) => {
    set({ entry })
  },
  clear: () => {
    if (get().entry !== undefined) {
      set({ entry: undefined })
    }
  },
}))
