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
  readonly agentId?: string
  /** 拒否したエージェントの種類。Workflow の中のエージェントは `workflow-subagent`。 */
  readonly agentType?: string
}

/** Workflow の中のエージェントの `agent_type`。メインから声が届かないので、拒否のお願いを出さない。 */
const WORKFLOW_SUBAGENT_TYPE = "workflow-subagent"

/** PreToolUse で呼び出しを見た結果。`ask` は印と一致したので `canUseTool` へ回す。 */
export type CallReviewByGrant = "ask" | "pass"

export type DenialGrantHandlers = {
  readonly onEvent: (event: SessionEvent) => void
  /** モデルへ差し込みの発言を送り、送った発言の uuid を返す。 */
  readonly sendNotice: (text: string) => string
}

export type DenialGrants = {
  /** 拒否を積んで画面へ知らせる。同じ鍵の答えていない拒否は下げる。 */
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
  /** エージェントが終わった。そのエージェントの答えていない拒否を下げ、宛ての使われていない印を捨てる。 */
  readonly finishAgent: (agentId: string) => void
  /** ターンが終わった。そのターンが受け取った入力に許可の知らせがあれば、まだ使われていない印を捨てる。 */
  readonly finishTurn: (consumedInputUuids: readonly string[]) => void
  /** 印と控えを全て捨てる（セッションを閉じたとき）。 */
  readonly clear: () => void
}

/** 拒否1件と印の照合に使う鍵。 */
type CallKey = string

type Grant = { readonly noticeUuid: string; readonly agentId?: string }

/** {@link DenialGrants} を1つ作る。状態（答えていない拒否・印・通す控え）を持つのはここだけ。 */
export function createDenialGrants(handlers: DenialGrantHandlers): DenialGrants {
  const denials = new Map<string, { readonly key: CallKey; readonly call: DeniedCall }>()
  const grants = new Map<CallKey, Grant>()
  const armed = new Set<string>()

  const settleSameKey = (keys: readonly CallKey[]): void => {
    for (const [id, denial] of denials) {
      if (keys.includes(denial.key)) {
        denials.delete(id)
        handlers.onEvent({ kind: "permission-denial-settled", toolUseId: id })
      }
    }
  }

  return {
    deny: (call) => {
      if (call.agentType === WORKFLOW_SUBAGENT_TYPE) {
        return
      }
      const key = callKey(call.toolName, call.input)
      settleSameKey([key])
      denials.set(call.toolUseId, { key, call })
      handlers.onEvent({ kind: "permission-denied", denial: denialOf(call) })
    },

    answer: (id, answer) => {
      const denial = denials.get(id)
      if (denial === undefined || answer.kind === "answers") {
        return false
      }
      denials.delete(id)
      handlers.onEvent({ kind: "permission-denial-settled", toolUseId: id })
      if (answer.kind === "deny") {
        handlers.sendNotice(refusedNotice(denial.call))
        return true
      }
      grants.set(denial.key, {
        noticeUuid: handlers.sendNotice(allowedNotice(denial.call)),
        ...(denial.call.agentId === undefined ? {} : { agentId: denial.call.agentId }),
      })
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

    finishAgent: (agentId) => {
      for (const [id, denial] of denials) {
        if (denial.call.agentId === agentId) {
          denials.delete(id)
          handlers.onEvent({ kind: "permission-denial-settled", toolUseId: id })
        }
      }
      for (const [key, grant] of grants) {
        if (grant.agentId === agentId) {
          grants.delete(key)
        }
      }
    },

    finishTurn: (consumedInputUuids) => {
      for (const [key, grant] of grants) {
        if (consumedInputUuids.includes(grant.noticeUuid)) {
          grants.delete(key)
        }
      }
    },

    clear: () => {
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
    ...(call.agentId === undefined ? {} : { agentId: call.agentId }),
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
    ...(call.agentId === undefined
      ? []
      : [
          "止められたのはサブエージェントの中の呼び出しなので、そのサブエージェントに同じ呼び出しを打ち直させてほしい。",
        ]),
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
