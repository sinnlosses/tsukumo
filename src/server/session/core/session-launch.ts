// セッションを起こす一続き。
// パックを決めて続きのセッションを探し、駆動を起こし、復元した履歴と `character-changed` を流すまでの順序を持つ。
// 起動時も起こし直しも、この1つを通る。
//
// 画面を初期状態に戻すかどうかは持たない（起こし直しだけの判断なので、起こし直す側が持つ）。ここは「どちらから来ても同じ順序」だけ。
//
// 外の世界（パックの読み込み・覚えた値・claude の transcript）には触らず、すべて渡された関数（`SessionLaunchPorts`）越しに頼む。

import { swallowedFailureFootprint } from "../../../shared/diagnostic/swallowed-failure.ts"
import type { SessionChoice } from "../../../shared/session/session-choice.ts"
import type { SessionDefault } from "../../../shared/session/session-default.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type {
  CharacterSelection,
  NamedCharacterPack,
} from "../../character-pack/core/character-selection.ts"
import type { DiagnosticLog } from "../../diagnostic/core/diagnostic.ts"
import type { SessionCatalogRefresh } from "../../session-driver/core/session-catalog.ts"
import type { SessionDriver, SessionStart } from "../../session-driver/core/session-driver.ts"

/** これから起こす駆動の種。 */
export type SessionLaunchSeed<Pack extends NamedCharacterPack> = {
  readonly pack: Pack
  readonly start: SessionStart
  /**
   * 雑談モードで起こすか。
   * `systemPrompt` はセッションを起こすときに固定されるので、レポートの記法を外すにはここで決まっている必要がある。
   */
  readonly chat: boolean
  /**
   * このセッションを起こす既定（モデル・effort・許可モード）。
   * 読むのは起こすたびに1回（{@link SessionLaunchPorts.readSessionDefault}）で、同じ値が画面へ流す `session-default-changed` にも渡る（画面に出る既定と、実際に起こした既定がずれない）。
   */
  readonly sessionDefault: SessionDefault
}

/**
 * 起こす（起こし直す）ときの指定。
 * パックの決め方（{@link CharacterSelection}）が、そのまま「覚えるかどうか」も分ける。覚えるのは `name` のときだけ。
 */
export type SessionLaunchRequest = {
  /** これから起こすパックの決め方。 */
  readonly selection: CharacterSelection
  /** 雑談モードで起こすか。undefined なら仕事（既定）。 */
  readonly chat: boolean | undefined
  /** これから起こすセッションの決め方。 */
  readonly resume: SessionResume
}

/** これから起こすセッションの決め方。 */
export type SessionResume =
  /** 印から最新の1つを探す。 */
  | { readonly by: "latest" }
  /**
   * 画面から選ばれたセッション。探さずに、一覧に出したIDをそのまま続きにする。
   * claude 側が知らないIDだったときは新規のセッションとして起き上がる。
   */
  | { readonly by: "id"; readonly sessionId: string }
  /** 探さずに新規で起こす。 */
  | { readonly by: "new" }

/** 一続きの中で外の世界に頼むこと。 */
export type SessionLaunchPorts<Pack extends NamedCharacterPack> = {
  /**
   * これから起こすパックを決める。ここは選び方をそのまま渡すだけ。
   * 知らない名前が既定へ落ちるのも呼ばれた側（`selectCharacterPack`）の仕事。
   */
  readonly choosePack: (selection: CharacterSelection) => Pack
  /** 画面から選んだパックを覚える（次の起動の初期値になる）。 */
  readonly rememberPack: (pack: Pack) => void
  /**
   * 覚えた「新しいセッションの既定」を読む。
   * 覚えた値が無い・読めないときは同梱の既定へ畳んだあとの値が返るので、ここから先に「無い」は出ない。
   */
  readonly readSessionDefault: () => SessionDefault
  /**
   * 覚えた「訪問」のオン・オフを読む。読むのは起こすたびに1回。
   * `visit.setEnabled` はいま動いているセッションにも即座に効くので、ここで読むのは「起こした直後の初期値」だけ。
   * 駆動の種（`SessionLaunchSeed`）には渡さない（訪問は SDK ではなくサーバの状態が読むだけの値のため）。
   */
  readonly readVisitEnabled: () => boolean
  /** いま出しているパックを画面へ流す形（立ち絵の URL・選択肢・画面から変えられるか）。 */
  readonly characterEvent: (pack: Pack) => SessionEvent
  /**
   * そのパックの雑談の要約の写しから、最近の話題の見出しを読む（写しがまだ無い・取り出せないときは空）。
   * 雑談で起こすときだけ呼ばれる。
   */
  readonly readChatTopics: (pack: Pack) => readonly string[]
  /**
   * そのパックの「覚えたこと」（`persona.md` の `## 覚えたこと`）の一覧を読む（節が無い・読めないときは空）。
   * 雑談で起こすときだけ呼ばれる。
   */
  readonly readRememberedLines: (pack: Pack) => readonly string[]
  /**
   * そのパックの、そのモードの続きから始めるセッションを探す（見つからなければ `{ kind: "new" }`）。
   * 雑談と仕事は別のセッションなので、引く印も分かれる。
   */
  readonly findResumeSession: (pack: Pack, chat: boolean) => Promise<SessionStart>
  /**
   * 駆動を1つ起こす（本物か偽物かはここが選ぶ）。
   * `restored` は、その代で組み直して流し終えた履歴で解ける（新規で起こした・読めなかったときは空）。
   */
  readonly startDriver: (
    seed: SessionLaunchSeed<Pack>,
    onEvent: (event: SessionEvent) => void,
    restored: Promise<readonly SessionEvent[]>,
  ) => SessionDriver
  /**
   * いま切り替え先として選べるセッションを一覧にする（同じパックの、同じモードのものだけ）。読めなかったときは空。
   * メモリに持っている一覧から出す（transcript の一覧は読まない）。
   */
  readonly listSessions: (pack: Pack, chat: boolean) => Promise<readonly SessionChoice[]>
  /**
   * メモリに持っている一覧を transcript の一覧から読み直す（`SessionCatalog.refresh`）。例外を投げない。
   * 駆動を返したあとで終わるので、起こし直しの `hello` を待たせない。
   */
  readonly refreshSessions: () => Promise<SessionCatalogRefresh>
  /** 前のセッションの記録を、画面に出す形のイベントに組み直す。 */
  readonly restoreEvents: (sessionId: string, pack: Pack) => Promise<readonly SessionEvent[]>
  /** 診断ログの書き込み口。{@link restoreEvents} が失敗したときだけ使う。 */
  readonly diagnosticLog: DiagnosticLog
  /** いまのエポックミリ秒（診断ログに打つ時刻）。 */
  readonly now: () => number
}

/**
 * セッションを起こす関数を作る。
 *
 * 順序は起動時も起こし直しも同じ:
 * パックを決める → 画面から名前が届いたときだけ覚える → `character-changed`・`chat-mode-changed`・
 * （雑談のときだけ `chat-topics-changed` と `remembered-lines-changed`）・
 * `session-default-changed`・`visit-enabled-changed` を流す →
 * 続きのセッションを決める → 切り替え先の一覧を流す → 駆動を起こす →
 * 続きから始まったなら履歴を組み直して流し終える → 一覧の読み直しを始める → 駆動を返す。
 * 読み直した一覧を採ったときだけ、切り替え先の一覧をもう一度流す。
 *
 * 受け口は2つ。`onEvent` は駆動から新しく届くイベント、`onRestoredEvents` は前のセッションの記録を組み直した再生だけを、まとめて1回で渡す。
 * 分けるのは「どちらの口から来たか」を呼び出し側が知れるようにするためだけ。
 */
export function createSessionLaunch<Pack extends NamedCharacterPack>(
  ports: SessionLaunchPorts<Pack>,
): (
  onEvent: (event: SessionEvent) => void,
  onRestoredEvents: (events: readonly SessionEvent[]) => void,
  request: SessionLaunchRequest,
) => Promise<SessionDriver> {
  return async (onEvent, onRestoredEvents, request) => {
    const { selection } = request
    const chat = request.chat ?? false
    const pack = ports.choosePack(selection)
    // 覚えるのは画面から名前が届いたときだけ。
    // 起動時やモードの切り替えでも覚えると、その回だけの指定（`TSUKUMO_CHARACTER`）や同梱の既定が次の起動の初期値として残ってしまう。
    if (selection.by === "name") {
      ports.rememberPack(pack)
    }
    onEvent(ports.characterEvent(pack))
    // 起こし直すと状態が初期値へ戻るので、雑談かどうかもここで流し直す（画面は `chat-mode-changed` でしか知れない）。
    onEvent({ kind: "chat-mode-changed", chat })
    // 最近の話題も同じ理由で流し直す。
    // 仕事のときは写しを読まない（起こし直しで状態が初期値の空へ戻っているので、流さなくても空のまま）。
    if (chat) {
      onEvent({ kind: "chat-topics-changed", topics: ports.readChatTopics(pack) })
      // 「覚えていること」も同じ理由で流し直す。
      // 仕事のときは読まない（仕事では雑談のサイドバーごと出ないので、状態が初期値の空のままでよい）。
      onEvent({ kind: "remembered-lines-changed", lines: ports.readRememberedLines(pack) })
    }
    // 新しいセッションの既定も同じ理由で流し直す（歯車が読む値）。
    // 読むのはここ1回だけで、同じ値をこれから起こす駆動にも渡す。
    const sessionDefault = ports.readSessionDefault()
    onEvent({ kind: "session-default-changed", sessionDefault })
    // 訪問のオン・オフも同じ理由で流し直す（歯車が読む値）。
    // 読むのはここ1回だけ。`visit.setEnabled` で書き換えたあとは、この起動の駆動が続くかぎりその値のまま（次に起こすまで読み直さない）。
    onEvent({ kind: "visit-enabled-changed", visitEnabled: ports.readVisitEnabled() })

    // キャラクターごと・モードごとに別のセッションを持つ。起動時も切り替え時も、これから起こす側の続きを探す。
    // 画面から選ばれたときだけは探さない（選ばれたIDがそのまま続きになる）。
    const start = await sessionStartOf(ports, request.resume, pack, chat)
    // 切り替え先の一覧も、起こすたびに流し直す（画面はこのイベントでしか一覧を知れず、起こし直すと状態が初期値へ戻る）。
    // どれを出しているかも一緒に流すので、最初の依頼を送る前でも画面は居場所を指せる。
    // 画面へ渡す形（`current: string | undefined`）はここで畳む。`SessionStart` は core と adapter の間の語彙で、画面へ運ぶ語彙ではない。
    const announceSessions = (sessions: readonly SessionChoice[]): void => {
      onEvent({
        kind: "sessions-changed",
        sessions,
        current: start.kind === "resume" ? start.sessionId : undefined,
      })
    }
    announceSessions(await ports.listSessions(pack, chat))
    const restored = Promise.withResolvers<readonly SessionEvent[]>()
    const driver = ports.startDriver(
      { pack, start, chat, sessionDefault },
      onEvent,
      restored.promise,
    )

    // 流し終えてから駆動を返す。
    // 起こし直しの `hello` は駆動が返るのを待って配るので、ここで待たないと履歴の無い `hello` が先に出て、立ち絵の表情が既定から続きの表情へもう一度飛ぶ。
    restored.resolve(
      start.kind === "resume"
        ? await replayRestoredSession(ports, start.sessionId, pack, onRestoredEvents)
        : [],
    )
    void announceRefreshedSessions(ports, pack, chat, announceSessions)

    return driver
  }
}

/** これから起こすセッションを決める。画面から選ばれたIDと新規は探さない。 */
async function sessionStartOf<Pack extends NamedCharacterPack>(
  ports: SessionLaunchPorts<Pack>,
  resume: SessionResume,
  pack: Pack,
  chat: boolean,
): Promise<SessionStart> {
  switch (resume.by) {
    case "id":
      return { kind: "resume", sessionId: resume.sessionId }
    case "new":
      return { kind: "new" }
    case "latest":
      return ports.findResumeSession(pack, chat)
  }
}

/** 一覧を読み直し、読み直した一覧を採ったときだけ切り替え先の一覧を流す。 */
async function announceRefreshedSessions<Pack extends NamedCharacterPack>(
  ports: SessionLaunchPorts<Pack>,
  pack: Pack,
  chat: boolean,
  announceSessions: (sessions: readonly SessionChoice[]) => void,
): Promise<void> {
  if ((await ports.refreshSessions()) === "refreshed") {
    announceSessions(await ports.listSessions(pack, chat))
  }
}

/**
 * 前のセッションの記録を組み直して流す。
 * claude 側の会話は続きから始めること自体が繋いでいるので、ここが失敗しても駆動は動き続ける（読めなかったぶんの履歴が画面に出ないだけ）。
 * 組み上がるのはこのプロセスのメモリの中だけで、どこにも書き出さない。
 * 戻り値は流した並び（読めなかったときは空）。
 */
async function replayRestoredSession<Pack extends NamedCharacterPack>(
  ports: SessionLaunchPorts<Pack>,
  sessionId: string,
  pack: Pack,
  onRestoredEvents: (events: readonly SessionEvent[]) => void,
): Promise<readonly SessionEvent[]> {
  try {
    const events = await ports.restoreEvents(sessionId, pack)
    onRestoredEvents(events)
    return events
  } catch (error) {
    // 履歴が出ないだけで、セッションそのものは続く。
    ports.diagnosticLog.append([
      swallowedFailureFootprint(
        ports.now(),
        { feature: "session", place: "restore-events" },
        error,
      ),
    ])
    return []
  }
}
