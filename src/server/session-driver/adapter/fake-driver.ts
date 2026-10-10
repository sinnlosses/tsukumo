// fake driver。claude を起こさずに、疑似セッションどおりのイベントを時間の順に流す。
// `TSUKUMO_DRIVER=fake` で選ぶ。
//
// 用途は目視確認と Playwright。
// 疑似セッションは手で書いた架空の会話だけで、実物の transcript は使わない。

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { z } from "zod"

import type { Expression } from "../../../shared/character-pack/expression.ts"
import type { EffortLevel } from "../../../shared/command.ts"
import type { ContextUsage } from "../../../shared/context-usage/context-usage.ts"
import type { PlanUsage } from "../../../shared/plan-usage/plan-usage.ts"
import type { Answer, PendingAsk } from "../../../shared/session-driver/pending-ask.ts"
import type { SessionDefault } from "../../../shared/session/session-default.ts"
import {
  type SessionDigest,
  sessionDigestSchema,
  UNAVAILABLE_SESSION_DIGEST,
} from "../../../shared/session/session-digest.ts"
import {
  type ModelEffortSupport,
  type SessionEvent,
  sessionEventSchema,
} from "../../../shared/session/session-event.ts"
import { NO_WORK_PLAN_STANDING } from "../../../shared/session/work-plan.ts"
import { createReportReview } from "../../report/core/report-review.ts"
import { recordedPromptImages } from "../core/prompt-image-shelf.ts"
import { briefedQuestions } from "../core/question-brief.ts"
import { reportEvents } from "../core/sdk-message.ts"
import type { SessionDriver } from "../core/session-driver.ts"
import { createSpeechReview } from "../core/speech-review.ts"

/** 既定の疑似セッション。tsukumo 自身の場所から解く（cwd に依存させない）。 */
const DEFAULT_SESSION_URL = new URL("../../../../test/fixture/fake-session.json", import.meta.url)

/** fake driver が流す固定のプラン。会話の内容ではないので、疑似セッションの JSON に持たせず、ここに直接書く。 */
const FAKE_PLAN = "Claude Max"

/**
 * fake driver が起こした直後に1回だけ流す、モデルごとの effort の対応。
 * 会話の内容ではないので疑似セッションの JSON には持たせず、ここに直接書く。
 * 本物の `supportedModels()` の実測値をそのまま写した。
 * `opus` / `sonnet` は5段すべてに対応し、`fable` はエイリアスと違う値〔`claude-fable-5-1`〕で返る。`haiku` は `supportsEffort` 自体が無い。
 * effort に対応しないモデルで選べなくなることと、エイリアスと一致しない値の当て方（画面側の表示ラベルの決め方）の両方を、疑似セッションでも確かめられるようにしてある。
 */
export const FAKE_MODEL_EFFORT_SUPPORT: readonly ModelEffortSupport[] = [
  { model: "opus", supportsEffort: true, effortLevels: ["low", "medium", "high", "xhigh", "max"] },
  {
    model: "claude-fable-5-1",
    supportsEffort: true,
    effortLevels: ["low", "medium", "high", "xhigh", "max"],
  },
  {
    model: "sonnet",
    supportsEffort: true,
    effortLevels: ["low", "medium", "high", "xhigh", "max"],
  },
  { model: "haiku", supportsEffort: false, effortLevels: [] },
]

/** fake driver が起こしたときに効いている既定の effort（疑似セッションだけの値）。 */
export const FAKE_DEFAULT_EFFORT: EffortLevel = "medium"

/**
 * fake driver が返すコンテキストの内訳の数。
 * 会話の内容ではないので疑似セッションの JSON には持たせず、ここに直接書く。
 * 架空の値だが、分類の並びと種別・合計と窓の関係だけは本物に合わせてある。
 * `used` の合計が `totalTokens`、それに `buffer` と `free` を足すと窓の大きさになる。
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

/**
 * fake driver が返す利用枠。会話の内容ではないので疑似セッションの JSON には持たせず、ここに直接書く。
 * 架空の値だが、5時間枠・7日間枠の使用率は見本（`QUOTA-Sidebar.dc.html`「1 ふだん」）と同じにしてある。
 * 戻る時刻は固定のエポックミリ秒。
 * 「いま」を読む場所を2つに絞ってある検査に、fake driver がここで触れて増やさないようにする。
 */
const FAKE_PLAN_USAGE = {
  fiveHour: { utilization: 34, resetsAt: 1_800_010_800_000 },
  sevenDay: { utilization: 61, resetsAt: 1_800_270_000_000 },
} satisfies PlanUsage

/**
 * 疑似セッションの1手。`afterMs` はその場面の始まりからの経過（前の手からの差分ではない）。
 * `waitForAnswer` が true の手は、それまでに積んだ答え待ちがすべて答えられるまで流さず、`afterMs` を答えが届いた時点（先に届いていればその手に着いた時点）からの経過として数える。
 * 続く手の `afterMs` も、その手が流れた時点を0とする経過になる。
 */
const fakeSessionStepSchema = z.object({
  afterMs: z.number().min(0),
  event: sessionEventSchema,
  waitForAnswer: z.boolean().default(false),
})

/** 依頼1回ぶんの場面。名前で名指しできる（{@link FakeDriverOptions.scene}）。 */
const fakeSessionSceneSchema = z
  .object({
    name: z.string().min(1),
    resume: z.string().min(1).optional(),
    steps: z.array(fakeSessionStepSchema),
  })
  .superRefine((scene, ctx) => rejectDescendingSteps(scene.steps, `場面 ${scene.name}`, ctx))
  .transform((scene) => ({ ...scene, resume: scene.resume }))

/** 続きとして読み込める過去の transcript。`messages` は SDK が transcript に残す形の架空のメッセージ列。 */
const fakePastSessionSchema = z.object({
  sessionId: z.string().min(1),
  messages: z.array(z.unknown()),
})

/**
 * 疑似セッション。`opening` は起こした直後に流す場面、`turns` は依頼を受けるたびに順に流す場面。
 * 依頼が場面の数を超えたら先頭に戻って繰り返す（起こしっぱなしで何度でも試せるように）。
 */
const fakeSessionSchema = z.object({
  opening: z
    .array(fakeSessionStepSchema)
    .superRefine((steps, ctx) => rejectDescendingSteps(steps, "opening", ctx)),
  turns: z.array(fakeSessionSceneSchema),
  pastSessions: z.array(fakePastSessionSchema).default([]),
  sessionDigests: z.record(z.string(), sessionDigestSchema).default({}),
})

/** 疑似セッションの1手（読み取り専用の形。zod の出力もこの形に収まる）。 */
export type FakeSessionStep = {
  readonly afterMs: number
  readonly event: SessionEvent
  readonly waitForAnswer: boolean
}

/**
 * 名前の付いた場面。
 * 名前は疑似セッションの中で重ならない前提で、同じ名前があれば先に書いたほうを使う。
 * 名前は画面の状態の呼び名（`question-multi` など）で、会話の内容ではない。
 */
export type FakeSessionScene = {
  readonly name: string
  /** この場面を名指しして起こしたとき、続きとして読み込む過去の transcript の `sessionId`。 */
  readonly resume: string | undefined
  readonly steps: readonly FakeSessionStep[]
}

export type FakePastSession = {
  readonly sessionId: string
  readonly messages: readonly unknown[]
}

export type FakeSession = {
  readonly opening: readonly FakeSessionStep[]
  readonly turns: readonly FakeSessionScene[]
  readonly pastSessions: readonly FakePastSession[]
  /**
   * 切り替え画面で選んだセッションの中身（`readSessionDigest` が返す）。
   * キーはセッションのID で、一覧に載せるのは場面が流す `sessions-changed`。無いIDは「読めない」になる。
   */
  readonly sessionDigests: Readonly<Record<string, SessionDigest>>
}

export type FakeDriverOptions = {
  readonly session: FakeSession
  /**
   * 起こした直後に `opening` へ続けて流す場面の名前（`TSUKUMO_FAKE_SCENE`）。依頼を送らずに特定の状態を出すための口。
   * 名前が疑似セッションに無ければ `opening` だけを流す。
   */
  readonly scene: string | undefined
  /**
   * `scene` の手を先頭から何個まで流すか（`TSUKUMO_FAKE_SCENE_UNTIL`）。場面の途中の画を撮るための口。
   * `undefined` なら全部流す。`opening` と、依頼で流れる次の場面には効かない。
   */
  readonly sceneUntil: number | undefined
  /**
   * このセッションを起こした既定（モデル・許可モード）。
   * 疑似セッションが流す `session-info` にもこの値を載せる。
   * 固定値のままだと、歯車で既定を変えて起こし直しても帯が疑似セッションに書いた値を出してしまう（本物は SDK の `init` が実際に起こした値を返す）。
   */
  readonly sessionDefault: SessionDefault
  /**
   * 最初のビュー（ブラウザのタブ）が繋がったら解ける約束。`opening` と名指しの場面はこれが解けてから流し始める。
   * 起こした直後から流すと、ページが繋がる前に届いたぶんは `hello` の状態に畳まれ、どこからが `events` として届くかが開くまでの時間で変わる（E2E のメッセージの列が走らせるたびに揃わない）。
   * 起こし直した代はもう繋がっているので、解けた約束を渡す。
   */
  readonly firstViewer: Promise<void>
  /** キャラクター定義にある表情名。`report` の `closing` の表情を本物と同じに畳む。 */
  readonly expressions: readonly Expression[]
  /** 内部イベントの受け取り口（本物の駆動と同じ契約）。 */
  readonly onEvent: (event: SessionEvent) => void
}

/** `readFakeSession` の結果。`reason` は読めなかった理由で、形が違うときは場面名と手の位置を含む。 */
export type FakeSessionReading =
  | { readonly kind: "read"; readonly session: FakeSession }
  | { readonly kind: "unreadable"; readonly reason: string }

/**
 * 疑似セッションを読む。読めない・JSON でない・形が違うときは `unreadable`。
 * 呼び出し側は起動を止めてよい（疑似セッションが無ければ fake driver には意味が無いので、起動時の前提不足として扱う）。
 */
export function readFakeSession(
  path: string = fileURLToPath(DEFAULT_SESSION_URL),
): FakeSessionReading {
  let content: string
  try {
    content = readFileSync(path, "utf8")
  } catch {
    return { kind: "unreadable", reason: `ファイルを読めない（${path}）` }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { kind: "unreadable", reason: `JSON として読めない（${path}）` }
  }

  const session = fakeSessionSchema.safeParse(parsed)
  if (!session.success) {
    return {
      kind: "unreadable",
      reason: session.error.issues.map((issue) => issue.message).join(" / "),
    }
  }
  return { kind: "read", session: session.data }
}

/**
 * fake driver を起こす。最初のビューが繋がったら `opening` の場面を流し始め、`prompt()` のたびに次の場面を流す。
 * 答え待ち（`pending-changed`）も疑似セッションから積まれ、`answer()` で解けて次の `pending-changed` が流れる（本物の `canUseTool` と同じ見え方になる）。
 *
 * `options.scene` に名前があれば、その場面を `opening` の続きとして流し、次の `prompt()` はその次の場面から続く。
 */
export function startFakeSession(options: FakeDriverOptions): SessionDriver {
  const timers = new Set<ReturnType<typeof setTimeout>>()
  // 最初のビューを待つあいだに閉じられたら、あとから流し始めない。
  let closed = false
  let ended = false
  let pending: readonly PendingAsk[] = []
  // いま動いているモデルと許可モード。起こした既定から始まり、`setModel` / `setPermissionMode` で変わる（本物は SDK が持つ値で、ここはその代わり）。
  let model: string = options.sessionDefault.model
  let permissionMode: string = options.sessionDefault.permissionMode
  // いま効いている effort。起こした直後・`setEffort` のたび・ターンが終わるたびに画面へ流す。
  let effort: EffortLevel = FAKE_DEFAULT_EFFORT
  // `report` の差し戻しの預かり（本物の駆動と同じ `ReportReview`）。
  // handler が無いので判定はしない。疑似セッションが書いた `tool-finished` の `isError` に従って、描くか捨てるかだけが決まる。
  const reportReview = createReportReview(() => NO_WORK_PLAN_STANDING)
  // `speak` の差し戻しの預かりも同じ。判定はせず、場面の `tool-finished` の `isError` に従う。
  const speechReview = createSpeechReview()

  const emit = (event: SessionEvent): void => {
    if (event.kind === "pending-changed") {
      pending = event.pending
    }
    if (event.kind === "session-ended") {
      ended = true
    }
    const events =
      event.kind === "report" ? reportEvents(event.toolUseId, event, options.expressions) : [event]
    const passedEvents = events
      .flatMap((normalized) => speechReview.pass(normalized))
      .flatMap((spoken) => reportReview.pass(spoken))
    for (const passed of passedEvents) {
      // 疑似セッションが書いた `session-info` のモデル・許可モードはいまの値で置き換える（疑似セッションの持ち物ではなく、起こし方で決まる値なので）。
      options.onEvent(
        passed.kind === "session-info" ? { ...passed, model, permissionMode } : passed,
      )
    }
    // ターンが終わるたびに、そのとき効いている effort を読めたことにする（本物の `Stop` フック入力を疑似する）。
    // `reportReview.pass` は通さない（`report` の差し戻しとは無関係）。
    if (event.kind === "turn-finished") {
      options.onEvent({ kind: "effort-changed", effort })
    }
  }

  // `waitForAnswer` の手の続きを、答え待ちが尽きるまで預かる。
  let heldUntilAnswered: readonly (() => void)[] = []

  // 次の手の setTimeout は前の手が発火してから差分の時間で登録する。
  // 絶対時刻でまとめて登録すると、CPU を奪われて止まったあとに期限切れの手がまとめて発火し、手のあいだの間隔が消える。
  // 同じ afterMs の手は setTimeout を挟まずに続けて流す（挟むと hello と最初の events の境目が揺れる）。
  const play = (steps: readonly FakeSessionStep[], startMs: number): void => {
    const playFrom = (index: number, firedAtMs: number): void => {
      const step = steps[index]
      if (step === undefined) {
        return
      }
      if (step.waitForAnswer) {
        if (pending.length === 0) {
          playStep(index, 0)
        } else {
          heldUntilAnswered = [...heldUntilAnswered, () => playStep(index, 0)]
        }
        return
      }
      playStep(index, firedAtMs)
    }
    const playStep = (index: number, firedAtMs: number): void => {
      const step = steps[index]
      if (step === undefined) {
        return
      }
      const delay = step.afterMs - firedAtMs
      if (delay <= 0) {
        emit(step.event)
        playFrom(index + 1, step.afterMs)
        return
      }
      const timer = setTimeout(() => {
        timers.delete(timer)
        emit(step.event)
        playFrom(index + 1, step.afterMs)
      }, delay)
      timers.add(timer)
    }
    playFrom(0, startMs)
  }

  const settle = (id: string, answer: Answer): boolean => {
    const ask = pending.find((candidate) => candidate.id === id)
    if (ask === undefined) {
      return false
    }
    // 本物の駆動（`PendingAnswerQueue`）と同じで、質問に答えが付いたら記録を流す。
    // これが無いと、疑似セッションで目視するときだけ質問の記録が残らない。
    if (ask.kind === "question" && answer.kind === "answers") {
      emit({
        kind: "question-answered",
        toolUseId: ask.id,
        questions: ask.questions,
        answers: answer.labels,
        briefed: briefedQuestions(ask.questions, ask.briefs),
        sentBack: 0,
      })
    }
    emit({ kind: "pending-changed", pending: pending.filter((candidate) => candidate.id !== id) })
    if (pending.length === 0) {
      const released = heldUntilAnswered
      heldUntilAnswered = []
      for (const release of released) {
        release()
      }
    }
    return true
  }

  // 本物の駆動は `accountInfo()` を起動直後に1回だけ取りに行く（`relayPlan`）。
  // fake driver は claude を起こさないので、疑似セッションで画面を確かめられるように固定値を1回流す。
  emit({ kind: "plan", plan: FAKE_PLAN })
  // 同じく `supportedModels()` の代わり（`relaySupportedModels`）。
  emit({ kind: "model-effort-support", models: FAKE_MODEL_EFFORT_SUPPORT })
  // 本物の駆動と同じく、起こした effort を最初のターンを待たずに流す。
  options.onEvent({ kind: "effort-changed", effort })

  void options.firstViewer.then(() => {
    if (closed) {
      return
    }
    play(startupSteps(options.session, options.scene, options.sceneUntil), 0)
  })
  const namedIndex = options.session.turns.findIndex((scene) => scene.name === options.scene)
  let playedTurns = namedIndex + 1

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
    prompt: (text, images, opening) => {
      // 疑似セッションを流すだけの駆動でも、控えと id だけを記録へ渡すのは本物と同じ。
      emit({ kind: opening, text, images: recordedPromptImages(images) })
      playNextTurn()
    },
    promptWithoutRecord: () => {
      // 記録に残さない依頼。本物と同じく `request` の代わりにターンの始まりだけを流し、文面はどこにも残さない（疑似セッションは次の場面へ進む）。
      emit({ kind: "turn-started" })
      playNextTurn()
    },
    interrupt: () => {
      emit({ kind: "turn-finished", outcome: { kind: "interrupted" } })
      return Promise.resolve()
    },
    answer: (id, answer) => settle(id, answer),
    pending: () => pending,
    // 本物は SDK に問い合わせる。
    // fake driver は claude を起こさないので、いま動いているモデルだけを載せた固定の内訳を返す（画面の札を疑似セッションでも確かめられるように）。
    readContextUsage: () =>
      Promise.resolve({ kind: "ready", usage: { model, ...FAKE_CONTEXT_USAGE } }),
    // 本物は SDK の実験中の口に問い合わせる。fake driver は claude を起こさないので、固定の利用枠を返す。
    readPlanUsage: () => Promise.resolve({ kind: "ready", usage: FAKE_PLAN_USAGE }),
    // 本物は transcript を読む。fake driver は疑似セッションに書いた架空の中身を返す。
    readSessionDigest: (sessionId) =>
      Promise.resolve(options.session.sessionDigests[sessionId] ?? UNAVAILABLE_SESSION_DIGEST),
    setModel: (next) => {
      // 名前が無い切り替えは覚えない（本物も `undefined` のときは何も知らせない）。
      if (next !== undefined) {
        model = next
      }
      emit({ kind: "session-info", ...sessionInfo() })
      return Promise.resolve()
    },
    // 本物の `setEffort` と同じく、受け付けた値をすぐ流す。
    setEffort: (next) => {
      effort = next
      options.onEvent({ kind: "effort-changed", effort })
      return Promise.resolve()
    },
    setPermissionMode: (mode) => {
      permissionMode = mode
      emit({ kind: "session-info", ...sessionInfo() })
      return Promise.resolve()
    },
    ended: () => ended,
    close: () => {
      closed = true
      heldUntilAnswered = []
      for (const timer of timers) {
        clearTimeout(timer)
      }
      timers.clear()
    },
  }
}

/**
 * 最初のビューが繋がってから流す手を、流し始めからの `afterMs` で1本に並べる。
 * `opening` のあとに、名指しの場面（`scene`）を `opening` の一番遅い手の時刻から続ける。
 * 名前が疑似セッションに無ければ `opening` だけ。
 * `sceneUntil` があれば、場面の手は先頭からその個数で切る。
 */
export function startupSteps(
  session: FakeSession,
  scene: string | undefined,
  sceneUntil: number | undefined,
): readonly FakeSessionStep[] {
  const namedScene = session.turns.find((candidate) => candidate.name === scene)
  const openingSpanMs = session.opening.reduce((span, step) => Math.max(span, step.afterMs), 0)
  return [
    ...session.opening,
    ...(namedScene?.steps ?? []).slice(0, sceneUntil).map((step) => ({
      ...step,
      afterMs: openingSpanMs + step.afterMs,
    })),
  ]
}

/** 手の並びの順に `afterMs` が減る最初の手を、`where`（場面名か opening）と位置つきで拒む。同じ値は通す。`waitForAnswer` の手は時刻の数え直しなので、前の手とは比べない。 */
function rejectDescendingSteps(
  steps: readonly { readonly afterMs: number; readonly waitForAnswer: boolean }[],
  where: string,
  ctx: z.RefinementCtx,
): void {
  const index = steps.findIndex(
    (step, i) => i > 0 && !step.waitForAnswer && step.afterMs < (steps[i - 1]?.afterMs ?? 0),
  )
  if (index < 0) {
    return
  }
  ctx.addIssue({
    code: "custom",
    message: `${where} の手 ${String(index)}（0始まり）の afterMs ${String(steps[index]?.afterMs)} が前の手の ${String(steps[index - 1]?.afterMs)} より小さい（afterMs は場面の始まりからの経過で、手の並びの順に増える）`,
  })
}

/**
 * `session-info` の土台。fake driver なので固定値（本物は SDK の `init` から来る）。ここに会話の内容は入らない。
 *
 * 形は `SessionEvent`（`kind: "session-info"`）と同じものを使う。
 * `model` / `permissionMode` がここで `| undefined` なのは、SDK の `init` をそのまま写す境界だから（`docs/coding-standards.md`「「無いかもしれない」値」の例外1）。
 * 値そのものは `emit` が載せ替えるので、この土台が持つのは「無い」のまま。
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
