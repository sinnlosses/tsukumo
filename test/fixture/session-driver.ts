// 駆動（`SessionDriver`）の代役。本物の claude は起こさず、呼ばれた口と引数を順に覚える。

import type { SessionDriver } from "../../src/server/session-driver/core/session-driver.ts"
import type { SessionDigest } from "../../src/shared/session/session-digest.ts"
import type { SessionEvent } from "../../src/shared/session/session-event.ts"
import { readyContextUsage } from "./context-usage.ts"
import { readyPlanUsage } from "./plan-usage.ts"

/** 呼ばれた回数と引数だけを覚える、テスト用の駆動。 */
export type StubDriver = {
  readonly driver: SessionDriver
  readonly emit: (event: SessionEvent) => void
  readonly attach: (onEvent: (event: SessionEvent) => void) => void
  /**
   * 復元の再生（`onRestoredEvents`）をまとめて1回で流す。駆動由来（`emit`）とは別の口
   * （`docs/architecture/character-pack.md`「復元の再生は駆動と別の口」）。
   */
  readonly emitRestored: (events: readonly SessionEvent[]) => void
  readonly attachRestored: (onRestoredEvents: (events: readonly SessionEvent[]) => void) => void
  readonly calls: string[]
  answerable: boolean
}

/** 駆動が返すセッションの中身。 */
export const FAKE_SESSION_DIGEST: SessionDigest = {
  kind: "known",
  requestCount: 3,
  summary: "架空の要約",
  lastLine: "架空のセリフ",
}

export function createStubDriver(): StubDriver {
  const calls: string[] = []
  let onEvent: (event: SessionEvent) => void = () => {}
  let onRestoredEvents: (events: readonly SessionEvent[]) => void = () => {}
  const stub = {
    driver: {
      prompt: (text: string) => calls.push(`prompt:${text}`),
      promptWithoutRecord: (text: string) => calls.push(`promptWithoutRecord:${text}`),
      interrupt: () => {
        calls.push("interrupt")
        return Promise.resolve()
      },
      answer: (id: string) => {
        calls.push(`answer:${id}`)
        return stub.answerable
      },
      pending: () => [],
      readContextUsage: () => {
        calls.push("readContextUsage")
        return Promise.resolve(readyContextUsage())
      },
      readPlanUsage: () => {
        calls.push("readPlanUsage")
        return Promise.resolve(readyPlanUsage())
      },
      readSessionDigest: (sessionId: string) => {
        calls.push(`readSessionDigest:${sessionId}`)
        return Promise.resolve(FAKE_SESSION_DIGEST)
      },
      setModel: (model: string | undefined) => {
        calls.push(`setModel:${model ?? ""}`)
        return Promise.resolve()
      },
      setEffort: (effort: string) => {
        calls.push(`setEffort:${effort}`)
        return Promise.resolve()
      },
      setPermissionMode: (mode: string) => {
        calls.push(`setPermissionMode:${mode}`)
        return Promise.resolve()
      },
      close: () => calls.push("close"),
    },
    emit: (event: SessionEvent) => onEvent(event),
    attach: (next: (event: SessionEvent) => void) => {
      onEvent = next
    },
    emitRestored: (events: readonly SessionEvent[]) => onRestoredEvents(events),
    attachRestored: (next: (events: readonly SessionEvent[]) => void) => {
      onRestoredEvents = next
    },
    calls,
    answerable: true,
  }
  return stub
}
