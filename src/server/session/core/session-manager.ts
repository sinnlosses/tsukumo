// セッションを持つ係。**駆動から届いたイベントに時刻を打ち、サーバ側でも同じ畳み込みを回し、
// まとめてフレームで配る**（docs/design.md 5章）。
//
// - 状態をサーバ側でも持つのは、接続してきたブラウザへ `hello` の snapshot を返すため
// - **コマンドの分岐はここに無い**。どの手続きをどの機能が受け、どの条件で断るかは契約と
//   機能ごとの表（束ねるのは配線の `src/router.ts`）が持ち、ここは受け手に見せる口
//   （`CommandSession`）を作って出すだけ（docs/design.md 2章「コマンドの受け手と手続きの置き方」）
// - **持つセッションは1つだけで、鍵を持たない**（docs/design.md 8章）。キャラクター・雑談モード・
//   セッションの切り替えはこの持ち物の中で駆動を起こし直す（`restart`）ので、古い側と新しい側を
//   並べて持つことが無い
// - **代のあいだだけ意味のある勘定は {@link SessionGeneration} に集めてある**（配る束・雑談の
//   圧縮の見張り・トークンの勘定）。起こし直しはそれを丸ごと作り直すことなので、勘定を1つ
//   足しても `restart` に戻し忘れる場所が生まれない
//
// 会話の内容がイベントとして通るが、**ログにもファイルにも書かない**
// （docs/coding-standards.md「会話内容の扱い」）。配る先は購読しているブラウザだけ。

import {
  type ContextUsageReport,
  UNAVAILABLE_CONTEXT_USAGE,
} from "../../../shared/context-usage.ts"
import { FRAME_ERROR_REASON, PROTOCOL_VERSION, type ServerFrame } from "../../../shared/frame.ts"
import { type SessionEvent } from "../../../shared/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../shared/session-state.ts"
import { type PreviousUsageReview, type UsageReviewFindings } from "../../../shared/usage-review.ts"
import { appendChatArchiveEntry } from "../../chat/core/chat-archive-entry.ts"
import { type ChatCompactWatch, createChatCompactWatch } from "../../chat/core/chat-compact.ts"
import {
  type ContextUsageLog,
  createContextUsageRecorder,
} from "../../context-usage/core/context-usage.ts"
import { type DispatchResult } from "../../core/command-receiver.ts"
import {
  type PromptImageShelf,
  releasedPromptImageIds,
} from "../../session-driver/core/prompt-image-shelf.ts"
import { type ChatArchive, type SessionDriver } from "../../session-driver/core/session-driver.ts"
import {
  createTokenUsageRecorder,
  type TokenUsageLog,
  type TokenUsageRecorder,
} from "../../token-usage/core/token-usage.ts"
import { createVisitWatch, type VisitPorts, type VisitWatch } from "../../visit/core/visit-watch.ts"
import { type CommandSession } from "./command-session.ts"
import { createEventBatch, type EventBatch } from "./event-batch.ts"
import { type SessionLaunchRequest } from "./session-launch.ts"

export type SessionManagerOptions = {
  /** 現在時刻（エポックミリ秒）を返す関数（呼び出し側が時計を渡す。テストは偽の時計を渡す）。 */
  readonly now: () => number
  /** イベントをまとめる間隔（ミリ秒）。既定は `EVENT_BATCH_INTERVAL_MS`（`event-batch.ts`）。 */
  readonly batchIntervalMs: number
  /**
   * 雑談の記憶を畳む閾値（バイト）。**呼び出し側が明示的に渡す**（`batchIntervalMs` と同じ形。
   * 本番は `CHAT_COMPACT_THRESHOLD_BYTES`、`src/shared/chat-log.ts`）。テストは架空の短い文面の
   * まま閾値に届かせるため、小さい値を渡す。
   */
  readonly chatCompactThresholdBytes: number
  /**
   * 雑談の会話のアーカイブの書き込み口（`docs/design.md` 7章「雑談の会話のアーカイブはどこに
   * 置くか」）。本番は `createChatArchive()`（`src/server/chat/adapter/chat-archive.ts`）、テストは
   * 呼ばれた引数だけを覚えるスタブを渡す。
   */
  readonly chatArchive: ChatArchive
  /**
   * トークン消費の書き込み口（`src/server/token-usage/core/token-usage.ts` の契約。本番は
   * `createTokenUsageLog()`、テストは呼ばれた引数だけを覚えるスタブを渡す）。
   *
   * **前の `result` からの増分を出すのは {@link TokenUsageRecorder}**（駆動1代ぶんの持ち物と
   * して前回の累計を覚えている）で、渡した先は「どこに・どんな形で書くか」しか持たない。
   */
  readonly tokenUsageLog: TokenUsageLog
  /**
   * コンテキストの内訳の書き込み口（`src/server/context-usage/core/context-usage.ts` の契約。本番は
   * `createContextUsageLog()`、テストは呼ばれた引数だけを覚えるスタブを渡す）。
   *
   * **セッション1つにつき1行**で、いつ書くか（＝そのセッションでまだ書いていない最初の
   * ターンの終わり）を決めるのは `createContextUsageRecorder` が返す係。渡した先は
   * 「どこに・どんな形で書くか」しか持たない。
   */
  readonly contextUsageLog: ContextUsageLog
  /**
   * 依頼に添えた画像の原寸の棚（`src/server/session-driver/core/prompt-image-shelf.ts`）。**持ち主は
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
   * `session.switchCharacter` は「画面から選ばれた名前」、`session.setChatMode` は「いま出しているパックの
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
   * ホームに残っている前回の見直しの結果（`docs/design.md`「見直しのツールと状態」）。**起こした
   * ときに1回だけ**読み、初期の姿（{@link SessionState.previousUsageReview}）に載せる——
   * `INITIAL_SESSION_STATE` は静的な定数なので、ここでしか差し込めない。
   */
  readonly readPreviousUsageReview: () => PreviousUsageReview
  /**
   * 見直しの結果を、次の起動でも「前回の提案」として配れるようにホームへ書く
   * （`src/server/usage-review/adapter/previous-usage-review.ts`）。**駆動由来（`"driver"`）の
   * `usage-review-result` を畳んだときだけ呼ぶ**（復元の再生には出てこない種類のイベントだが、
   * ほかの書き込みと条件を揃えてある）。
   */
  readonly writePreviousUsageReview: (reviewedAt: number, findings: UsageReviewFindings) => void
  /**
   * 訪問の見張りに渡す口（しきい値・時計・客の候補・乱数。`src/server/visit/core/visit-watch.ts`）。
   * 見張りは代ごとに1つ作る（{@link GenerationTally.visit}）。
   */
  readonly visit: VisitPorts
}

/**
 * セッション1つぶんの持ち物（docs/design.md 5章）。**起こした時点で駆動も起こし始める**
 * （`create` の段は無い。1プロセスが持つセッションは1つで、切り替えは中で起こし直す）。
 */
export type SessionManager = {
  /**
   * コマンドの受け手に見せる口（`docs/design.md` 2章「コマンドの受け手と手続きの置き方」）。
   * `/ws` の手続きの context に載る。**代は呼ばれたその時点のもの**を返す。
   */
  readonly commandSession: CommandSession
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

/**
 * 駆動1代ぶんの勘定。**イベントを受けるときに見るのはここだけ**なので、届いたイベントは
 * 必ずそれを生んだ代の勘定に積まれる（起こし直しをまたいで混ざらない）。
 */
type GenerationTally = {
  /** まとめて配る束（代をまたいで積み残しを配らない）。 */
  readonly batch: EventBatch
  /** 雑談のログの走行合計と `/compact` の見張り。 */
  readonly chatCompact: ChatCompactWatch
  /** トークンの累計と、いま進んでいるターンの内訳。 */
  readonly tokenUsage: TokenUsageRecorder
  /**
   * 起き上がった駆動。**閉じるのを待たない**ために値でも持つ（プロセスの終了は `process.exit`
   * ですぐ進むので、待っていると claude の子プロセスが閉じられずに残る）。まだ起き上がって
   * いない・起こせなかったときは `undefined`。
   */
  readonly liveDriver: () => SessionDriver | undefined
  /** 訪問の見張り（待ちの勘定と掛けた時計。起こし直すと一緒に捨てる）。 */
  readonly visit: VisitWatch
  /**
   * 振り返りの書き手を中断する信号（**代の持ち物**。`docs/design.md`「日記の受け取りと保存」
   * 「コマンドと依頼」）。起こし直しで代を閉じたら、書いている最中の問い合わせも中断する。
   */
  readonly diarySignal: AbortSignal
}

/**
 * 駆動1代ぶんの持ち物。**起こし直しはこれを丸ごと作り直すこと**で、代のあいだだけ意味のある
 * 勘定を1つずつ手で空へ戻さない（勘定を足すたびに `restart` へ書き足す、を無くす）。
 *
 * **代をまたいで残るもの**（購読者・棚・コンテキストの内訳を書いたセッションID）はここに
 * 入れない。
 */
type SessionGeneration = GenerationTally & {
  /** 駆動が起き上がるのを待つ口（コマンドを渡す側が待つ）。 */
  readonly driver: Promise<SessionDriver>
  /** 駆動を閉じ、積み残したイベントを捨てる。 */
  readonly close: () => void
  /** 新しい `hello` を配り終えたと知らせ、束を配り始める（起こし直しの代だけが待っている）。 */
  readonly announce: () => void
  /**
   * この代が生きているあいだだけイベントを畳む（駆動由来と同じ扱い）。代を閉じたあとに呼んでも
   * 黙って捨てる——`reflectAchievement` のような長く続く非同期の処理が、あとから届いた
   * イベントをこの代に固定して流すために使う。
   */
  readonly emit: (event: SessionEvent) => void
}

export function createSessionManager(options: SessionManagerOptions): SessionManager {
  const subscribers = new Set<(frame: ServerFrame) => void>()
  // **前回の見直しの結果だけ、起こしたときにホームから読んで載せる**——`INITIAL_SESSION_STATE`
  // は静的な定数なので、実行時の値をここで1回だけ差し込む（`docs/design.md`「見直しの
  // ツールと状態」）。
  let state: SessionState = {
    ...INITIAL_SESSION_STATE,
    previousUsageReview: options.readPreviousUsageReview(),
  }
  // 閉じたあとに駆動が投げてくるイベントは捨てる（配る先がもう無いのにタイマーを立てない）。
  let closed = false
  // 何代目まで起こしたか。**閉じた駆動があとから投げてくるイベントを捨てる**ための印
  // （`session.switchCharacter` で起こし直したとき、前の駆動の最後のイベントが新しい状態に混ざらない）。
  let bornCount = 0
  // コンテキストの内訳の記録。**代をまたいで持つ** — 続きから起こして同じIDになったときは
  // 同じセッションなので、2行目を書かない（世代の持ち物には入れない）。
  const contextUsage = createContextUsageRecorder(options.contextUsageLog)

  const helloFrame = (): ServerFrame => ({
    type: "hello",
    protocolVersion: PROTOCOL_VERSION,
    state,
  })

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
   * イベント1件を畳んで、それを生んだ代の勘定に積む。**駆動から届いたものと、見た目の編集で
   * 起こした `character-changed` の両方がここを通る**（サーバ側の状態とブラウザへ配る内容を
   * 1本にする）。
   *
   * `origin` は「駆動から新しく届いたか（`"driver"`）、復元の再生か（`"restored"`）」の印
   * （`docs/design.md` 7章「雑談の会話のアーカイブはどこに置くか」）。**畳み方と配り方は
   * どちらも同じ**——分かれているのは、雑談の会話のアーカイブへ書くのを**駆動由来の依頼と
   * セリフだけ**に絞るため（復元で流し直されたぶんまで書くと、起こし直すたびに同じ行が
   * 二重に積まれる）。
   */
  const receive = (tally: GenerationTally, event: SessionEvent, origin: EventOrigin): void => {
    if (closed) {
      return
    }
    const at = options.now()
    replaceState(applySessionEvent(state, event, at))
    tally.batch.add({ at, event })
    // 雑談のログに乗る文面（依頼とセリフ）だけ、届いたその場で走行合計に足す
    // （`state.records` の切り詰めに影響されない。docs/chat-mode.md 4.9）。
    if (state.chatMode) {
      tally.chatCompact.add(event, at)
    }
    // 雑談の会話のアーカイブへ1行足す。**駆動由来（`"driver"`）・雑談モード・パックが
    // 分かっているときだけ**（docs/chat-mode.md 4.9「誰がいつ書くか」）。
    if (origin === "driver" && state.chatMode) {
      appendChatArchiveEntry(options.chatArchive, state.character?.pack, at, event)
    }
    // ターンの中の内訳（ツール別・持ち場別）を積む。**駆動由来（`"driver"`）だけ** —
    // 復元の再生は前のセッションで使ったぶんなので、いまのターンに数えない。
    if (origin === "driver") {
      tally.tokenUsage.tally(event)
    }
    // そのターンのトークン消費を1行書く。**駆動由来（`"driver"`）だけ**（復元の再生には
    // 使用量が乗らないし、乗せても同じターンを二度数えることになる）。
    if (origin === "driver" && event.kind === "token-usage") {
      tally.tokenUsage.append(event.cumulative, at, state)
    }
    // 「残す」旗が立っていれば、**このターンで書いた行を指す印**をここで書く
    // （旗を立てるのはターンの途中、書くのは終わり。docs/chat-mode.md 4.9
    // 「残すと決めた1往復は窓から落とさない」）。立っていなければ覚えていた行を忘れるだけ
    // なので、雑談かどうかで呼び分けない。
    // 内訳を捨てるのも同じ合図で行う（1ターンぶんだけ持つ）。**`token-usage` は
    // `turn-finished` より先に届く**（`sdk-message.ts` が `result` 1つをこの順に変換する）ので、
    // 書き終えたあとに捨てることになる。
    // 見直しの結果を、次の起動でも「前回の提案」として配れるようにホームへ書く。**駆動由来
    // （`"driver"`）だけ**——復元の再生にはこの種類のイベントは出てこない
    // （`docs/design.md`「見直しのツールと状態」）が、ほかの書き込みと条件を揃えてある。
    if (origin === "driver" && event.kind === "usage-review-result") {
      options.writePreviousUsageReview(at, event.findings)
    }
    if (origin === "driver" && event.kind === "turn-finished") {
      options.chatArchive.finishTurn()
      tally.tokenUsage.finishTurn()
      // コンテキストの内訳は**セッションに1行**なので、まだ書いていなければ問い合わせる。
      // 待たずに次へ進む（ターンの終わりを遅らせない）。駆動がまだ無い回は次のターンで揃う。
      const driver = tally.liveDriver()
      if (driver !== undefined) {
        void contextUsage.recordOnce(state, at, driver)
      }
    }
    // **ターンの終わりに1回だけ見る**（docs/chat-mode.md 4.9）。仕事のときは何もしない。
    if (event.kind === "turn-finished" && state.chatMode) {
      const driver = tally.liveDriver()
      if (driver !== undefined) {
        tally.chatCompact.requestIfNeeded(driver)
      }
    }
    // 訪問の出入りを決める。**駆動由来だけ**（復元の再生は前のセッションの待ち）。見張りが
    // 出した訪問のイベントもこの受け口へ戻ってくる（`visit-watch.ts`）。
    if (origin === "driver") {
      tally.visit.observe(event, at)
    }
  }

  /**
   * 駆動を1代起こし、その代ぶんの勘定をまとめて作る。**起こし直し（`restart`）はこれを丸ごと
   * 呼び直すこと**なので、勘定を1つ足しても空へ戻す場所を書き足さなくてよい。
   */
  const startGeneration = (
    request: SessionLaunchRequest,
    delivery: "immediate" | "after-hello",
  ): SessionGeneration => {
    bornCount += 1
    const born = bornCount
    // 起き上がった駆動を入れる可変の入れ物（起き上がるまでは空）。
    let live: SessionDriver | undefined = undefined
    // **起こし直しの代は、新しい `hello` を配るまで束を配らない。** 駆動が起き上がるまでの数秒に
    // 流れたイベント（`chat-mode-changed` など）を先に配ると、ブラウザは前のセッションの姿の
    // まま雑談 / 仕事へ切り替わり、前の立ち絵が一瞬出てから `hello` で入れ替わる。その間の
    // 姿は `hello` に入るので、配らずに捨ててよい。
    let held = delivery === "after-hello"
    // 振り返りの書き手を中断する信号（代の持ち物）。
    const diaryAbort = new AbortController()
    const tally: GenerationTally = {
      batch: createEventBatch({
        intervalMs: options.batchIntervalMs,
        deliver: (events) => {
          if (!held) {
            publish({ type: "events", events }, subscribers)
          }
        },
      }),
      chatCompact: createChatCompactWatch(options.chatCompactThresholdBytes),
      tokenUsage: createTokenUsageRecorder(options.tokenUsageLog),
      liveDriver: () => live,
      visit: createVisitWatch({
        ...options.visit,
        now: options.now,
        readState: () => state,
        emit: (event) => {
          receiveIfCurrent(event, "driver")
        },
      }),
      diarySignal: diaryAbort.signal,
    }
    const receiveIfCurrent = (event: SessionEvent, origin: EventOrigin): void => {
      if (born !== bornCount) {
        return
      }
      receive(tally, event, origin)
    }

    const driver = options.launchSession(
      (event) => {
        receiveIfCurrent(event, "driver")
      },
      (event) => {
        receiveIfCurrent(event, "restored")
      },
      request,
    )
    void driver.then(
      (started) => {
        // 起き上がる前に閉じた・起こし直したときは、その場で閉じる（駆動を取り残さない）。
        if (closed || born !== bornCount) {
          started.close()
          return
        }
        live = started
      },
      () => {
        // 起こせなかったことは、待っている側（restart / askDriver）が拾う。
      },
    )

    return {
      ...tally,
      driver,
      close: () => {
        live?.close()
        tally.batch.discard()
        tally.visit.close()
        diaryAbort.abort()
      },
      announce: () => {
        held = false
      },
      emit: (event) => {
        receiveIfCurrent(event, "driver")
      },
    }
  }

  // **起動時は覚えない** — その回だけの指定（`TSUKUMO_CHARACTER`）や同梱の既定が次の起動の
  // 初期値として残らないように（docs/screen-design.md 13.6）。
  let generation = startGeneration(
    {
      selection: { by: "initial" },
      chat: undefined,
      resume: { by: "latest" },
    },
    "immediate",
  )

  /**
   * 駆動を起こし直す（docs/design.md 7章。**そのパックのセッションの
   * 続きから始まる** — 会話が繋がるかどうかは、起こす側が `resume` に何を渡すかで決まる）。
   * **契機は3つ**: 別のキャラクターパックに切り替えたとき（`session.switchCharacter`）、
   * 雑談モードを切り替えたとき（`session.setChatMode`。`systemPrompt` を差し替えるため。
   * `docs/chat-mode.md` 4.9）、画面から別のセッションを選んだとき（`session.switchSession`。
   * `docs/requirements.md` 4.8）。
   * **画面は初期状態に戻す** — 吹き出し・立ち絵・メインビューの3つを消して、新しい `hello` を
   * 配り直す。起こし直しの間に届いたイベント（新しい `character-changed`・組み直した履歴など）は
   * その `hello` の状態に入っているので、二重に配らない。
   *
   * 起こし直しに失敗しても**常駐プロセスは落とさない**（`askDriver` と同じ扱いで、
   * 定型文の理由を返すだけ。docs/coding-standards.md「エラーハンドリング」）。
   */
  const restart = async (request: SessionLaunchRequest): Promise<DispatchResult> => {
    try {
      generation.close()
      // **`previousUsageReview` だけは起こし直しをまたいで残す**——ホームのファイルに残る
      // 記録であって、駆動1代の持ち物ではない（`usageReview` は起こし直すとふだんへ戻る。
      // `docs/design.md`「見直しのツールと状態」）。
      replaceState({ ...INITIAL_SESSION_STATE, previousUsageReview: state.previousUsageReview })
      generation = startGeneration(request, "after-hello")
      await generation.driver
      announceGeneration()
      return { ok: true }
    } catch {
      // 起こせなくても、組み直した姿（キャラクター・モード）は `hello` で配り、束も止めたままに
      // しない（見た目の編集などで積んだイベントが、次の起こし直しまで届かなくなる）。
      announceGeneration()
      return { ok: false, reason: FRAME_ERROR_REASON.driverFailed }
    }
  }

  /** 起こし直した代の姿を `hello` で配り直し、それより前に積んだぶんは捨てて束を配り始める。 */
  const announceGeneration = (): void => {
    generation.batch.discard()
    publish(helloFrame(), subscribers)
    generation.announce()
  }

  // 受け手へ見せる口。**代は呼ばれたその時点のもの**を返す（起こし直しをまたいで持ち回らない）。
  const commandSession: CommandSession = {
    state: () => state,
    driver: () => generation.driver,
    restart,
    generation: () => ({ emit: generation.emit, diarySignal: generation.diarySignal }),
  }

  return {
    commandSession,
    readContextUsage: async () => {
      // 起こし直しの最中・起こせなかったときは駆動そのものが無い。**画面の札が1枚出ない
      // だけ**で、常駐プロセスは落とさない（`askDriver` と同じ扱い）。
      try {
        const started = await generation.driver
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
      subscribers.clear()
      generation.close()
    },
  }
}

/** 購読者全員に配る。閉じかけている接続を無視するのは送る側（src/server/view-server/adapter/session-socket.ts）の仕事。 */
function publish(frame: ServerFrame, subscribers: ReadonlySet<(frame: ServerFrame) => void>): void {
  for (const send of subscribers) {
    send(frame)
  }
}
