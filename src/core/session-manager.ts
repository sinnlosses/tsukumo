// セッションを持つ係。**駆動から届いたイベントに時刻を打ち、サーバ側でも同じ畳み込みを回し、
// まとめてフレームで配る**（docs/design.md 5章）。
//
// - 状態をサーバ側でも持つのは、接続してきたブラウザへ `hello` の snapshot を返すため
// - コマンドの分岐（`switch (command.type)`）は**ここが唯一**。旧の POST 6本ぶんの判断が1つになる
// - **いまはセッションが1つだけ**。鍵（`sessionId`）を持たせてあるのは複数化（docs/design.md 8章）のため
//
// 会話の内容がイベントとして通るが、**ログにもファイルにも書かない**
// （docs/coding-standards.md「会話内容の扱い」）。配る先は購読しているブラウザだけ。

import { type ClientCommand } from "../protocol/command.ts"
import { FRAME_ERROR_REASON, PROTOCOL_VERSION, type ServerFrame } from "../protocol/frame.ts"
import { type SessionEvent, type StampedEvent } from "../protocol/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../protocol/session-state.ts"
import { type SessionDriver } from "./session-driver.ts"

/**
 * イベントをまとめて配る間隔。**旧の `PUBLISH_INTERVAL_MS` と同じ 100ms**（2026-09-13 決定）。
 * 書きかけの本文はトークン単位で届くので、1件ずつ押すと転送量が跳ねる。
 */
export const EVENT_BATCH_INTERVAL_MS = 100

export type SessionManagerOptions = {
  /** 現在時刻を返す関数（呼び出し側が `Date.now` を渡す。テストは偽の時計を渡す）。 */
  readonly now: () => number
  /** イベントをまとめる間隔（ミリ秒）。既定は {@link EVENT_BATCH_INTERVAL_MS}。 */
  readonly batchIntervalMs: number
}

export type SessionCreateOptions = {
  readonly sessionId: string
  /**
   * 駆動を起こす。**渡された `onEvent` を駆動に配線する**のは呼び出し側の仕事で、
   * ここは種類（SDK か偽の駆動か）を知らない。
   */
  readonly startDriver: (onEvent: (event: SessionEvent) => void) => SessionDriver
}

/** コマンドを受け付けられたか。理由は定型文（`FRAME_ERROR_REASON`）だけを返す。 */
export type DispatchResult = { readonly ok: true } | { readonly ok: false; readonly reason: string }

export type SessionManager = {
  /** セッションを1つ起こす。同じ `sessionId` で二度呼ばない（呼んでも前のものを閉じない）。 */
  readonly create: (options: SessionCreateOptions) => void
  /** コマンドを駆動へ渡す。**分岐はここだけ**。 */
  readonly dispatch: (sessionId: string, command: ClientCommand) => Promise<DispatchResult>
  /** 接続を購読に加える。**まず `hello` を1つ送ってから**加え、外すための関数を返す。 */
  readonly subscribe: (sessionId: string, send: (frame: ServerFrame) => void) => () => void
  /** 全セッションを閉じる（プロセスを終えるとき）。 */
  readonly close: () => void
}

export function createSessionManager(options: SessionManagerOptions): SessionManager {
  const sessions = new Map<string, SessionHost>()

  return {
    create: (created) => {
      sessions.set(created.sessionId, createSessionHost(created, options))
    },
    dispatch: (sessionId, command) => {
      const host = sessions.get(sessionId)
      return host === undefined
        ? Promise.resolve({ ok: false, reason: FRAME_ERROR_REASON.noSession })
        : host.dispatch(command)
    },
    subscribe: (sessionId, send) => {
      const host = sessions.get(sessionId)
      return host === undefined ? () => {} : host.subscribe(send)
    },
    close: () => {
      for (const host of sessions.values()) {
        host.close()
      }
      sessions.clear()
    },
  }
}

/** セッション1つぶんの持ち物（docs/design.md 5章の `SessionHost`）。 */
type SessionHost = {
  readonly dispatch: (command: ClientCommand) => Promise<DispatchResult>
  readonly subscribe: (send: (frame: ServerFrame) => void) => () => void
  readonly close: () => void
}

function createSessionHost(
  created: SessionCreateOptions,
  options: SessionManagerOptions,
): SessionHost {
  const subscribers = new Set<(frame: ServerFrame) => void>()
  let state: SessionState = INITIAL_SESSION_STATE
  let buffered: readonly StampedEvent[] = []
  let flushTimer: ReturnType<typeof setTimeout> | undefined = undefined
  // 閉じたあとに駆動が投げてくるイベントは捨てる（配る先がもう無いのにタイマーを立てない）。
  let closed = false

  const flush = (): void => {
    flushTimer = undefined
    if (buffered.length === 0) {
      return
    }
    const events = joinPartialUtterances(buffered)
    buffered = []
    publish({ type: "events", events }, subscribers)
  }

  const driver = created.startDriver((event) => {
    if (closed) {
      return
    }
    const at = options.now()
    state = applySessionEvent(state, event, at)
    buffered = [...buffered, { at, event }]
    if (flushTimer === undefined) {
      flushTimer = setTimeout(flush, options.batchIntervalMs)
    }
  })

  return {
    dispatch: (command) => dispatchToDriver(driver, command),
    subscribe: (send) => {
      send({
        type: "hello",
        protocolVersion: PROTOCOL_VERSION,
        sessionId: created.sessionId,
        state,
      })
      subscribers.add(send)
      return () => {
        subscribers.delete(send)
      }
    },
    close: () => {
      closed = true
      if (flushTimer !== undefined) {
        clearTimeout(flushTimer)
        flushTimer = undefined
      }
      subscribers.clear()
      driver.close()
    },
  }
}

/**
 * コマンド1件を駆動へ渡す。**受け付けられたかどうかだけを返し、結果はイベントで戻ってくる**
 * （ブラウザはローカルで echo しない。docs/design.md 3章「依頼」）。
 *
 * 駆動が例外を投げても常駐プロセスは落とさず、定型文の理由を返す
 * （docs/coding-standards.md「エラーハンドリング」）。
 */
async function dispatchToDriver(
  driver: SessionDriver,
  command: ClientCommand,
): Promise<DispatchResult> {
  try {
    switch (command.type) {
      case "prompt":
        driver.prompt(command.text)
        return { ok: true }
      case "interrupt":
        await driver.interrupt()
        return { ok: true }
      case "answer":
        return driver.answer(command.id, command.answer)
          ? { ok: true }
          : { ok: false, reason: FRAME_ERROR_REASON.unresolvedAnswer }
      case "set-model":
        await driver.setModel(command.model)
        return { ok: true }
      case "set-permission-mode":
        await driver.setPermissionMode(command.mode)
        return { ok: true }
    }
  } catch {
    return { ok: false, reason: FRAME_ERROR_REASON.driverFailed }
  }
}

/**
 * 1バッチの中で**連続する書きかけの本文（`partial-utterance`）を1件に連結する**
 * （docs/design.md 3章「依頼」。畳み込みの結果は同じで、転送量だけが減る）。
 * 時刻は連なりの最後の1件のもの（届いた時点に合わせる）。
 */
function joinPartialUtterances(events: readonly StampedEvent[]): readonly StampedEvent[] {
  return events.reduce<readonly StampedEvent[]>((joined, stamped) => {
    const previous = joined[joined.length - 1]
    if (
      previous === undefined ||
      previous.event.kind !== "partial-utterance" ||
      stamped.event.kind !== "partial-utterance"
    ) {
      return [...joined, stamped]
    }

    return [
      ...joined.slice(0, -1),
      {
        at: stamped.at,
        event: { kind: "partial-utterance", text: previous.event.text + stamped.event.text },
      },
    ]
  }, [])
}

/** 購読者全員に配る。閉じかけている接続を無視するのは送る側（src/core/server.ts）の仕事。 */
function publish(frame: ServerFrame, subscribers: ReadonlySet<(frame: ServerFrame) => void>): void {
  for (const send of subscribers) {
    send(frame)
  }
}
