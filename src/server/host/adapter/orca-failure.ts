// `orca` が失敗したときの出力から、失敗の理由を決める。

import { isPlainObject } from "remeda"

import { parseJson } from "../../../shared/utils/parse-json.ts"

/** 出力から読んだ失敗。`known` は日本語の説明がある失敗、`code` は表に無い失敗のコード、`none` は読み取れる手掛かりが無い。 */
export type OrcaFailureReading =
  | { readonly kind: "known"; readonly reason: string }
  | { readonly kind: "code"; readonly code: string }
  | { readonly kind: "none" }

/**
 * orca の失敗の出力を読む。
 * `--json` の応答（stdout の `{"ok": false, "error": {"code", "message"}}`）は `error.code` だけを根拠にし、`error.message`・`data`（パスや選択子の値が入る）は理由に出さない。
 * JSON にならない出力は、stdout と stderr を合わせた全体が1語のコードの形のときだけそれをコードとみなす。
 * どちらの経路でも、同じコードなら表（{@link KNOWN_ORCA_FAILURES}）で同じ理由になる。
 */
export function readOrcaFailure(stdout: string, stderr: string): OrcaFailureReading {
  const structured = readStructuredCode(stdout)
  if (structured !== undefined) {
    return structured
  }

  const word = `${stdout}\n${stderr}`.trim()
  return CODE_SHAPE.test(word) ? readCode(word) : { kind: "none" }
}

function readStructuredCode(stdout: string): OrcaFailureReading | undefined {
  const parsed = parseJson(stdout)
  if (!isPlainObject(parsed) || parsed.ok !== false || !isPlainObject(parsed.error)) {
    return undefined
  }

  const { code, message } = parsed.error
  if (typeof code !== "string") {
    return undefined
  }

  // 汎用の `invalid_argument` に固定文言が載る失敗は、code だけでは区別できない。
  if (code === "invalid_argument" && message === MISSING_SEND_PAYLOAD_MESSAGE) {
    return { kind: "known", reason: "送る中身が空" }
  }

  return CODE_SHAPE.test(code) ? readCode(code) : { kind: "none" }
}

function readCode(code: string): OrcaFailureReading {
  const known = KNOWN_ORCA_FAILURES.find((failure) => failure.code === code)
  return known === undefined ? { kind: "code", code } : { kind: "known", reason: known.reason }
}

const MISSING_SEND_PAYLOAD_MESSAGE = "Missing terminal send payload"

/** 会話の内容と形が違うこと（日本語・空白・記号・改行を含まない短い1語）。 */
const CODE_SHAPE = /^[a-z][a-z0-9_]{2,40}$/

/**
 * `error.code` ごとの日本語の説明。orca 自身が返す固定のコードだけを載せる。
 * `agent_prompt_blocked` は orca の実装から読んだもので、実機の応答は未確認。
 */
const KNOWN_ORCA_FAILURES = [
  {
    code: "terminal_handle_stale",
    reason: "送信先のターミナルが見つからない（一覧が古くなっている）",
  },
  {
    code: "agent_prompt_blocked",
    reason: "claude が入力待ちの表示を出している間は送れない（ターミナル側で答える）",
  },
] as const satisfies readonly { readonly code: string; readonly reason: string }[]
