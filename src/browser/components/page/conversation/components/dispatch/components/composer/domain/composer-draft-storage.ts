// 入力欄の打ちかけをセッションごとに `localStorage` に持つ（再読み込みやアプリの落ちのあとに戻すため）。
// 端末ごとの保存で、サーバの状態には置かない。会話内容を含むので、この端末の外へは出さない。
// 保つのは文面とキャレットだけで、添付の画像は保たない。
// 並びは書いた順（末尾が最後に書いたもの）で、直近 `MAX_DRAFT_SESSIONS` セッション分を超えた古いほうを捨てる。
// 読めない・壊れた値は空として扱う。

import { z } from "zod"

import { EMPTY_DRAFT, type Draft } from "../../../../../../../../stores/composer-draft.ts"
import { localPreference } from "../../../../../../../../utils/local-preference.ts"

export const MAX_DRAFT_SESSIONS = 10

type StoredDraft = Draft & { readonly sessionId: string }

export function loadSessionDraft(sessionId: string): Draft | undefined {
  const found = readAll().find((stored) => stored.sessionId === sessionId)
  return found === undefined ? undefined : { text: found.text, caret: found.caret }
}

/** 空の文面は保存せず、あれば消す。 */
export function saveSessionDraft(sessionId: string, draft: Draft): void {
  if (draft.text === "") {
    clearSessionDraft(sessionId)
    return
  }
  const others = readAll().filter((stored) => stored.sessionId !== sessionId)
  writeAll(
    [...others, { sessionId, text: draft.text, caret: draft.caret }].slice(-MAX_DRAFT_SESSIONS),
  )
}

export function clearSessionDraft(sessionId: string): void {
  const all = readAll()
  const rest = all.filter((stored) => stored.sessionId !== sessionId)
  if (rest.length !== all.length) {
    writeAll(rest)
  }
}

/**
 * 入力欄が見せているセッションが `previous` から `next` に変わったときに、入力欄へ出す下書き。`undefined` は入力欄をそのままにする。
 * `previous` から離れるときは(`next` が未確定でも)、いまの下書きを `previous` へ保つ。
 * - `next` が未確定: 入力欄を空にする。未確定のあいだに打った字は保存されず、次に決まったセッションのものになる
 * - `previous` が無い(画面を開いた直後・未確定のあと)で `next` が決まった: 入力欄が空のときだけ保存済みを戻す
 * - 切り替え: `next` の保存済み(無ければ空)に入れ替える
 */
export function draftOnSessionChange(
  previous: string | undefined,
  next: string | undefined,
  current: Draft,
): Draft | undefined {
  if (previous !== undefined) {
    saveSessionDraft(previous, current)
  }
  if (next === undefined) {
    return previous === undefined ? undefined : EMPTY_DRAFT
  }
  if (previous === undefined) {
    return current.text === "" ? (loadSessionDraft(next) ?? current) : undefined
  }
  return loadSessionDraft(next) ?? EMPTY_DRAFT
}

// 壊れた要素だけを落とし、残りは読む。配列でない・JSON として壊れているときは空。
const preference = localPreference(
  "tsukumo-composer-draft:v1",
  z.array(z.unknown()).transform((items) => items.filter(isStoredDraft)),
  [],
)

function readAll(): readonly StoredDraft[] {
  return preference.load()
}

function isStoredDraft(value: unknown): value is StoredDraft {
  return (
    typeof value === "object" &&
    value !== null &&
    "sessionId" in value &&
    typeof value.sessionId === "string" &&
    "text" in value &&
    typeof value.text === "string" &&
    value.text !== "" &&
    "caret" in value &&
    typeof value.caret === "number"
  )
}

function writeAll(drafts: readonly StoredDraft[]): void {
  preference.save([...drafts])
}
