// tsukumo が雑談モードの記憶を畳むときに送る `/compact` の文面（`docs/requirements.md` 4.9
// 「記憶の圧縮と忘却」）。`chat-manner.ts` の隣に置く（モデルに見せる文面は core 側）。
//
// 閾値を超えたかどうかの判断と、実際に送る操作は `src/server/core/session-manager.ts` が持つ。
// ここは「決める」内容の文字列だけで、外の世界には触らない（原則2）。

/**
 * 要約の指示。引く線は「プロフィールの書き戻し」の3条件と同じ（`docs/requirements.md` 4.9）:
 * 自分の言葉で書き直す・発言を引用しない・利用者について知ったことは書かない。
 */
const CHAT_COMPACT_INSTRUCTION =
  "覚えておくことだけを短く、自分の言葉で書き直してください。発言をそのまま引用せず、" +
  "利用者について知ったことは書かないでください。"

/** `/compact` へそのまま渡す依頼の文面（`SessionDriver.prompt` の `text` にそのまま渡る）。 */
export const CHAT_COMPACT_COMMAND = `/compact ${CHAT_COMPACT_INSTRUCTION}`
