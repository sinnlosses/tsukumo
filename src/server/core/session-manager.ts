// セッションを持つ係。**駆動から届いたイベントに時刻を打ち、サーバ側でも同じ畳み込みを回し、
// まとめてフレームで配る**（docs/design.md 5章）。
//
// - 状態をサーバ側でも持つのは、接続してきたブラウザへ `hello` の snapshot を返すため
// - コマンドの分岐（`switch (command.type)`）は**ここが唯一**。旧の POST 6本ぶんの判断が1つになる
//   （`switch-character` は駆動へ渡すのではなく起こし直しとして、キャラクターへの書き込み
//   （`set-portrait` / `clear-portrait` / `set-outfit-accent` / `create-character`）は
//   **書き込みと `character-changed` の流し直し**として、どちらも手前で捌く）
// - **いまはセッションが1つだけ**。鍵（`sessionId`）を持たせてあるのは複数化（docs/design.md 8章）のため
//
// 会話の内容がイベントとして通るが、**ログにもファイルにも書かない**
// （docs/coding-standards.md「会話内容の扱い」）。配る先は購読しているブラウザだけ。

import {
  type CharacterCreateCommand,
  type CharacterEditCommand,
  type ClientCommand,
  type DriverCommand,
  isCharacterEditCommand,
} from "../../shared/command.ts"
import { FRAME_ERROR_REASON, PROTOCOL_VERSION, type ServerFrame } from "../../shared/frame.ts"
import { type SessionEvent, type StampedEvent } from "../../shared/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../shared/session-state.ts"
import { type SessionDriver } from "./session-driver.ts"
import { type SessionLaunchRequest } from "./session-launch.ts"

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
   *
   * `request.character` は起こすキャラクターパックの名前で、**最初の1回は undefined**
   * （呼び出し側の既定にまかせる）。`switch-character` で起こし直すときだけ名前が入る
   * （docs/design.md 7章）。知らない名前のときに何を起こすかも呼び出し側が決める。
   * `request.chat` は雑談モードで起こすか（`docs/requirements.md` 4.9）。
   *
   * **待てる形（Promise）で返す**のは、そのパックの続きから始めるセッションを探すのに
   * 外の世界（claude 自身の transcript の一覧）を読むから（docs/requirements.md 4.8）。
   */
  readonly startDriver: (
    onEvent: (event: SessionEvent) => void,
    request: SessionLaunchRequest,
  ) => Promise<SessionDriver>
  /**
   * いま出しているキャラクターパックの立ち絵・差し色を変え、**画面へ流す
   * `character-changed` イベントを返す**（書き込み先と受け付けない条件は
   * `src/server/adapter/character-edit.ts`）。**受け付けられなかったときは undefined**
   * （呼び出し側は定型文の `error` を返す）。
   *
   * セッションは起こし直さない（会話も履歴も消えない）。**`speak` が受け付ける表情の一覧は
   * 起こしたときのままなので、立ち絵を足した表情をキャラクター自身が選べるのは次の起動から。**
   */
  readonly editCharacter: (edit: CharacterEditCommand) => Promise<SessionEvent | undefined>
  /**
   * 新しいキャラクターパックを作り、**選択肢の増えた `character-changed` イベントを返す**
   * （書き込み先と受け付けない条件は `src/server/adapter/character-edit.ts`）。作れなかったときは
   * undefined（呼び出し側は定型文の `error` を返す）。
   *
   * **作ったパックへ切り替えはしない**（一覧に足すだけ。切り替えは駆動の起こし直しで画面が
   * 初期化されるので、作る操作の副作用にしない。`docs/design.md` 7.1）。
   */
  readonly createCharacter: (create: CharacterCreateCommand) => Promise<SessionEvent | undefined>
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
  // 何代目の駆動か。**閉じた駆動があとから投げてくるイベントを捨てる**ための印
  // （`switch-character` で起こし直したとき、前の駆動の最後のイベントが新しい状態に混ざらない）。
  let generation = 0
  // 起き上がったあとの駆動。**閉じるのを待たない**ために値でも持つ（プロセスの終了は
  // `process.exit` ですぐ進むので、待っていると claude の子プロセスが閉じられずに残る）。
  let live: SessionDriver | undefined = undefined

  const cancelFlush = (): void => {
    if (flushTimer !== undefined) {
      clearTimeout(flushTimer)
      flushTimer = undefined
    }
  }

  const flush = (): void => {
    flushTimer = undefined
    if (buffered.length === 0) {
      return
    }
    const events = joinPartialUtterances(buffered)
    buffered = []
    publish({ type: "events", events }, subscribers)
  }

  const helloFrame = (): ServerFrame => ({
    type: "hello",
    protocolVersion: PROTOCOL_VERSION,
    sessionId: created.sessionId,
    state,
  })

  /**
   * イベント1件を畳んで次のバッチに積む。**駆動から届いたものと、見た目の編集で起こした
   * `character-changed` の両方がここを通る**（サーバ側の状態とブラウザへ配る内容を1本にする）。
   */
  const receive = (event: SessionEvent): void => {
    if (closed) {
      return
    }
    const at = options.now()
    state = applySessionEvent(state, event, at)
    buffered = [...buffered, { at, event }]
    if (flushTimer === undefined) {
      flushTimer = setTimeout(flush, options.batchIntervalMs)
    }
  }

  const start = (request: SessionLaunchRequest): Promise<SessionDriver> => {
    const born = generation
    const starting = created.startDriver((event) => {
      if (born !== generation) {
        return
      }
      receive(event)
    }, request)

    void starting.then(
      (started) => {
        // 起き上がる前に閉じた・起こし直したときは、その場で閉じる（駆動を取り残さない）。
        if (closed || born !== generation) {
          started.close()
          return
        }
        live = started
      },
      () => {
        // 起こせなかったことは、待っている側（restart / dispatchToDriver）が拾う。
      },
    )
    return starting
  }

  let driver = start({ character: undefined, chat: undefined })

  /**
   * 駆動を起こし直す（docs/design.md 7章。**そのパックのセッションの
   * 続きから始まる** — 会話が繋がるかどうかは、起こす側が `resume` に何を渡すかで決まる）。
   * **契機は2つ**: 別のキャラクターパックに切り替えたとき（`switch-character`）と、
   * 雑談モードを切り替えたとき（`set-chat-mode`。`systemPrompt` を差し替えるため。
   * `docs/requirements.md` 4.9）。
   * **画面は初期状態に戻す** — 吹き出し・立ち絵・メインビューの3つを消して、新しい `hello` を
   * 配り直す。起こし直しの間に届いたイベント（新しい `character-changed`・組み直した履歴など）は
   * その `hello` の状態に入っているので、二重に配らない。
   *
   * 起こし直しに失敗しても**常駐プロセスは落とさない**（`dispatchToDriver` と同じ扱いで、
   * 定型文の理由を返すだけ。docs/coding-standards.md「エラーハンドリング」）。
   */
  const restart = async (request: SessionLaunchRequest): Promise<DispatchResult> => {
    try {
      live?.close()
      live = undefined
      generation += 1
      cancelFlush()
      state = INITIAL_SESSION_STATE
      buffered = []
      driver = start(request)
      await driver
      cancelFlush()
      buffered = []
      publish(helloFrame(), subscribers)
      return { ok: true }
    } catch {
      return { ok: false, reason: FRAME_ERROR_REASON.driverFailed }
    }
  }

  /**
   * キャラクターへの書き込み1件（立ち絵・差し色を変える、新しいパックを作る）。**書き込みは
   * 呼び出し側（配線層）に任せ**、戻ってきたイベントをここで畳んで配る（`hello` は配り直さない
   * — 状態はイベント1つで足りる）。受け付けられなかったときは定型文の理由を返すだけで、
   * 常駐プロセスは落とさない。
   */
  const write = async (
    apply: () => Promise<SessionEvent | undefined>,
    reason: string,
  ): Promise<DispatchResult> => {
    try {
      const event = await apply()
      if (event === undefined) {
        return { ok: false, reason }
      }
      receive(event)
      return { ok: true }
    } catch {
      return { ok: false, reason }
    }
  }

  return {
    dispatch: (command) => {
      if (command.type === "switch-character") {
        // 画面の `<select>` は進行中に無効化するが、ここでも同じ条件で弾く
        // （画面を経ない依頼・無効化の描画が間に合わなかったときの取りこぼし対策）。
        if (state.turnInProgress) {
          return Promise.resolve({ ok: false, reason: FRAME_ERROR_REASON.switchDuringTurn })
        }
        // **雑談かどうかは切り替えをまたいで保つ**（パックを変えただけで仕事へ戻らない）。
        return restart({ character: command.name, chat: state.chatMode })
      }
      if (command.type === "set-chat-mode") {
        // 起こし直しなので `switch-character` と同じ条件で弾く。
        if (state.turnInProgress) {
          return Promise.resolve({ ok: false, reason: FRAME_ERROR_REASON.switchDuringTurn })
        }
        // **いま出しているパックのまま**起こし直す（雑談に入るとキャラクターが変わる、
        // とは決めていない）。
        return restart({ character: state.character?.pack, chat: command.chat })
      }
      if (command.type === "create-character") {
        return write(
          () => created.createCharacter(command),
          FRAME_ERROR_REASON.characterCreateFailed,
        )
      }
      if (isCharacterEditCommand(command)) {
        return write(() => created.editCharacter(command), FRAME_ERROR_REASON.characterEditFailed)
      }
      return dispatchToDriver(driver, command)
    },
    subscribe: (send) => {
      send(helloFrame())
      subscribers.add(send)
      return () => {
        subscribers.delete(send)
      }
    },
    close: () => {
      closed = true
      cancelFlush()
      subscribers.clear()
      live?.close()
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
  driver: Promise<SessionDriver>,
  command: DriverCommand,
): Promise<DispatchResult> {
  try {
    const started = await driver
    switch (command.type) {
      case "prompt":
        started.prompt(command.text, command.images)
        return { ok: true }
      case "interrupt":
        await started.interrupt()
        return { ok: true }
      case "answer":
        return started.answer(command.id, command.answer)
          ? { ok: true }
          : { ok: false, reason: FRAME_ERROR_REASON.unresolvedAnswer }
      case "set-model":
        await started.setModel(command.model)
        return { ok: true }
      case "set-permission-mode":
        await started.setPermissionMode(command.mode)
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

/** 購読者全員に配る。閉じかけている接続を無視するのは送る側（src/server/adapter/session-socket.ts）の仕事。 */
function publish(frame: ServerFrame, subscribers: ReadonlySet<(frame: ServerFrame) => void>): void {
  for (const send of subscribers) {
    send(frame)
  }
}
