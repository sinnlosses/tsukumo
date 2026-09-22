// fake driver。**claude を起こさずに**、疑似セッションどおりのイベントを時間の順に流す
// （docs/design.md 5章「fake-driver.ts」）。`TSUKUMO_DRIVER=fake` で選ぶ。
//
// 用途は目視確認と Playwright（docs/design.md 10章）。**疑似セッションは手で書いた架空の会話だけ**で、
// 実物の transcript は使わない（docs/coding-standards.md「会話内容の扱い」）。
//
// 契約は本物の駆動（src/server/core/session-driver.ts の `SessionDriver`）と同じ。違うのは中身が
// 疑似セッションであることだけなので、`session-manager` はどちらが動いているかを知らない。

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { z } from "zod"

import { type Answer, type PendingAsk } from "../../shared/pending-ask.ts"
import { type SessionEvent, sessionEventSchema } from "../../shared/session-event.ts"
import { type SessionDriver } from "../core/session-driver.ts"

/** 既定の疑似セッション。tsukumo 自身の場所から解く（cwd に依存させない）。 */
const DEFAULT_SESSION_URL = new URL("../../../test/fixture/fake-session.json", import.meta.url)

/** 疑似セッションの1手。`afterMs` は**その場面の始まりからの経過**（前の手からの差分ではない）。 */
const fakeSessionStepSchema = z.object({ afterMs: z.number().min(0), event: sessionEventSchema })

/** 依頼1回ぶんの場面。**名前で名指しできる**（{@link FakeDriverOptions.scene}）。 */
const fakeSessionSceneSchema = z.object({
  name: z.string().min(1),
  steps: z.array(fakeSessionStepSchema),
})

/**
 * 疑似セッション。`opening` は起こした直後に流す場面、`turns` は依頼を受けるたびに順に流す場面。
 * 依頼が場面の数を超えたら**先頭に戻って繰り返す**（起こしっぱなしで何度でも試せるように）。
 */
const fakeSessionSchema = z.object({
  opening: z.array(fakeSessionStepSchema),
  turns: z.array(fakeSessionSceneSchema),
})

/** 疑似セッションの1手（読み取り専用の形。zod の出力もこの形に収まる）。 */
export type FakeSessionStep = { readonly afterMs: number; readonly event: SessionEvent }

/**
 * 名前の付いた場面。名前は疑似セッションの中で重ならない前提で、同じ名前があれば先に書いたほうを
 * 使う。**名前は画面の状態の呼び名**（`question-multi` など）で、会話の内容ではない。
 */
export type FakeSessionScene = {
  readonly name: string
  readonly steps: readonly FakeSessionStep[]
}

export type FakeSession = {
  readonly opening: readonly FakeSessionStep[]
  readonly turns: readonly FakeSessionScene[]
}

export type FakeDriverOptions = {
  readonly session: FakeSession
  /**
   * 起こした直後に `opening` へ続けて流す場面の名前（`TSUKUMO_FAKE_SCENE`）。**依頼を送らずに
   * 特定の状態を出す**ための口で、状態のカタログを撮る道具が使う
   * （`docs/architecture.md`「手で確かめること」）。名前が疑似セッションに無ければ `opening` だけを
   * 流す。
   */
  readonly scene: string | undefined
  /** 内部イベントの受け取り口（本物の駆動と同じ契約）。 */
  readonly onEvent: (event: SessionEvent) => void
}

/**
 * 疑似セッションを読む。**読めない・形が違うときは undefined**（呼び出し側が起動を止める。
 * 疑似セッションが無ければ fake driver には意味が無いので、起動時の前提不足として扱ってよい）。
 */
export function readFakeSession(
  path: string = fileURLToPath(DEFAULT_SESSION_URL),
): FakeSession | undefined {
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

  const session = fakeSessionSchema.safeParse(parsed)
  return session.success ? session.data : undefined
}

/**
 * fake driver を起こす。`opening` の場面をすぐに流し始め、`prompt()` のたびに次の場面を流す。
 * 答え待ち（`pending-changed`）も疑似セッションから積まれ、`answer()` で解けて次の
 * `pending-changed` が流れる（本物の `canUseTool` と同じ見え方になる）。
 *
 * `options.scene` に名前があれば、その場面を `opening` の続きとして流し、**次の `prompt()` は
 * その次の場面から**続く（依頼を送らずに特定の状態へ着けるための口）。
 */
export function startFakeSession(options: FakeDriverOptions): SessionDriver {
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let pending: readonly PendingAsk[] = []

  const emit = (event: SessionEvent): void => {
    if (event.kind === "pending-changed") {
      pending = event.pending
    }
    options.onEvent(event)
  }

  const play = (steps: readonly FakeSessionStep[], startMs: number): void => {
    for (const step of steps) {
      const timer = setTimeout(() => {
        timers.delete(timer)
        emit(step.event)
      }, startMs + step.afterMs)
      timers.add(timer)
    }
  }

  const settle = (id: string, answer: Answer): boolean => {
    const ask = pending.find((candidate) => candidate.id === id)
    if (ask === undefined) {
      return false
    }
    // 本物の駆動（src/server/core/pending-answer.ts）と同じで、質問に答えが付いたら記録を流す。
    // これが無いと、疑似セッションで目視するときだけ質問の記録が残らない。
    if (ask.kind === "question" && answer.kind === "answers") {
      emit({ kind: "question-answered", questions: ask.questions, answers: answer.labels })
    }
    emit({ kind: "pending-changed", pending: pending.filter((candidate) => candidate.id !== id) })
    return true
  }

  play(options.session.opening, 0)

  // 名指しされた場面（無ければ findIndex が -1 を返すだけ）。`opening` と重ならないように、
  // その終わりから続けて流す。
  const namedIndex = options.session.turns.findIndex((scene) => scene.name === options.scene)
  const namedScene = namedIndex < 0 ? undefined : options.session.turns[namedIndex]
  if (namedScene !== undefined) {
    play(namedScene.steps, openingSpanMs(options.session.opening))
  }
  let playedTurns = namedScene === undefined ? 0 : namedIndex + 1

  /** 次の場面を流す（依頼でも、記録に残さない依頼でも同じ）。 */
  const playNextTurn = (): void => {
    const turns = options.session.turns
    const scene = turns.length === 0 ? undefined : turns[playedTurns % turns.length]
    playedTurns += 1
    if (scene !== undefined) {
      play(scene.steps, 0)
    }
  }

  return {
    prompt: (text, images) => {
      // 疑似セッションを流すだけの駆動でも、**控えだけを記録へ渡す**のは本物と同じ
      // （原寸はここで手放す。`docs/requirements.md` 4.10）。
      emit({ kind: "request", text, images: images.map((image) => image.thumbnail) })
      playNextTurn()
    },
    promptWithoutRecord: () => {
      // 記録に残さない依頼（`docs/design.md` 13.7）。本物と同じく `request` の代わりに
      // ターンの始まりだけを流し、**文面はどこにも残さない**（疑似セッションは次の場面へ進む）。
      emit({ kind: "turn-started" })
      playNextTurn()
    },
    interrupt: () => {
      emit({ kind: "turn-finished", status: "error" })
      return Promise.resolve()
    },
    answer: (id, answer) => settle(id, answer),
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

/** `opening` が流れ終わる時刻（一番遅い手の `afterMs`）。名指しの場面はこの後ろに続ける。 */
function openingSpanMs(opening: readonly FakeSessionStep[]): number {
  return opening.reduce((span, step) => Math.max(span, step.afterMs), 0)
}

/**
 * `session-info` の土台。**fake driver なので固定値**（本物は SDK の `init` から来る）。
 * ここに会話の内容は入らない。
 *
 * 形は `SessionEvent`（`kind: "session-info"`）と同じものを使う（同じ「無い」を2箇所で
 * 書き直さない）。**`model` / `permissionMode` がここで `| undefined` なのは、SDK の `init`
 * をそのまま写す境界だから**（`docs/coding-standards.md`「「無いかもしれない」値」の例外1）。
 * 状態側（`src/shared/session-state.ts`）では `model` は `SessionState.model` へ独立に写り、
 * `permissionMode` が無ければ `session` は `sessionId` だけの `identified` に畳まれる。
 */
function sessionInfo(): Omit<Extract<SessionEvent, { kind: "session-info" }>, "kind"> {
  return {
    sessionId: "fake-session",
    model: undefined,
    permissionMode: undefined,
    slashCommands: [],
    terminalSlashCommands: [],
  }
}
