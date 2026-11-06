// port の関数が投げた失敗を、呼ぶ最も外側（配線）の1か所で「失敗のときの値」に畳み、足跡を残す口。
// 手続きは畳まず、畳み済みの値の `kind` だけを見る。

import type { SwallowedFailurePlace } from "../shared/diagnostic/swallowed-failure.ts"

/**
 * `read` を包み、投げたら足跡（場所・`error.name`・`code` だけ。`message` は載せない）を1件残して `failed` を返す。
 * 投げなければ値をそのまま返し、足跡は残さない。
 */
export function foldPortFailure<Args extends readonly unknown[], Result>(
  reportFailure: (place: SwallowedFailurePlace, error: unknown) => void,
  place: SwallowedFailurePlace,
  failed: Result,
  read: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return async (...args) => {
    try {
      return await read(...args)
    } catch (error) {
      reportFailure(place, error)
      return failed
    }
  }
}
