// 自動判定の拒否と、一度だけの許可の印。セッション1つに1つ。
// 拒否を画面へ知らせ、利用者が許可したら、同じツール・同じ入力の次の1回だけを `canUseTool` で通す印を持つ。
//
// 拒否された呼び出しの入力は照合の鍵にだけ使い、イベント・ログ・ファイルへ写さない。

import { isPlainObject } from "remeda"

import type { Answer } from "../../../shared/session-driver/pending-ask.ts"
import {
  MAX_DENIAL_REASON_LENGTH,
  type PermissionDenial,
} from "../../../shared/session-driver/permission-denial.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { clipWithEllipsis } from "../../../shared/utils/clip-text.ts"

/** 拒否された呼び出し1件（SDK の `PermissionDenied` フックの入力から取ったもの）。 */
export type DeniedCall = {
  readonly toolUseId: string
  readonly toolName: string
  readonly input: unknown
  readonly reason: string
  /** サブエージェントの中の呼び出しのときだけ、そのサブエージェントの id。 */
  readonly agentId?: string
}

/** PreToolUse で呼び出しを見た結果。`ask` は印と一致したので `canUseTool` へ回す。 */
export type CallReviewByGrant = "ask" | "pass"

export type DenialGrantHandlers = {
  readonly onEvent: (event: SessionEvent) => void
  /** モデルへ差し込みの発言を送り、送った発言の uuid を返す。 */
  readonly sendNotice: (text: string) => string
  /** `delayMs` 後に `run` を1回呼ぶ予約をし、取り消す関数を返す。 */
  readonly schedule: (run: () => void, delayMs: number) => () => void
}

export type DenialGrants = {
  /**
   * 拒否を積み、{@link DENIAL_SHOW_DELAY_MS} 待ってから画面へ知らせる。待つあいだに同じ鍵の打ち直しが来たら、知らせずに捨てる。
   * 同じ鍵の答えていない拒否は下げる。サブエージェントの中の拒否は積まない。
   */
  readonly deny: (call: DeniedCall) => void
  /**
   * 拒否に答える。`allow` は印を立てて許可を、`deny` は断ったことをモデルへ知らせる。
   * 知らない id・答えの種類が合わないときは何もせず `false`。
   */
  readonly answer: (id: string, answer: Answer) => boolean
  /**
   * PreToolUse に来た呼び出しを印と照らす。`inputs` は同じ呼び出しの入力の候補（Bash は書き換えの前と後）で、どれかが印と一致すれば当たり。
   * 当たったら印を消して `toolUseId` に通す控えを付け、`ask` を返す。
   * 外れても同じ鍵の答えていない拒否があれば下げる（打ち直しが分類器に回るので、結果は新しい拒否か実行になる）。
   */
  readonly review: (
    toolName: string,
    inputs: readonly unknown[],
    toolUseId: string,
  ) => CallReviewByGrant
  /** `canUseTool` に来た呼び出しに通す控えがあれば消して `true`。 */
  readonly takeArmed: (toolUseId: string) => boolean
  /**
   * ターンが終わった。待っている拒否はすぐ画面へ知らせる。
   * そのターンが受け取った入力に許可の知らせがあれば、まだ使われていない印を捨てる。
   */
  readonly finishTurn: (consumedInputUuids: readonly string[]) => void
  /** 拒否・印・控えを全て捨て、待っている知らせを取り消す（セッションを閉じたとき）。 */
  readonly clear: () => void
}

/** 拒否を画面へ知らせるまで待つ時間。同じ入力の打ち直しは、ふつうこの間に来る。 */
const DENIAL_SHOW_DELAY_MS = 15_000

/** 拒否1件と印の照合に使う鍵。 */
type CallKey = string

/** 積んだ拒否1件。`cancelShow` があるあいだは、まだ画面へ知らせていない。 */
type HeldDenial = {
  readonly key: CallKey
  readonly call: DeniedCall
  readonly cancelShow?: () => void
}

type Grant = { readonly noticeUuid: string }

/** {@link DenialGrants} を1つ作る。状態（答えていない拒否・印・通す控え）を持つのはここだけ。 */
export function createDenialGrants(handlers: DenialGrantHandlers): DenialGrants {
  const denials = new Map<string, HeldDenial>()
  const grants = new Map<CallKey, Grant>()
  const armed = new Set<string>()

  const drop = (id: string, denial: HeldDenial): void => {
    denials.delete(id)
    if (denial.cancelShow === undefined) {
      handlers.onEvent({ kind: "permission-denial-settled", toolUseId: id })
    } else {
      denial.cancelShow()
    }
  }

  const settleSameKey = (keys: readonly CallKey[]): void => {
    for (const [id, denial] of denials) {
      if (keys.includes(denial.key)) {
        drop(id, denial)
      }
    }
  }

  const show = (id: string): void => {
    const denial = denials.get(id)
    if (denial?.cancelShow === undefined) {
      return
    }
    denial.cancelShow()
    denials.set(id, { key: denial.key, call: denial.call })
    handlers.onEvent({ kind: "permission-denied", denial: denialOf(denial.call) })
  }

  return {
    deny: (call) => {
      if (call.agentId !== undefined) {
        return
      }
      const key = callKey(call.toolName, call.input)
      settleSameKey([key])
      const cancelShow = handlers.schedule(() => {
        show(call.toolUseId)
      }, DENIAL_SHOW_DELAY_MS)
      denials.set(call.toolUseId, { key, call, cancelShow })
    },

    answer: (id, answer) => {
      const denial = denials.get(id)
      if (denial === undefined || denial.cancelShow !== undefined || answer.kind === "answers") {
        return false
      }
      drop(id, denial)
      if (answer.kind === "deny") {
        handlers.sendNotice(refusedNotice(denial.call))
        return true
      }
      grants.set(denial.key, { noticeUuid: handlers.sendNotice(allowedNotice(denial.call)) })
      return true
    },

    review: (toolName, inputs, toolUseId) => {
      const keys = inputs.map((input) => callKey(toolName, input))
      const granted = keys.find((key) => grants.has(key))
      if (granted !== undefined) {
        grants.delete(granted)
        armed.add(toolUseId)
        settleSameKey(keys)
        return "ask"
      }
      settleSameKey(keys)
      return "pass"
    },

    takeArmed: (toolUseId) => armed.delete(toolUseId),

    finishTurn: (consumedInputUuids) => {
      for (const id of denials.keys()) {
        show(id)
      }
      for (const [key, grant] of grants) {
        if (consumedInputUuids.includes(grant.noticeUuid)) {
          grants.delete(key)
        }
      }
    },

    clear: () => {
      for (const denial of denials.values()) {
        denial.cancelShow?.()
      }
      denials.clear()
      grants.clear()
      armed.clear()
    },
  }
}

/** transcript の `user` の文面が拒否への答えの知らせか。入力の控えの無い入力を、組み直しが利用者の依頼と見分ける手がかり。 */
export function isDenialNoticePrompt(raw: string): boolean {
  return NOTICE_PROMPT.test(raw.trim())
}

/**
 * ツール名と入力の鍵。入力はオブジェクトのキーを辞書順にそろえた JSON にする（キーの並びの違いで外れないように）。
 */
function callKey(toolName: string, input: unknown): CallKey {
  return `${toolName}\u0000${JSON.stringify(sortedKeys(input))}`
}

function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortedKeys)
  }
  if (!isPlainObject(value)) {
    return value
  }
  return Object.fromEntries(
    Object.keys(value)
      .toSorted()
      .map((key) => [key, sortedKeys(value[key])]),
  )
}

function denialOf(call: DeniedCall): PermissionDenial {
  return {
    toolUseId: call.toolUseId,
    toolName: call.toolName,
    reason: clipWithEllipsis(call.reason, MAX_DENIAL_REASON_LENGTH),
  }
}

const NOTICE_OPEN = "<tsukumo-permission>"
const NOTICE_CLOSE = "</tsukumo-permission>"
const NOTICE_PROMPT = /^<tsukumo-permission>\n[\s\S]*\n<\/tsukumo-permission>$/

/** 許可の知らせ。入力は含めない（会話の内容をこちらで書き写さない）。 */
function allowedNotice(call: DeniedCall): string {
  return wrapNotice([
    `利用者が、自動判定に止められた ${call.toolName} の呼び出しを一度だけ許可した。`,
    "止められたときと同じ入力でもう一度呼べば、確認なしで1回だけ通る。",
  ])
}

function refusedNotice(call: DeniedCall): string {
  return wrapNotice([
    `利用者は、自動判定に止められた ${call.toolName} の呼び出しを許可しなかった。`,
    "同じ呼び出しを打ち直さず、ほかの手で進めるか、できないことを伝えてほしい。",
  ])
}

function wrapNotice(lines: readonly string[]): string {
  return [NOTICE_OPEN, ...lines, NOTICE_CLOSE].join("\n")
}
