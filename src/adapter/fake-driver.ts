// 偽のセッション駆動。**claude を起こさずに**、台本どおりのイベントを時間の順に流す
// （docs/design.md 5章「fake-driver.ts」）。`TSUKUMO_DRIVER=fake` で選ぶ。
//
// 用途は目視確認と Playwright（docs/design.md 10章）。**台本は手で書いた架空の会話だけ**で、
// 実物の transcript は使わない（docs/coding-standards.md「会話内容の扱い」）。
//
// 契約は本物の駆動（src/core/session-driver.ts の `SessionDriver`）と同じ。違うのは中身が
// 台本であることだけなので、`session-manager` はどちらが動いているかを知らない。

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { z } from "zod"

import { type SessionDriver } from "../core/session-driver.ts"
import { type PendingAsk } from "../protocol/pending-ask.ts"
import { type SessionEvent, sessionEventSchema } from "../protocol/session-event.ts"

/** 既定の台本。tsukumo 自身の場所から解く（cwd に依存させない）。 */
const DEFAULT_SCRIPT_URL = new URL("../../test/fixture/fake-session.json", import.meta.url)

/** 台本の1手。`afterMs` は**その場面の始まりからの経過**（前の手からの差分ではない）。 */
const scriptStepSchema = z.object({ afterMs: z.number().min(0), event: sessionEventSchema })

/**
 * 台本。`opening` は起こした直後に流す場面、`turns` は依頼を受けるたびに順に流す場面。
 * 依頼が場面の数を超えたら**先頭に戻って繰り返す**（起こしっぱなしで何度でも試せるように）。
 */
const fakeScriptSchema = z.object({
  opening: z.array(scriptStepSchema),
  turns: z.array(z.array(scriptStepSchema)),
})

/** 台本の1手（読み取り専用の形。zod の出力もこの形に収まる）。 */
export type FakeScriptStep = { readonly afterMs: number; readonly event: SessionEvent }

export type FakeScript = {
  readonly opening: readonly FakeScriptStep[]
  readonly turns: readonly (readonly FakeScriptStep[])[]
}

export type FakeDriverOptions = {
  readonly script: FakeScript
  /** 内部イベントの受け取り口（本物の駆動と同じ契約）。 */
  readonly onEvent: (event: SessionEvent) => void
}

/**
 * 台本を読む。**読めない・形が違うときは undefined**（呼び出し側が起動を止める。台本が無ければ
 * 偽の駆動には意味が無いので、起動時の前提不足として扱ってよい）。
 */
export function readFakeScript(
  path: string = fileURLToPath(DEFAULT_SCRIPT_URL),
): FakeScript | undefined {
  let content: string
  try {
    content = readFileSync(path, "utf8")
  } catch {
    return undefined
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return undefined
  }

  const script = fakeScriptSchema.safeParse(parsed)
  return script.success ? script.data : undefined
}

/**
 * 偽の駆動を起こす。`opening` の場面をすぐに流し始め、`prompt()` のたびに次の場面を流す。
 * 答え待ち（`pending-changed`）も台本から積まれ、`answer()` で解けて次の `pending-changed` が
 * 流れる（本物の `canUseTool` と同じ見え方になる）。
 */
export function startFakeSession(options: FakeDriverOptions): SessionDriver {
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let pending: readonly PendingAsk[] = []
  let playedTurns = 0

  const emit = (event: SessionEvent): void => {
    if (event.kind === "pending-changed") {
      pending = event.pending
    }
    options.onEvent(event)
  }

  const play = (steps: readonly FakeScriptStep[]): void => {
    for (const step of steps) {
      const timer = setTimeout(() => {
        timers.delete(timer)
        emit(step.event)
      }, step.afterMs)
      timers.add(timer)
    }
  }

  const settle = (id: string): boolean => {
    if (!pending.some((ask) => ask.id === id)) {
      return false
    }
    emit({ kind: "pending-changed", pending: pending.filter((ask) => ask.id !== id) })
    return true
  }

  play(options.script.opening)

  return {
    prompt: (text) => {
      emit({ kind: "request", text })
      const turns = options.script.turns
      const scene = turns.length === 0 ? undefined : turns[playedTurns % turns.length]
      playedTurns += 1
      if (scene !== undefined) {
        play(scene)
      }
    },
    interrupt: () => {
      emit({ kind: "turn-finished", status: "error" })
      return Promise.resolve()
    },
    answer: (id) => settle(id),
    pending: () => pending,
    setModel: (model) => {
      emit({ kind: "session-info", ...sessionInfo(), model })
      return Promise.resolve()
    },
    setPermissionMode: (mode) => {
      emit({ kind: "session-info", ...sessionInfo(), permissionMode: mode })
      return Promise.resolve()
    },
    close: () => {
      for (const timer of timers) {
        clearTimeout(timer)
      }
      timers.clear()
    },
  }
}

/**
 * `session-info` の土台。**偽の駆動なので固定値**（本物は SDK の `init` から来る）。
 * ここに会話の内容は入らない。
 */
function sessionInfo(): {
  readonly sessionId: string
  readonly model: string | undefined
  readonly permissionMode: string | undefined
  readonly slashCommands: readonly string[]
  readonly terminalSlashCommands: readonly string[]
} {
  return {
    sessionId: "fake-session",
    model: undefined,
    permissionMode: undefined,
    slashCommands: [],
    terminalSlashCommands: [],
  }
}
