// 起き上がっている駆動に1件頼むところ（`docs/design.md` 5章）。受け付けられたかどうかだけを
// 返し、結果はイベントで戻ってくる（ブラウザはローカルで echo しない。3章「依頼」）。
//
// どのコマンドをどう頼むかを決めるのは `session-command.ts` の表の行（起こし直し・見た目の
// 編集・覚えるだけの操作はほかの行で捌かれ、ここには来ない）。ここが持つのは「駆動が起き上がるのを
// 待つこと」と「駆動が投げたときの畳み方」だけ。
//
// 依頼の文面が引数として通るが、ログにもファイルにも書かない
// （`docs/coding-standards.md`「会話内容の扱い」）。

import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import { CHAT_NUDGE_PROMPT } from "../../chat/core/chat-nudge.ts"
import { type DispatchResult } from "../../core/command-receiver.ts"
import { type SessionDriver } from "../../session-driver/core/session-driver.ts"

/** 受け付けなかったことを、定型文の理由だけで返す（駆動には触らない）。 */
export function declined(reason: string): Promise<DispatchResult> {
  return Promise.resolve({ ok: false, reason })
}

/**
 * 起き上がった駆動に1件頼む（`ask` が頼み方を持つ。表の行ごとに1つ）。
 *
 * 駆動が例外を投げても常駐プロセスは落とさず、定型文の理由を返す
 * （docs/coding-standards.md「エラーハンドリング」）。
 */
export async function askDriver(
  driver: Promise<SessionDriver>,
  ask: (started: SessionDriver) => DispatchResult | Promise<DispatchResult>,
): Promise<DispatchResult> {
  try {
    return await ask(await driver)
  } catch {
    return { ok: false, reason: FRAME_ERROR_REASON.driverFailed }
  }
}

/** 頼めた（結果はイベントで戻ってくる）。 */
export const ACCEPTED = { ok: true } satisfies DispatchResult

/**
 * キャラクターから話しかけてもらう（`docs/screen-design.md` 13.7）。文面は core が持ち
 * （{@link CHAT_NUDGE_PROMPT}）、記録に残さない口（`promptWithoutRecord`）で渡すので、
 * 利用者が打っていない一言はログにも記録にも雑談の会話のアーカイブにも並ばない。
 *
 * 駆動が例外を投げても常駐プロセスは落とさず、定型文の理由を返す（{@link askDriver}）。
 */
export function nudge(driver: Promise<SessionDriver>): Promise<DispatchResult> {
  return askDriver(driver, (started) => {
    started.promptWithoutRecord(CHAT_NUDGE_PROMPT)
    return ACCEPTED
  })
}
