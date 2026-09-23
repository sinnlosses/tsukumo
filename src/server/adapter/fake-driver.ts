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

import { type ContextUsage } from "../../shared/context-usage.ts"
import { type Answer, type PendingAsk } from "../../shared/pending-ask.ts"
import { type SessionDefault } from "../../shared/session-default.ts"
import { type SessionEvent, sessionEventSchema } from "../../shared/session-event.ts"
import { recordedPromptImages } from "../core/prompt-image-shelf.ts"
import { type SessionDriver } from "../core/session-driver.ts"

/** 既定の疑似セッション。tsukumo 自身の場所から解く（cwd に依存させない）。 */
const DEFAULT_SESSION_URL = new URL("../../../test/fixture/fake-session.json", import.meta.url)

/**
 * fake driver が流す固定のプラン（`docs/glossary.md`「プラン」）。**会話の内容ではない**ので、
 * 疑似セッションの JSON に持たせず、ここに直接書く。
 */
const FAKE_PLAN = "Claude Max"

/**
 * fake driver が返すコンテキストの内訳（`docs/glossary.md`「コンテキストの内訳」）の数。
 * **会話の内容ではない**ので疑似セッションの JSON には持たせず、ここに直接書く。架空の値だが、
 * **分類の並びと種別・合計と窓の関係だけは本物に合わせてある**（`used` の合計が
 * `totalTokens`、それに `buffer` と `free` を足すと窓の大きさになる）。
 */
const FAKE_CONTEXT_USAGE = {
  totalTokens: 121_500,
  maxTokens: 200_000,
  percentage: 61,
  categories: [
    { name: "System prompt", tokens: 7800, kind: "used" },
    { name: "System tools", tokens: 8700, kind: "used" },
    { name: "MCP tools", tokens: 800, kind: "used" },
    { name: "MCP tools (deferred)", tokens: 2100, kind: "deferred" },
    { name: "Memory files", tokens: 12_200, kind: "used" },
    { name: "Skills", tokens: 4700, kind: "used" },
    { name: "Messages", tokens: 87_300, kind: "used" },
    { name: "Autocompact buffer", tokens: 45_000, kind: "buffer" },
    { name: "Free space", tokens: 33_500, kind: "free" },
  ],
  mcpTools: [
    { name: "mcp__tsukumo__speak", source: "tsukumo", tokens: 180 },
    { name: "mcp__tsukumo__remember", source: "tsukumo", tokens: 120 },
  ],
  memoryFiles: [
    { name: "CLAUDE.md", source: "Project", tokens: 11_400 },
    { name: "MEMORY.md", source: "AutoMem", tokens: 800 },
  ],
  skills: [{ name: "next-task", source: "userSettings", tokens: 120 }],
} satisfies Omit<ContextUsage, "model">

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
  /**
   * このセッションを起こした既定（モデル・許可モード。`docs/screen-design.md` 13.6）。**疑似
   * セッションが流す `session-info` にもこの値を載せる** — 固定値のままだと、歯車で既定を
   * 変えて起こし直しても帯が疑似セッションに書いた値を出してしまう（本物は SDK の `init` が
   * 実際に起こした値を返す）。
   */
  readonly sessionDefault: SessionDefault
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
  // いま動いているモデルと許可モード。起こした既定から始まり、`setModel` /
  // `setPermissionMode` で変わる（本物は SDK が持つ値で、ここはその代わり）。
  let model: string = options.sessionDefault.model
  let permissionMode: string = options.sessionDefault.permissionMode

  const emit = (event: SessionEvent): void => {
    if (event.kind === "pending-changed") {
      pending = event.pending
    }
    // 疑似セッションが書いた `session-info` のモデル・許可モードは**いまの値で置き換える**
    // （疑似セッションの持ち物ではなく、起こし方で決まる値なので）。
    options.onEvent(event.kind === "session-info" ? { ...event, model, permissionMode } : event)
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

  // 本物の駆動は `accountInfo()` を起動直後に1回だけ取りに行く（`src/server/adapter/sdk-driver.ts`
  // の `relayPlan`）。fake driver は claude を起こさないので、疑似セッションで画面を確かめられる
  // ように固定値を1回流す。
  emit({ kind: "plan", plan: FAKE_PLAN })

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
      // 疑似セッションを流すだけの駆動でも、**控えと id だけを記録へ渡す**のは本物と同じ
      // （`docs/requirements.md` 4.10）。
      emit({ kind: "request", text, images: recordedPromptImages(images) })
      playNextTurn()
    },
    promptWithoutRecord: () => {
      // 記録に残さない依頼（`docs/screen-design.md` 13.7）。本物と同じく `request` の代わりに
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
    // 本物は SDK に問い合わせる。fake driver は claude を起こさないので、**いま動いている
    // モデルだけを載せた**固定の内訳を返す（画面の札を疑似セッションでも確かめられるように）。
    readContextUsage: () =>
      Promise.resolve({ kind: "ready", usage: { model, ...FAKE_CONTEXT_USAGE } }),
    setModel: (next) => {
      // **名前が無い切り替えは覚えない**（本物も `undefined` のときは何も知らせない）。
      if (next !== undefined) {
        model = next
      }
      emit({ kind: "session-info", ...sessionInfo() })
      return Promise.resolve()
    },
    setPermissionMode: (mode) => {
      permissionMode = mode
      emit({ kind: "session-info", ...sessionInfo() })
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
 * **値そのものは `emit` が載せ替える**ので、この土台が持つのは「無い」のまま。
 * 状態側（`src/shared/session-state.ts`）では `model` は `SessionState.model` へ独立に写る。
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
