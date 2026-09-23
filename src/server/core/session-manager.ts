// セッションを持つ係。**駆動から届いたイベントに時刻を打ち、サーバ側でも同じ畳み込みを回し、
// まとめてフレームで配る**（docs/design.md 5章）。
//
// - 状態をサーバ側でも持つのは、接続してきたブラウザへ `hello` の snapshot を返すため
// - コマンドの分岐（`switch (command.type)`）は**ここが唯一**。旧の POST 6本ぶんの判断が1つになる
//   （`switch-character` は駆動へ渡すのではなく起こし直しとして、キャラクターへの書き込み
//   （`set-portrait` / `clear-portrait` / `set-outfit-accent` / `create-character`）は
//   **書き込みと `character-changed` の流し直し**として、どちらも手前で捌く）
// - **持つセッションは1つだけで、鍵を持たない**（docs/design.md 8章）。キャラクター・雑談モード・
//   セッションの切り替えはこの持ち物の中で駆動を起こし直す（`restart`）ので、古い側と新しい側を
//   並べて持つことが無い
//
// 会話の内容がイベントとして通るが、**ログにもファイルにも書かない**
// （docs/coding-standards.md「会話内容の扱い」）。配る先は購読しているブラウザだけ。

import { chatLogByteSize } from "../../shared/chat-log.ts"
import {
  type CharacterCreateCommand,
  type CharacterEditCommand,
  type ClientCommand,
  type DriverCommand,
  isCharacterEditCommand,
} from "../../shared/command.ts"
import { type ContextUsageReport, UNAVAILABLE_CONTEXT_USAGE } from "../../shared/context-usage.ts"
import { FRAME_ERROR_REASON, PROTOCOL_VERSION, type ServerFrame } from "../../shared/frame.ts"
import { type SessionDefault } from "../../shared/session-default.ts"
import { type SessionEvent, type StampedEvent } from "../../shared/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../shared/session-state.ts"
import { type ModelTokenUsage, type TokenUsageMode } from "../../shared/token-usage.ts"
import { CHAT_COMPACT_COMMAND } from "./chat-compact.ts"
import { CHAT_NUDGE_PROMPT } from "./chat-nudge.ts"
import { type ContextUsageLog } from "./context-usage.ts"
import { type PromptImageShelf, releasedPromptImageIds } from "./prompt-image-shelf.ts"
import { type ChatArchive, type SessionDriver } from "./session-driver.ts"
import { type SessionLaunchRequest } from "./session-launch.ts"
import {
  EMPTY_TURN_USAGE_TALLY,
  tallyTurnUsage,
  type TokenUsageLog,
  tokenUsageDelta,
  turnUsageBreakdown,
  type TurnUsageTally,
} from "./token-usage.ts"

/**
 * イベントをまとめて配る間隔。**旧の `PUBLISH_INTERVAL_MS` と同じ 100ms**。
 * 書きかけの本文はトークン単位で届くので、1件ずつ押すと転送量が跳ねる。
 */
export const EVENT_BATCH_INTERVAL_MS = 100

export type SessionManagerOptions = {
  /** 現在時刻（エポックミリ秒）を返す関数（呼び出し側が時計を渡す。テストは偽の時計を渡す）。 */
  readonly now: () => number
  /** イベントをまとめる間隔（ミリ秒）。既定は {@link EVENT_BATCH_INTERVAL_MS}。 */
  readonly batchIntervalMs: number
  /**
   * 雑談の記憶を畳む閾値（バイト）。**呼び出し側が明示的に渡す**（`batchIntervalMs` と同じ形。
   * 本番は `CHAT_COMPACT_THRESHOLD_BYTES`、`src/shared/chat-log.ts`）。テストは架空の短い文面の
   * まま閾値に届かせるため、小さい値を渡す。
   */
  readonly chatCompactThresholdBytes: number
  /**
   * 雑談の会話のアーカイブの書き込み口（`docs/design.md` 7章「雑談の会話のアーカイブはどこに
   * 置くか」）。本番は `createChatArchive()`（`src/server/adapter/chat-archive.ts`）、テストは
   * 呼ばれた引数だけを覚えるスタブを渡す。
   */
  readonly chatArchive: ChatArchive
  /**
   * トークン消費の書き込み口（`src/server/core/token-usage.ts` の契約。本番は
   * `createTokenUsageLog()`、テストは呼ばれた引数だけを覚えるスタブを渡す）。
   *
   * **前の `result` からの増分を出すのはここ**（`receive` が前回の累計を覚えている）で、
   * 渡した先は「どこに・どんな形で書くか」しか持たない。
   */
  readonly tokenUsageLog: TokenUsageLog
  /**
   * コンテキストの内訳の書き込み口（`src/server/core/context-usage.ts` の契約。本番は
   * `createContextUsageLog()`、テストは呼ばれた引数だけを覚えるスタブを渡す）。
   *
   * **セッション1つにつき1行**で、いつ書くか（＝そのセッションでまだ書いていない最初の
   * ターンの終わり）を決めるのはここ。渡した先は「どこに・どんな形で書くか」しか持たない。
   */
  readonly contextUsageLog: ContextUsageLog
  /**
   * 依頼に添えた画像の原寸の棚（`src/server/core/prompt-image-shelf.ts`）。**持ち主は
   * `src/main.ts`** — `/prompt-image/<id>` で配る側（`view-delivery.ts`）も同じ棚を引く。
   * **置くのと捨てるのはここ**で、`prompt` を受けたときに置き、記録から依頼が消えたときに捨てる。
   */
  readonly promptImageShelf: PromptImageShelf
  /**
   * セッションを1つ起こす（起こし直しも含む）一続き。**駆動を起こすだけでなく、パックを決めて
   * 続きを探し、復元した履歴を流すところまでを1つでやる**（`core/session-launch.ts` の
   * `createSessionLaunch` が実体。名前が `startDriver` ではなく `launchSession` なのは、
   * 駆動そのものを起こす低レベルの口（`SessionLaunchPorts.startDriver`）と役割が違うから）。
   * **渡された `onEvent` / `onRestoredEvent` を駆動に配線する**のは呼び出し側の仕事で、ここは
   * 種類（SDK か fake driver か）を知らない。
   *
   * **受け口は2つ。** `onEvent` は駆動（と見張り）から新しく届くイベント、`onRestoredEvent` は
   * 前のセッションの記録を組み直した再生だけが通る（`docs/design.md` 7章「雑談の会話の
   * アーカイブはどこに置くか」）。**畳み方と配り方はどちらも同じ**（`receive` が両方を
   * 同じように畳む）——分かれているのは「どちらから来たか」を呼び出し側が知れるようにする
   * ためだけ。
   *
   * `request.selection` は**これから起こすパックの決め方**で、起動時は「初期パック」、
   * `switch-character` は「画面から選ばれた名前」、`set-chat-mode` は「いま出しているパックの
   * まま」の3つ（docs/design.md 7章・docs/screen-design.md 13.6）。知らない名前のときに何を起こすかも、名前を
   * 覚えるかどうかも呼び出し側が決める。
   * `request.chat` は雑談モードで起こすか（`docs/chat-mode.md` 4.9）。
   * `request.resume` は**これから起こすセッションの決め方**で、印から探すか、画面から選ばれた
   * IDをそのまま続きにするかの2つ（`docs/requirements.md` 4.8）。
   *
   * **待てる形（Promise）で返す**のは、そのパックの続きから始めるセッションを探すのに
   * 外の世界（claude 自身の transcript の一覧）を読むから（docs/requirements.md 4.8）。
   */
  readonly launchSession: (
    onEvent: (event: SessionEvent) => void,
    onRestoredEvent: (event: SessionEvent) => void,
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
  /**
   * 雑談のサイドバー「覚えていること」の「編集」から1行消し、**流し直す
   * `remembered-lines-changed` を返す**（書き込み先と受け付けない条件は
   * `src/server/adapter/persona-memory.ts` の `forgetRememberedLineFromScreen`）。**受け付けられ
   * なかったときは undefined**（呼び出し側は定型文の `error` を返す）。
   *
   * セッションは起こし直さない（`editCharacter` と同じ立場。`docs/design.md` 7.1）。
   */
  readonly forgetRememberedLine: (line: string) => Promise<SessionEvent | undefined>
  /**
   * 新しいセッションの既定（モデル・許可モード）を覚え、**画面へ流す
   * `session-default-changed` イベントを返す**（覚え先は `~/.tsukumo/state.json`。
   * `docs/screen-design.md` 13.6）。
   *
   * **いま動いているセッションには効かない**（効くのは次に起こすときから）。だから駆動には
   * 渡らず、セッションを起こし直しもしない。**書けたかどうかに関わらず、返すイベントは常に1つ**
   * — 書き込みは失敗しても例外を投げない口なので、失敗を区別して返す手立てがここには無い。
   */
  readonly rememberSessionDefault: (sessionDefault: SessionDefault) => SessionEvent
}

/** コマンドを受け付けられたか。理由は定型文（`FRAME_ERROR_REASON`）だけを返す。 */
export type DispatchResult = { readonly ok: true } | { readonly ok: false; readonly reason: string }

/**
 * セッション1つぶんの持ち物（docs/design.md 5章）。**起こした時点で駆動も起こし始める**
 * （`create` の段は無い。1プロセスが持つセッションは1つで、切り替えは中で起こし直す）。
 */
export type SessionManager = {
  /** コマンドを駆動へ渡す。**分岐はここだけ**。 */
  readonly dispatch: (command: ClientCommand) => Promise<DispatchResult>
  /**
   * いまのコンテキストの内訳を駆動から取る（トークン消費の画面が引く。
   * `docs/glossary.md`「コンテキストの内訳」）。**押すのではなく引く**ので、状態にも
   * フレームにも乗らない。取れなかったときは「取れない」。
   */
  readonly readContextUsage: () => Promise<ContextUsageReport>
  /** 接続を購読に加える。**まず `hello` を1つ送ってから**加え、外すための関数を返す。 */
  readonly subscribe: (send: (frame: ServerFrame) => void) => () => void
  /** 駆動を閉じる（プロセスを終えるとき。claude の子プロセスを残さないため必ず呼ぶ）。 */
  readonly close: () => void
}

/**
 * `receive` に渡るイベントが「駆動から新しく届いたか（`"driver"`）、復元の再生か
 * （`"restored"`）」の印（docs/design.md 7章「雑談の会話のアーカイブはどこに置くか」）。
 */
type EventOrigin = "driver" | "restored"

export function createSessionManager(options: SessionManagerOptions): SessionManager {
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
  // 雑談のログの文面を**受け取るたびに足していく走行合計**（docs/chat-mode.md 4.9
  // 「数える範囲は前の圧縮点から先だけ」）。**`state.records` からは数えない** —
  // `trimToRecentTurns`（`src/shared/session-state.ts`）で直近何ターンかに切り詰められるので、
  // そこから数えると古いターンが落ちるたびに減り、閾値へ一生届かないことがある
  // （雑談は100ターンの窓）。`/compact` を送れたら 0 に戻し（＝そこが新しい圧縮点）、
  // 起こし直す（restart）でも同じ理由で 0 に戻す。
  let chatLogBytesSinceCompact = 0
  // 前の `result` が運んできたトークンの累計（`query()` の中の走行合計）。**次の `result` との
  // 差がそのターンの消費**になる（`src/server/core/token-usage.ts`）。起こし直すと `query()` が
  // 変わって累計も振り出しに戻るので、`restart` で空に戻す。
  let cumulativeTokenUsage: readonly ModelTokenUsage[] = []
  // いま進んでいるターンの内訳（ツールの呼び出し回数と結果の長さ、ステップの使用量）。
  // **1ターンぶんだけ**持ち、終わりに記録へ畳んで捨てる（`src/server/core/token-usage.ts`）。
  let turnUsage: TurnUsageTally = EMPTY_TURN_USAGE_TALLY
  // コンテキストの内訳を記録に残した claude 側のセッションID。**このIDのあいだは二度と
  // 書かない**（1行 = 1セッション）。**起こし直しで空に戻さない** — 続きから起こして同じIDに
  // なったときは同じセッションなので、2行目を書かない。IDが変われば比較で弾かれる。
  let contextUsageSessionId: string | undefined = undefined

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
    state,
  })

  /**
   * 雑談のログが閾値を超えていたら `/compact` を1回投げる（docs/chat-mode.md 4.9
   * 「記憶の圧縮と忘却」）。数えるのは {@link chatLogBytesSinceCompact}
   * （前の圧縮点から先の走行合計）で、超えていたら送って 0 に戻す（＝そこが新しい圧縮点）。
   *
   * **記録に残さない口（`promptWithoutRecord`）で渡す。** 流れるのは `request` ではなく
   * `turn-started` だけなので、利用者が打っていない `/compact` の文面が雑談のログにも
   * 会話のアーカイブにも並ばない（docs/chat-mode.md 4.9「記憶の圧縮と忘却」）。圧縮が
   * 起きたこと自体は、SDK から届く `compact-boundary`（`sdk-message.ts`）が別に画面の区切りへ
   * 変換するので、ここで文面を残さなくても失われない。
   *
   * 駆動がまだ無い・送信が失敗したときは**その回を諦めて次のターンでまた試す**
   * （走行合計を戻さない。docs/coding-standards.md「エラーハンドリング」）。
   */
  const requestChatCompactIfNeeded = (): void => {
    if (!state.chatMode || live === undefined) {
      return
    }
    if (chatLogBytesSinceCompact < options.chatCompactThresholdBytes) {
      return
    }
    try {
      live.promptWithoutRecord(CHAT_COMPACT_COMMAND)
      chatLogBytesSinceCompact = 0
    } catch {
      // 次のターンでまた閾値を超えていれば試す。
    }
  }

  /**
   * そのターンのトークン消費を記録に1行足す。**1行 = 1ターン**で、
   * モデルが複数出たターン（サブエージェントが別のモデルで動いたとき）は同じ行の `models` に
   * 並ぶ——ターンが読む人にとっての単位なので、モデルごとに行を割ると「このターンでいくら
   * 使ったか」を出すのに行を組み直すことになる。
   *
   * 届く `cumulative` は `query()` の中の累計なので、**前回との差**を書く。増分が無いターン
   * （`/clear` の直後など、何も呼んでいない `result`）は行を書かない。
   *
   * 内訳（メインループとサブエージェントに割った、ツール別の呼び出しとステップの使用量）は
   * **そのターンのあいだ積んできた {@link turnUsage} を畳んだもの**。合計の `models` と同じ
   * 1行に入る（割り方の理由は `src/shared/token-usage.ts`）。
   *
   * **claude 側のセッションIDが分からないうちは書かない**（`system/init` より前に `result` は
   * 来ないので実際には起きない）。行だけで「どのセッションのターンか」が決まらない記録を
   * 積まないため。
   */
  const appendTokenUsage = (cumulative: readonly ModelTokenUsage[], at: number): void => {
    const models = tokenUsageDelta(cumulativeTokenUsage, cumulative)
    cumulativeTokenUsage = cumulative
    const sessionId = state.session.kind === "starting" ? undefined : state.session.sessionId
    if (models.length === 0 || sessionId === undefined) {
      return
    }
    options.tokenUsageLog.append({
      at,
      sessionId,
      mode: state.chatMode ? "chat" : "work",
      models,
      breakdown: turnUsageBreakdown(turnUsage),
    })
  }

  /**
   * そのセッションのコンテキストの内訳を記録に1行足す（**セッション1つにつき1回だけ**）。
   * ターンごとに残さないのは、内訳のうちメッセージ以外がセッションの中でほぼ変わらないから
   * （`src/shared/context-usage-record.ts`）。
   *
   * **ターンが終わるたびに呼ばれ、まだ書いていないセッションIDのときだけ問い合わせる。**
   * 取れなかったら印を戻して**次のターンでまた試す**（諦めない——1回の取りこぼしでその
   * セッションぶんが永久に欠けるのに対し、あとのターンで取ってもほぼ同じ値になる）。
   * 問い合わせは待たされる口なので、**先に印を立てて二重に走らせない**（同じセッションで
   * 次のターンが先に終わっても、問い合わせは1本だけ）。
   *
   * **駆動がまだ無い・claude 側のセッションIDが分からないうちは何もしない**（行だけで
   * 「どのセッションか」が決まらない記録を積まないため。どちらも次のターンで揃う）。
   */
  const recordContextUsageOnce = async (at: number): Promise<void> => {
    const sessionId = state.session.kind === "starting" ? undefined : state.session.sessionId
    const driver = live
    if (sessionId === undefined || sessionId === contextUsageSessionId || driver === undefined) {
      return
    }
    const mode: TokenUsageMode = state.chatMode ? "chat" : "work"
    contextUsageSessionId = sessionId
    const report = await readDriverContextUsage(driver)
    if (report.kind === "ready") {
      options.contextUsageLog.append({ at, sessionId, mode, usage: report.usage })
      return
    }
    if (contextUsageSessionId === sessionId) {
      contextUsageSessionId = undefined
    }
  }

  /**
   * 状態を差し替える。**記録から消えた依頼の原寸は、ここで棚から捨てる**（窓から落ちた・
   * 起こし直して空に戻った。`releasedPromptImageIds`）。状態を書き換えるのはここだけにして、
   * 棚の寿命が記録の窓から外れないようにする。
   */
  const replaceState = (next: SessionState): void => {
    if (next.records !== state.records) {
      options.promptImageShelf.release(releasedPromptImageIds(state.records, next.records))
    }
    state = next
  }

  /**
   * イベント1件を畳んで次のバッチに積む。**駆動から届いたものと、見た目の編集で起こした
   * `character-changed` の両方がここを通る**（サーバ側の状態とブラウザへ配る内容を1本にする）。
   *
   * `origin` は「駆動から新しく届いたか（`"driver"`）、復元の再生か（`"restored"`）」の印
   * （`docs/design.md` 7章「雑談の会話のアーカイブはどこに置くか」）。**畳み方と配り方は
   * どちらも同じ**——分かれているのは、雑談の会話のアーカイブへ書くのを**駆動由来の依頼と
   * セリフだけ**に絞るため（復元で流し直されたぶんまで書くと、起こし直すたびに同じ行が
   * 二重に積まれる）。
   */
  const receive = (event: SessionEvent, origin: EventOrigin): void => {
    if (closed) {
      return
    }
    const at = options.now()
    replaceState(applySessionEvent(state, event, at))
    buffered = [...buffered, { at, event }]
    if (flushTimer === undefined) {
      flushTimer = setTimeout(flush, options.batchIntervalMs)
    }
    // 雑談のログに乗る文面（依頼とセリフ）だけ、届いたその場で走行合計に足す
    // （`state.records` の切り詰めに影響されない。docs/chat-mode.md 4.9）。
    if (state.chatMode) {
      chatLogBytesSinceCompact += chatLogEventByteSize(event, at)
    }
    // 雑談の会話のアーカイブへ1行足す。**駆動由来（`"driver"`）・雑談モード・パックが
    // 分かっているときだけ**（docs/chat-mode.md 4.9「誰がいつ書くか」）。
    if (origin === "driver" && state.chatMode) {
      appendChatArchiveEntry(options.chatArchive, state.character?.pack, at, event)
    }
    // ターンの中の内訳（ツール別・持ち場別）を積む。**駆動由来（`"driver"`）だけ** —
    // 復元の再生は前のセッションで使ったぶんなので、いまのターンに数えない。
    if (origin === "driver") {
      turnUsage = tallyTurnUsage(turnUsage, event)
    }
    // そのターンのトークン消費を1行書く。**駆動由来（`"driver"`）だけ**（復元の再生には
    // 使用量が乗らないし、乗せても同じターンを二度数えることになる）。
    if (origin === "driver" && event.kind === "token-usage") {
      appendTokenUsage(event.cumulative, at)
    }
    // 「残す」旗が立っていれば、**このターンで書いた行を指す印**をここで書く
    // （旗を立てるのはターンの途中、書くのは終わり。docs/chat-mode.md 4.9
    // 「残すと決めた1往復は窓から落とさない」）。立っていなければ覚えていた行を忘れるだけ
    // なので、雑談かどうかで呼び分けない。
    // 内訳を捨てるのも同じ合図で行う（1ターンぶんだけ持つ）。**`token-usage` は
    // `turn-finished` より先に届く**（`sdk-message.ts` が `result` 1つをこの順に変換する）ので、
    // 書き終えたあとに捨てることになる。
    if (origin === "driver" && event.kind === "turn-finished") {
      options.chatArchive.finishTurn()
      turnUsage = EMPTY_TURN_USAGE_TALLY
      // コンテキストの内訳は**セッションに1行**なので、ここでは「まだ書いていなければ」
      // だけを見る。問い合わせを待たずに次へ進む（ターンの終わりを遅らせない）。
      void recordContextUsageOnce(at)
    }
    // **ターンの終わりに1回だけ見る**（docs/chat-mode.md 4.9）。仕事のときは何もしない
    // （`requestChatCompactIfNeeded` が `state.chatMode` を見て弾く）。
    if (event.kind === "turn-finished") {
      requestChatCompactIfNeeded()
    }
  }

  const start = (request: SessionLaunchRequest): Promise<SessionDriver> => {
    const born = generation
    const starting = options.launchSession(
      (event) => {
        if (born !== generation) {
          return
        }
        receive(event, "driver")
      },
      (event) => {
        if (born !== generation) {
          return
        }
        receive(event, "restored")
      },
      request,
    )

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

  // **起動時は覚えない** — その回だけの指定（`TSUKUMO_CHARACTER`）や同梱の既定が次の起動の
  // 初期値として残らないように（docs/screen-design.md 13.6）。
  let driver = start({ selection: { by: "initial" }, chat: undefined, resume: { by: "latest" } })

  /**
   * 駆動を起こし直す（docs/design.md 7章。**そのパックのセッションの
   * 続きから始まる** — 会話が繋がるかどうかは、起こす側が `resume` に何を渡すかで決まる）。
   * **契機は3つ**: 別のキャラクターパックに切り替えたとき（`switch-character`）、
   * 雑談モードを切り替えたとき（`set-chat-mode`。`systemPrompt` を差し替えるため。
   * `docs/chat-mode.md` 4.9）、画面から別のセッションを選んだとき（`switch-session`。
   * `docs/requirements.md` 4.8）。
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
      replaceState(INITIAL_SESSION_STATE)
      buffered = []
      // 起こし直した直後の記録は、復元されたログがそのまま圧縮点から先になる
      // （docs/chat-mode.md 4.9）。走行合計も一緒に戻す。
      chatLogBytesSinceCompact = 0
      // 新しい `query()` の累計は 0 から始まる（前の累計を引くと増分が足りなくなる）。
      cumulativeTokenUsage = []
      // 起こし直しの前に積んでいた内訳は、次のターンのものではない。
      turnUsage = EMPTY_TURN_USAGE_TALLY
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
      // 見た目の編集で起こした `character-changed` は、駆動から届くのと同じ「新しい」もの
      // （復元の再生ではない）。
      receive(event, "driver")
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
        if (state.turn.kind === "running") {
          return Promise.resolve({ ok: false, reason: FRAME_ERROR_REASON.switchDuringTurn })
        }
        // **雑談かどうかは切り替えをまたいで保つ**（パックを変えただけで仕事へ戻らない）。
        // 画面から名前が届いた唯一の口なので、**ここで選んだパックだけが次の起動の初期値に
        // なる**（docs/screen-design.md 13.6）。
        return restart({
          selection: { by: "name", name: command.name },
          chat: state.chatMode,
          resume: { by: "latest" },
        })
      }
      if (command.type === "set-chat-mode") {
        // 起こし直しなので `switch-character` と同じ条件で弾く（理由の文面だけは、何が
        // 切り替わらなかったかで分ける。docs/screen-design.md 13.9「動き方の操作子」）。
        if (state.turn.kind === "running") {
          return Promise.resolve({
            ok: false,
            reason: FRAME_ERROR_REASON.chatModeSwitchDuringTurn,
          })
        }
        // **いま出しているパックのまま**起こし直す（雑談に入るとキャラクターが変わる、
        // とは決めていない）。**名前では渡さない** — 渡すと「画面から選ばれた名前」と
        // 区別がつかず、モードを切り替えただけで覚えた値が書き換わる（docs/screen-design.md 13.6）。
        return restart({
          selection: { by: "current" },
          chat: command.chat,
          resume: { by: "latest" },
        })
      }
      if (command.type === "switch-session") {
        // 起こし直しなので `switch-character` と同じ条件で弾く（理由の文面だけは、何が
        // 切り替わらなかったかで分ける）。
        if (state.turn.kind === "running") {
          return Promise.resolve({ ok: false, reason: FRAME_ERROR_REASON.sessionSwitchDuringTurn })
        }
        // **キャラクターもモードもいま出しているまま**（変わるのは、どの transcript の続きから
        // 始めるかだけ）。一覧は同じパック・同じモードのものしか出していないので、選んだ先で
        // 相手が入れ替わることもない。
        return restart({
          selection: { by: "current" },
          chat: state.chatMode,
          resume: { by: "id", sessionId: command.sessionId },
        })
      }
      if (command.type === "nudge") {
        // 画面のボタンも同じ2つの条件で塞ぐが、ここでも見る（画面を経ない依頼・無効化の描画が
        // 間に合わなかったときの取りこぼし対策。`switch-character` と同じ立場）。
        // **雑談のときだけ**（`docs/screen-design.md` 13.7）——仕事のメインビューは記録を積んで
        // レポートを出す面なので、キャラクターから始まるターンを混ぜない。
        if (!state.chatMode) {
          return Promise.resolve({ ok: false, reason: FRAME_ERROR_REASON.nudgeOutsideChat })
        }
        if (state.turn.kind === "running") {
          return Promise.resolve({ ok: false, reason: FRAME_ERROR_REASON.nudgeDuringTurn })
        }
        return nudge(driver)
      }
      if (command.type === "create-character") {
        return write(
          () => options.createCharacter(command),
          FRAME_ERROR_REASON.characterCreateFailed,
        )
      }
      if (command.type === "forget-remembered-line") {
        // **雑談モードのときだけ**（サイドバーの「覚えていること」自体が雑談中にしか出ない。
        // 画面を経ない依頼の取りこぼし対策として、`nudge` と同じ理由でここでも見る）。
        if (!state.chatMode) {
          return Promise.resolve({
            ok: false,
            reason: FRAME_ERROR_REASON.forgetRememberedLineOutsideChat,
          })
        }
        return write(
          () => options.forgetRememberedLine(command.line),
          FRAME_ERROR_REASON.forgetRememberedLineFailed,
        )
      }
      if (command.type === "set-session-default") {
        // **起こし直さない**（次に起こすときから効く値なので、いまの会話には触らない）。
        // 書いて、覚えた値を画面へ流すだけ。
        return write(
          () =>
            Promise.resolve(
              options.rememberSessionDefault({
                model: command.model,
                permissionMode: command.permissionMode,
              }),
            ),
          FRAME_ERROR_REASON.sessionDefaultFailed,
        )
      }
      if (isCharacterEditCommand(command)) {
        return write(() => options.editCharacter(command), FRAME_ERROR_REASON.characterEditFailed)
      }
      return dispatchToDriver(driver, command, options.promptImageShelf)
    },
    readContextUsage: async () => {
      // 起こし直しの最中・起こせなかったときは駆動そのものが無い。**画面の札が1枚出ない
      // だけ**で、常駐プロセスは落とさない（`dispatchToDriver` と同じ扱い）。
      try {
        const started = await driver
        return await started.readContextUsage()
      } catch {
        return UNAVAILABLE_CONTEXT_USAGE
      }
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
/**
 * 起き上がっている駆動に、いまのコンテキストの内訳を問い合わせる。**投げてきた回は「取れない」に
 * 畳む**（常駐プロセスは落とさない）。
 *
 * `SessionManager.readContextUsage` のほうは**駆動が起き上がるのを待つところ**から面倒を見るので、
 * こちらとは畳む範囲が違う（記録を残す側は、起き上がっている駆動しか相手にしない）。
 */
async function readDriverContextUsage(driver: SessionDriver): Promise<ContextUsageReport> {
  try {
    return await driver.readContextUsage()
  } catch {
    return UNAVAILABLE_CONTEXT_USAGE
  }
}

async function dispatchToDriver(
  driver: Promise<SessionDriver>,
  command: DriverCommand,
  promptImageShelf: PromptImageShelf,
): Promise<DispatchResult> {
  try {
    const started = await driver
    switch (command.type) {
      case "prompt":
        // 原寸は**駆動へ渡す前に棚へ置く**（id は `request` のイベントに載って記録へ入る）。
        // 駆動が投げて `request` が流れなかったときの原寸は記録に載らないまま残るが、
        // 棚の枚数の上限で古いほうから押し出される。
        started.prompt(command.text, promptImageShelf.shelve(command.images))
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
 * キャラクターから話しかけてもらう（`docs/screen-design.md` 13.7）。**文面は core が持ち**
 * （{@link CHAT_NUDGE_PROMPT}）、**記録に残さない口**（`promptWithoutRecord`）で渡すので、
 * 利用者が打っていない一言はログにも記録にも雑談の会話のアーカイブにも並ばない。
 *
 * 駆動が例外を投げても常駐プロセスは落とさず、定型文の理由を返す（`dispatchToDriver` と同じ）。
 */
async function nudge(driver: Promise<SessionDriver>): Promise<DispatchResult> {
  try {
    const started = await driver
    started.promptWithoutRecord(CHAT_NUDGE_PROMPT)
    return { ok: true }
  } catch {
    return { ok: false, reason: FRAME_ERROR_REASON.driverFailed }
  }
}

/**
 * イベント1件を雑談の会話のアーカイブへ渡す。拾うのは `chatLogEntries`
 * （`src/shared/chat-log.ts`）と同じ2種類（依頼とセリフ）だけ——本文・ツールの入出力・
 * 許可プロンプト・質問は渡さない（`docs/chat-mode.md` 4.9「広げていないこと」）。
 *
 * `packName` がまだ分からない（`character-changed` が一度も届いていない）ときは何もしない。
 */
function appendChatArchiveEntry(
  chatArchive: ChatArchive,
  packName: string | undefined,
  at: number,
  event: SessionEvent,
): void {
  if (packName === undefined) {
    return
  }
  if (event.kind === "request") {
    chatArchive.append(packName, {
      speaker: "user",
      at,
      text: event.text,
      images: event.images.length > 0 ? event.images.length : undefined,
    })
    return
  }
  if (event.kind === "speech") {
    chatArchive.append(packName, {
      speaker: "character",
      at,
      text: event.text,
      expression: event.expression,
    })
  }
}

/**
 * イベント1件ぶんの、雑談のログに乗る文面の UTF-8 バイト数。拾うのは
 * `chatLogEntries`（`src/shared/chat-log.ts`）と同じ2種類（依頼とセリフ）だけで、
 * それ以外は0（画像とツールの入出力は数えない。docs/chat-mode.md 4.9）。
 */
function chatLogEventByteSize(event: SessionEvent, at: number): number {
  // 時刻は数えないが、ログの1件の形に揃えるために添える。
  const time = { kind: "stamped", at } as const
  if (event.kind === "request") {
    return chatLogByteSize([{ speaker: "user", text: event.text, images: event.images, time }])
  }
  if (event.kind === "speech") {
    return chatLogByteSize([
      { speaker: "character", text: event.text, expression: event.expression, time },
    ])
  }
  return 0
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
