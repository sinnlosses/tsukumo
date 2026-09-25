// 起き上がっている駆動に1件頼むところ（`docs/design.md` 5章）。**受け付けられたかどうかだけを
// 返し、結果はイベントで戻ってくる**（ブラウザはローカルで echo しない。3章「依頼」）。
//
// **どのコマンドをここへ流すかを決めるのは `session-command.ts` の表**（起こし直し・見た目の
// 編集・覚えるだけの操作はほかの行で捌かれ、ここには来ない）。ここが持つのは「渡し方」と
// 「駆動が投げたときの畳み方」だけ。
//
// 依頼の文面が引数として通るが、**ログにもファイルにも書かない**
// （`docs/coding-standards.md`「会話内容の扱い」）。

import { type DriverCommand } from "../../../shared/command.ts"
import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import { CHAT_NUDGE_PROMPT } from "../../chat/core/chat-nudge.ts"
import { type PromptImageShelf } from "../../session-driver/core/prompt-image-shelf.ts"
import { type SessionDriver } from "../../session-driver/core/session-driver.ts"
import { type DispatchResult } from "./command-dispatch.ts"

/** 受け付けなかったことを、定型文の理由だけで返す（駆動には触らない）。 */
export function declined(reason: string): Promise<DispatchResult> {
  return Promise.resolve({ ok: false, reason })
}

/**
 * コマンド1件を駆動へ渡す。
 *
 * 駆動が例外を投げても常駐プロセスは落とさず、定型文の理由を返す
 * （docs/coding-standards.md「エラーハンドリング」）。
 */
export async function dispatchToDriver(
  driver: Promise<SessionDriver>,
  command: DriverCommand,
  promptImageShelf: PromptImageShelf,
): Promise<DispatchResult> {
  try {
    const started = await driver
    switch (command.type) {
      case "prompt":
        // 原寸は**駆動へ渡す前に棚へ置く**（id は `request` のイベントに載って記録へ入る）。
        // 駆動が投げて `request` が流れなかったときの原寸は記録に載らないまま残るが、
        // 棚の枚数の上限で古いほうから押し出される。
        started.prompt(command.text, promptImageShelf.shelve(command.images))
        return { ok: true }
      case "interrupt":
        await started.interrupt()
        return { ok: true }
      case "answer":
        return started.answer(command.id, command.answer)
          ? { ok: true }
          : { ok: false, reason: FRAME_ERROR_REASON.unresolvedAnswer }
      case "set-model":
        await started.setModel(command.model)
        return { ok: true }
      case "set-effort":
        await started.setEffort(command.effort)
        return { ok: true }
      case "set-permission-mode":
        await started.setPermissionMode(command.mode)
        return { ok: true }
    }
  } catch {
    return { ok: false, reason: FRAME_ERROR_REASON.driverFailed }
  }
}

/**
 * キャラクターから話しかけてもらう（`docs/screen-design.md` 13.7）。**文面は core が持ち**
 * （{@link CHAT_NUDGE_PROMPT}）、**記録に残さない口**（`promptWithoutRecord`）で渡すので、
 * 利用者が打っていない一言はログにも記録にも雑談の会話のアーカイブにも並ばない。
 *
 * 駆動が例外を投げても常駐プロセスは落とさず、定型文の理由を返す（{@link dispatchToDriver} と同じ）。
 */
export async function nudge(driver: Promise<SessionDriver>): Promise<DispatchResult> {
  try {
    const started = await driver
    started.promptWithoutRecord(CHAT_NUDGE_PROMPT)
    return { ok: true }
  } catch {
    return { ok: false, reason: FRAME_ERROR_REASON.driverFailed }
  }
}
