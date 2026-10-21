import { describe, expect, it } from "vitest"

import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session/session-state.ts"
import { apply, runningSession } from "../../fixture/session-state.ts"

describe("applySessionEvent", () => {
  it("知らない許可モードの init は unknown のまま running に運ぶ", () => {
    const view = apply({
      kind: "session-info",
      sessionId: "s-1",
      model: undefined,
      permissionMode: { kind: "unknown", raw: "dontAsk" },
      slashCommands: [],
      terminalSlashCommands: [],
      skillNames: [],
      agentNames: [],
    })

    expect(runningSession(view).permissionMode).toEqual({ kind: "unknown", raw: "dontAsk" })
  })

  it("init のたびにセッション情報を上書きする（端末専用コマンドは候補から除く）", () => {
    const view = apply(
      {
        kind: "session-info",
        sessionId: "s-1",
        model: "claude-opus-5",
        permissionMode: "auto",
        slashCommands: ["clear"],
        terminalSlashCommands: [],
        skillNames: [],
        agentNames: [],
      },
      {
        kind: "session-info",
        sessionId: "s-1",
        model: "claude-opus-5",
        permissionMode: "default",
        slashCommands: ["clear", "model", "doctor"],
        terminalSlashCommands: ["doctor"],
        skillNames: [],
        agentNames: [],
      },
    )

    expect(runningSession(view).permissionMode).toBe("default")
    expect(view.slashCommands).toEqual(["clear", "model"])
  })

  it("init のたびにスキルとエージェントの名前を上書きする", () => {
    const view = apply(
      {
        kind: "session-info",
        sessionId: "s-1",
        model: undefined,
        permissionMode: undefined,
        slashCommands: [],
        terminalSlashCommands: [],
        skillNames: ["fable-review", "tsukumo-workflow:next-task"],
        agentNames: ["fable-acceptor"],
      },
      {
        kind: "session-info",
        sessionId: "s-1",
        model: undefined,
        permissionMode: undefined,
        slashCommands: [],
        terminalSlashCommands: [],
        skillNames: ["tsukumo-workflow:next-task"],
        agentNames: ["tsukumo-workflow:acceptor"],
      },
    )

    expect(view.skillNames).toEqual(["tsukumo-workflow:next-task"])
    expect(view.agentNames).toEqual(["tsukumo-workflow:acceptor"])
  })

  it("model-changed は知っている別名（MODEL_ALIASES）のときだけ先回りでモデルを更新する", () => {
    const view = apply(
      {
        kind: "session-info",
        sessionId: "s-1",
        model: "claude-sonnet-5",
        permissionMode: "auto",
        slashCommands: [],
        terminalSlashCommands: [],
        skillNames: [],
        agentNames: [],
      },
      { kind: "model-changed", model: "haiku" },
    )

    expect(view.model).toBe("haiku")
  })

  it("model-changed が知らない値（MODEL_ALIASES に無い）のときは state.model を変えない", () => {
    const view = apply(
      {
        kind: "session-info",
        sessionId: "s-1",
        model: "claude-sonnet-5",
        permissionMode: "auto",
        slashCommands: [],
        terminalSlashCommands: [],
        skillNames: [],
        agentNames: [],
      },
      { kind: "model-changed", model: "best" },
    )

    expect(view.model).toBe("claude-sonnet-5")
  })

  // 実機で確かめた回帰: 1件も依頼を送っていない（`init` がまだ届いていない）うちにサイドバーで
  // モデルを切り替えると、駆動は切り替わっているのに表示だけ5秒ほどで古い値に戻っていた
  // （`model-changed` を `session.kind === "running"` のときだけ効かせていたときの不具合）。
  // `model` は `session` の外にあるので、`starting`/`identified` の間でも更新できる。
  it("model-changed は init より前（session が starting）でも効く", () => {
    expect(INITIAL_SESSION_STATE.session.kind).toBe("starting")

    const view = apply({ kind: "model-changed", model: "sonnet" })

    expect(view.session.kind).toBe("starting")
    expect(view.model).toBe("sonnet")
  })

  it("model-effort-support はモデルごとの effort の対応をそのまま置き換える", () => {
    expect(INITIAL_SESSION_STATE.modelEffortSupport).toEqual([])

    const view = apply({
      kind: "model-effort-support",
      models: [
        { model: "opus", supportsEffort: true, effortLevels: ["low", "medium", "high"] },
        { model: "haiku", supportsEffort: false, effortLevels: [] },
      ],
    })

    expect(view.modelEffortSupport).toEqual([
      { model: "opus", supportsEffort: true, effortLevels: ["low", "medium", "high"] },
      { model: "haiku", supportsEffort: false, effortLevels: [] },
    ])
  })

  it("effort-changed は読み取った effort をそのまま置き換える。届くまでは undefined", () => {
    expect(INITIAL_SESSION_STATE.effort).toBeUndefined()

    const view = apply(
      { kind: "effort-changed", effort: "low" },
      { kind: "effort-changed", effort: "high" },
    )

    expect(view.effort).toBe("high")
  })

  it("plan が届くまでは undefined、届いたらそのまま持つ（docs/glossary.md「プラン」）", () => {
    expect(INITIAL_SESSION_STATE.plan).toBeUndefined()

    const view = apply({ kind: "plan", plan: "max" })

    expect(view.plan).toBe("max")
  })

  // 回帰: `permissionMode` がまだ届かず `identified` のままでも、`model-changed` は
  // `model` だけを更新できる（`session` はそのまま）。実機で確かめたサイドバーのモデル切り替えが
  // 戻ってしまう不具合はこれが効いていなかったために起きた。
  it("model-changed は identified（permissionMode がまだ）でも model を更新し、session は動かさない", () => {
    const identified = apply({
      kind: "session-info",
      sessionId: "s-架空-identified",
      model: undefined,
      permissionMode: undefined,
      slashCommands: [],
      terminalSlashCommands: [],
      skillNames: [],
      agentNames: [],
    })
    expect(identified.session.kind).toBe("identified")

    const after = applySessionEvent(identified, { kind: "model-changed", model: "haiku" }, 0)

    expect(after.session).toEqual(identified.session)
    expect(after.model).toBe("haiku")
  })
})
