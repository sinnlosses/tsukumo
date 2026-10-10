// Claude 自身にセッションの見出しを付けさせるための判断。SDK を呼ばない純粋な部分だけをここに置く。
//
// 題の出どころは `report` ツールの任意の `title` 引数。
// `createSessionTitleIntake` が1ターンぶんの候補を覚え、ターンの終わりに1回だけ取り出す。
// 取り出した候補を実際に書くかどうかは `decideSessionTitle` が決める。
// 利用者が `/rename` などで書き換えた題は上書きしないため、SDK 側の現在値（`customTitle`）が「tsukumo が最後に自分で書いたもの」と一致するときだけ書く。

import { MAX_SESSION_HEADING_LENGTH } from "../../../shared/session/session-choice.ts"
import { clipText } from "../../../shared/utils/clip-text.ts"

/** 見出しを書くかどうかの判断に要る状態。tsukumo が最後に書いた題と、`/clear` の合図をまだ消費していないかを持ち回る。 */
export type SessionTitleState = {
  readonly lastWritten: string | undefined
  /**
   * `/clear` の合図を受けてから、まだ {@link decideSessionTitle} を呼んでいない。
   * 本体は `/clear` のたびに前のセッションの題を新しいセッションへ書き写すので、次の判断だけは現在値を tsukumo が最後に書いたものとみなす。
   */
  readonly adoptCurrentTitleNext: boolean
}

/** {@link SessionTitleState} の初期値（まだ一度も書いておらず、`/clear` の合図も無い）。 */
export const INITIAL_SESSION_TITLE_STATE: SessionTitleState = {
  lastWritten: undefined,
  adoptCurrentTitleNext: false,
}

/**
 * `/clear` の合図（`conversation-cleared`）を受けたことを状態へ持ち越す。
 * 合図を受けた時点では新しいセッションIDも書き写された題もまだ無いことがあるため、実際の判断は次に {@link decideSessionTitle} を呼ぶときまで遅らせる。
 */
export function noteConversationCleared(state: SessionTitleState): SessionTitleState {
  return { ...state, adoptCurrentTitleNext: true }
}

/** {@link decideSessionTitle} の判断。 */
export type SessionTitleAction =
  | { readonly kind: "write"; readonly title: string }
  | { readonly kind: "skip" }

/**
 * 題を書くべきかを決める。3つに分かれる:
 *
 * - 切り詰めた候補が SDK 側の現在値と同じ → 書いても変わらないので `skip`
 * - 現在値が「無い」でも「tsukumo が最後に書いたもの」でも「`/clear` の合図のあと最初に
 *   見る値」でもない → 利用者が `/rename` などで書き換えたとみなし、上書きしない（`skip`）
 * - それ以外 → `write`（候補は {@link MAX_SESSION_HEADING_LENGTH} に切り詰め済み）
 */
export function decideSessionTitle(
  state: SessionTitleState,
  candidate: string,
  currentTitle: string | undefined,
): SessionTitleAction {
  const title = truncateTitle(candidate)
  if (title === currentTitle) {
    return { kind: "skip" }
  }
  const treatAsOwn = currentTitle === state.lastWritten || state.adoptCurrentTitleNext
  if (currentTitle !== undefined && !treatAsOwn) {
    return { kind: "skip" }
  }
  return { kind: "write", title }
}

/**
 * `report` の handler が受け取った題の候補を、ターンの終わりまで1件だけ覚えておく入れ物。
 * 空白だけの題は無いものとして扱う。
 * 同じターンで2回渡されたら後のほうで上書きする（最後に言ったことを題にする）。
 */
export type SessionTitleIntake = {
  /** `report` が受け取った題を1件覚える。差し戻された `report` からは呼ばないこと。 */
  readonly note: (title: string) => void
  /** 覚えている題を取り出し、入れ物を空に戻す。無ければ undefined。 */
  readonly take: () => string | undefined
}

/** {@link SessionTitleIntake} を1つ作る。セッション1つに1つ（状態はこの中に閉じ込める）。 */
export function createSessionTitleIntake(): SessionTitleIntake {
  let pending: string | undefined = undefined

  return {
    note: (title) => {
      const trimmed = title.trim()
      if (trimmed !== "") {
        pending = trimmed
      }
    },
    take: () => {
      const title = pending
      pending = undefined
      return title
    },
  }
}

function truncateTitle(text: string): string {
  return clipText(text, MAX_SESSION_HEADING_LENGTH).head
}
