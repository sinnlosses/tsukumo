// `remember` / `forget` ツールがモデルへ返す固定文。
// 返す文は結果の種類だけで決まり、渡された行・覚えた行・画面の状態を埋めない。

import { MAX_REMEMBERED_LINE_LENGTH } from "../../../shared/chat/persona-memory.ts"
import type { PersonaForgetResult, PersonaRememberResult } from "./session-driver.ts"

/** ツールの応答の文と、エラーとして返すか。 */
export type PersonaMemoryReply = { readonly text: string; readonly isError: boolean }

/** `remember` を呼ばずに断った理由（外部由来の印が立っていた）。 */
export type PersonaRememberRefusal = "external-tool"

/** `remember` の応答。 */
export function rememberReply(
  result: PersonaRememberResult | PersonaRememberRefusal,
): PersonaMemoryReply {
  return result === "written"
    ? { text: "ok", isError: false }
    : { text: REMEMBER_REFUSAL_TEXT[result], isError: true }
}

/** `forget` の応答。 */
export function forgetReply(result: PersonaForgetResult): PersonaMemoryReply {
  return result === "erased"
    ? { text: "ok", isError: false }
    : { text: FORGET_REFUSAL_TEXT[result], isError: true }
}

const REMEMBER_REFUSAL_TEXT = {
  "external-tool":
    "書かなかった。この依頼のあいだに tsukumo の外のツールを使ったので、覚えることはできない。" +
    "まだ覚えるべきことなら、次の依頼でツールを使う前に呼び直す。",
  "turn-used": "書かなかった。1ターンに覚えられるのは1行だけ。次のターンで呼び直す。",
  "unwritable-line": `書かなかった。改行を含まない ${MAX_REMEMBERED_LINE_LENGTH} 文字までの1行にして呼び直す。`,
  duplicate: "書かなかった。同じ文面をもう覚えている。呼び直さない。",
  "not-editable": "書かなかった。このキャラクターの人格には書き足せない。呼び直さない。",
  failed: "書かなかった。ファイルに書けなかった。",
} as const satisfies Record<
  Exclude<PersonaRememberResult, "written"> | PersonaRememberRefusal,
  string
>

const FORGET_REFUSAL_TEXT = {
  "turn-used": "消さなかった。1ターンに忘れられるのは1行だけ。次のターンで呼び直す。",
  "no-match":
    "消さなかった。「覚えたこと」に同じ文面の行が無い。" +
    "言い換えず、並んでいる1行の文面をそのまま写して呼び直す。写しても無ければ、もう消えている。",
  "not-editable": "消さなかった。このキャラクターの人格からは消せない。呼び直さない。",
  failed: "消さなかった。ファイルに書けなかった。",
} as const satisfies Record<Exclude<PersonaForgetResult, "erased">, string>
