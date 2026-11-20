import { ORPCError } from "@orpc/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { useSession } from "../../../src/browser/stores/session.ts"
import { FRAME_ERROR_REASON } from "../../../src/shared/frame-error-reason.ts"
import { PROTOCOL_VERSION, type ServerFrame } from "../../../src/shared/frame.ts"
import {
  BUILTIN_GEAR_PREFERENCES,
  type GearPreferences,
} from "../../../src/shared/session/gear-preference.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session/session-state.ts"

afterEach(() => {
  useSession.getState().attachSocket(undefined)
})

describe("dispatchAwaited", () => {
  function attach(call: () => Promise<unknown>): void {
    useSession.getState().attachSocket({ commandLink: { call } })
  }

  it("成功は ok と手続きの戻り値で返る", async () => {
    attach(() => Promise.resolve({ ok: true }))

    const result = await useSession
      .getState()
      .dispatchAwaited((client) => client.session.switchSession({ sessionId: "架空" }))

    expect(result.kind).toBe("ok")
  })

  it("契約の REFUSED は invalid と理由で返り、投げない", async () => {
    attach(() =>
      Promise.reject(
        new ORPCError("REFUSED", { data: { reason: FRAME_ERROR_REASON.sessionOccupied } }),
      ),
    )

    const result = await useSession
      .getState()
      .dispatchAwaited((client) => client.session.switchSession({ sessionId: "架空" }))

    expect(result).toEqual({ kind: "invalid", reason: FRAME_ERROR_REASON.sessionOccupied })
  })

  it("繋がっていないときは failed で返り、投げない", async () => {
    const result = await useSession
      .getState()
      .dispatchAwaited((client) => client.session.switchSession({ sessionId: "架空" }))

    expect(result).toEqual({ kind: "failed" })
  })
})

describe("lastSentAt", () => {
  beforeEach(() => {
    useSession.setState({ lastSentAt: undefined })
  })

  function attach(): void {
    useSession.getState().attachSocket({ commandLink: { call: () => Promise.resolve({}) } })
  }

  it("dispatch で依頼・答えを送ると入る", () => {
    attach()
    const { dispatch } = useSession.getState()

    void dispatch.session.prompt({ text: "架空", images: [] })
    const afterPrompt = useSession.getState().lastSentAt
    useSession.setState({ lastSentAt: undefined })
    void dispatch.session.answer({ id: "ask-1", answer: { kind: "allow" } })

    expect(afterPrompt).toBeTypeOf("number")
    expect(useSession.getState().lastSentAt).toBeTypeOf("number")
  })

  it("dispatchAwaited で依頼を送ると入る", async () => {
    attach()

    await useSession
      .getState()
      .dispatchAwaited((client) => client.session.prompt({ text: "架空", images: [] }))

    expect(useSession.getState().lastSentAt).toBeTypeOf("number")
  })

  it("ほかの手続きでは入らない", () => {
    attach()

    void useSession.getState().dispatch.session.startNewSession()

    expect(useSession.getState().lastSentAt).toBeUndefined()
  })

  it("接続が無いときは入らない", () => {
    void useSession.getState().dispatch.session.prompt({ text: "架空", images: [] })

    expect(useSession.getState().lastSentAt).toBeUndefined()
  })
})

describe("歯車の設定", () => {
  beforeEach(() => {
    useSession.setState(useSession.getInitialState(), true)
  })

  const hello = (gearPreferences: GearPreferences): ServerFrame => ({
    type: "hello",
    protocolVersion: PROTOCOL_VERSION,
    state: { ...INITIAL_SESSION_STATE, gearPreferences },
  })

  it("hello の値（起こしたときに読んだ値）では入れ替えず、開いたあとに届いた変更で入れ替える", () => {
    const { receive } = useSession.getState()

    receive(hello({ ...BUILTIN_GEAR_PREFERENCES, revealSpeed: "off" }))
    expect(useSession.getState().state.gearPreferences).toBeUndefined()

    receive({
      type: "events",
      events: [
        {
          at: 0,
          event: {
            kind: "gear-preferences-changed",
            gearPreferences: { ...BUILTIN_GEAR_PREFERENCES, revealSpeed: "fast" },
          },
        },
      ],
    })
    receive(hello({ ...BUILTIN_GEAR_PREFERENCES, revealSpeed: "off" }))

    expect(useSession.getState().state.gearPreferences?.revealSpeed).toBe("fast")
  })
})
