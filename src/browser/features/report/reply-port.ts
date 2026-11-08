// レポートから入力欄へ返す口。レポートは入力欄の実装を知らず、会話ページが実装を渡す。

import { createContext } from "react"

export type ReplyPort = {
  /** 入力欄の後ろへ空行を挟んで下書きを足し、入力欄へフォーカスを送る。送りはしない。 */
  readonly appendDraft: (text: string) => void
}

/** 口が渡されていない描画は `none`。次の一手の行は出さない。 */
export type ReplyPortSlot =
  | { readonly kind: "none" }
  | { readonly kind: "open"; readonly port: ReplyPort }

export const ReplyPortContext = createContext<ReplyPortSlot>({ kind: "none" })
