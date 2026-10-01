// コマンドのルータを、画面と同じ門（照合と断る条件）ごと手元で呼ぶ client。
// 結果は `{ ok: true }` か、断った理由の `{ ok: false, reason }` に畳む。

import { createRouterClient, ORPCError } from "@orpc/server"
import { isPlainObject } from "remeda"

import { type CommandRouterPorts, createCommandRouter } from "../../src/router.ts"
import type { CommandSession } from "../../src/server/session/core/command-session.ts"

/** 手続きの照合に使う架空の起動トークンとオリジン（照合そのものは `isConnectionGranted` のテストが見る）。 */
const TEST_TOKEN = "架空のトークン"
const TEST_ORIGIN = "http://127.0.0.1:0"

export function createCommandClient(ports: CommandRouterPorts, session: CommandSession) {
  return createRouterClient(createCommandRouter(ports), {
    context: {
      presentedToken: TEST_TOKEN,
      requestOrigin: undefined,
      startupToken: TEST_TOKEN,
      serverOrigin: TEST_ORIGIN,
      session,
    },
    interceptors: [({ next }) => next().then(() => ({ ok: true }), refusalOf)],
  })
}

/**
 * 断られた手続き（契約に書いた `REFUSED`）を `{ ok: false, reason }` に畳む（それ以外の失敗は
 * テストの誤りなので投げ直す）。
 */
function refusalOf(error: unknown): { readonly ok: false; readonly reason: unknown } {
  if (
    error instanceof ORPCError &&
    error.code === "REFUSED" &&
    error.defined &&
    isPlainObject(error.data)
  ) {
    return { ok: false, reason: error.data["reason"] }
  }
  throw error
}
