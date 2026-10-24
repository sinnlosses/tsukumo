// fake driver。claude を起こさずに、疑似セッションどおりのイベントを時間の順に流す。
// `TSUKUMO_DRIVER=fake` で選ぶ。
//
// 用途は目視確認と Playwright。
// 疑似セッションは手で書いた架空の会話だけで、実物の transcript は使わない。

import type { Expression } from "../../../shared/character-pack/expression.ts"
import type { EffortLevel, PermissionMode } from "../../../shared/command.ts"
import type { Answer, PendingAsk } from "../../../shared/session-driver/pending-ask.ts"
import type { SessionDefault } from "../../../shared/session/session-default.ts"
import { UNAVAILABLE_SESSION_DIGEST } from "../../../shared/session/session-digest.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { createCallReview } from "../core/call-review.ts"
import { recordedPromptImages } from "../core/prompt-image-shelf.ts"
import { reportEvents } from "../core/sdk-report-message.ts"
import type { SessionDriver } from "../core/session-driver.ts"
import {
  FAKE_CONTEXT_USAGE,
  FAKE_DEFAULT_EFFORT,
  FAKE_MODEL_EFFORT_SUPPORT,
  FAKE_PLAN,
  FAKE_PLAN_USAGE,
} from "./fake-fixed-reply.ts"
import { type FakeSession, type FakeSessionStep, startupSteps } from "./fake-session.ts"

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
  /** キャラクターパックにある表情名。`report` の `closing` の表情を本物と同じに畳む。 */
  readonly expressions: readonly Expression[]
  /** 内部イベントの受け取り口（本物の駆動と同じ契約）。 */
  readonly onEvent: (event: SessionEvent) => void
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
  let permissionMode: PermissionMode = options.sessionDefault.permissionMode
  // いま効いている effort。起こした直後・`setEffort` のたび・ターンが終わるたびに画面へ流す。
  let effort: EffortLevel = FAKE_DEFAULT_EFFORT
  // 差し戻しの預かり（本物の駆動と同じ `CallReview`）。
  // handler が無いので判定はしない。疑似セッションが書いた `tool-finished` の `isError` に従って、描くか捨てるかだけが決まる。
  const callReview = createCallReview()
  // 最後に流した `session-info` のスキルとエージェントの名前。
  // `setModel` / `setPermissionMode` が流す `session-info` にも載せる（本物の `init` は毎回全部を送るので、空で上書きすると疑似だけ候補が消える）。
  let names: SessionInfoNames = { skillNames: [], agentNames: [] }

  const emit = (event: SessionEvent): void => {
    if (event.kind === "pending-changed") {
      pending = event.pending
    }
    if (event.kind === "session-info") {
      names = { skillNames: event.skillNames, agentNames: event.agentNames }
    }
    if (event.kind === "session-ended") {
      ended = true
    }
    const events =
      event.kind === "report" ? reportEvents(event.toolUseId, event, options.expressions) : [event]
    const passedEvents = events.flatMap((normalized) => callReview.pass(normalized))
    for (const passed of passedEvents) {
      // 疑似セッションが書いた `session-info` のモデル・許可モードはいまの値で置き換える（疑似セッションの持ち物ではなく、起こし方で決まる値なので）。
      options.onEvent(
        passed.kind === "session-info" ? { ...passed, model, permissionMode } : passed,
      )
    }
    // ターンが終わるたびに、そのとき効いている effort を見届けたことにする（本物の `Stop` フック入力を疑似する）。
    // `callReview.pass` は通さない（差し戻しとは無関係）。
    if (event.kind === "turn-finished") {
      options.onEvent({ kind: "setting-confirmed", setting: "effort", value: effort })
    }
  }

  // 次のターンの頭で、いま効いているモデル・effort・許可モードを見届けたことにする（本物の `init` とフック入力を疑似する）。
  const confirmSettings = (): void => {
    options.onEvent({ kind: "setting-confirmed", setting: "model", value: model })
    options.onEvent({ kind: "setting-confirmed", setting: "effort", value: effort })
    options.onEvent({ kind: "setting-confirmed", setting: "permissionMode", value: permissionMode })
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

  // `firstViewer` は resolve だけで reject しない（`Promise.withResolvers` の resolve のみ呼ばれる）。
  options.firstViewer.then(
    () => {
      if (closed) {
        return
      }
      play(startupSteps(options.session, options.scene, options.sceneUntil), 0)
    },
    () => {},
  )
  const namedIndex = options.session.turns.findIndex((scene) => scene.name === options.scene)
  let playedTurns = namedIndex + 1

  /** 次の場面を流す（依頼でも、記録に残さない依頼でも同じ）。 */
  const playNextTurn = (): void => {
    const turns = options.session.turns
    const scene = turns.length === 0 ? undefined : turns[playedTurns % turns.length]
    playedTurns += 1
    confirmSettings()
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
    // 本物は SDK の実験中の口に問い合わせる。fake driver は claude を起こさないので、固定のプラン使用量を返す。
    readPlanUsage: () => Promise.resolve({ kind: "ready", usage: FAKE_PLAN_USAGE }),
    // 本物は transcript を読む。fake driver は疑似セッションに書いた架空の中身を返す。
    readSessionDigest: (sessionId) =>
      Promise.resolve(options.session.sessionDigests[sessionId] ?? UNAVAILABLE_SESSION_DIGEST),
    setModel: (next) => {
      // 名前が無い切り替えは覚えない（本物も `undefined` のときは何も知らせない）。
      if (next !== undefined) {
        model = next
      }
      emit({ kind: "session-info", ...sessionInfo(), ...names })
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
      emit({ kind: "session-info", ...sessionInfo(), ...names })
      options.onEvent({ kind: "permission-mode-changed", mode })
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
    skillNames: [],
    agentNames: [],
  }
}

type SessionInfoNames = Pick<
  Extract<SessionEvent, { kind: "session-info" }>,
  "skillNames" | "agentNames"
>
