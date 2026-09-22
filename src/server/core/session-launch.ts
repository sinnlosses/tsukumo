// セッションを起こす一続き。**パックを決めて
// 続きのセッションを探し、駆動を起こし、復元した履歴と `character-changed` を流すまでの順序**を
// 持つのがここで、起動時（`session-manager.create`）と起こし直し（`session-manager.restart`。
// `switch-character` / `set-chat-mode` / `switch-session`）の4つともこの1つを通る。
//
// **画面を初期状態に戻すかどうかは持たない** — それは起こし直しだけの判断で、
// `src/server/core/session-manager.ts` の `restart` にある。ここは「どちらから来ても同じ順序」だけ。
//
// 外の世界（パックの読み込み・覚えた値・claude の transcript・見張り）には触らず、すべて
// 渡された関数（{@link SessionLaunchPorts}）越しに頼む。結ぶのは配線層（`src/session-start.ts`）。

import { type SessionChoice } from "../../shared/session-choice.ts"
import { type SessionEvent } from "../../shared/session-event.ts"
import { type Workspace } from "../../shared/workspace.ts"
import { type CharacterSelection, type NamedCharacterPack } from "./character-selection.ts"
import { type SessionDriver, type SessionStart } from "./session-driver.ts"

/** 駆動と同じ間だけ動く見張り（いまは `develop/tasks.json`）。駆動を閉じると一緒に閉じる。 */
export type SessionWatcher = { readonly close: () => void }

/** これから起こす駆動の種。**`core` はパックの中身を知らない**ので、決まった3つだけを渡す。 */
export type SessionLaunchSeed<Pack extends NamedCharacterPack> = {
  readonly pack: Pack
  /** 新規に起こすか、続きから始めるか（`SessionStart`）。 */
  readonly start: SessionStart
  /**
   * 雑談モードで起こすか（`docs/requirements.md` 4.9）。**`systemPrompt` はセッションを
   * 起こすときに固定される**ので、レポートの記法を外すにはここで決まっている必要がある。
   */
  readonly chat: boolean
}

/**
 * 起こす（起こし直す）ときの指定。**起こし方は4つ**で、パックの決め方（{@link CharacterSelection}）が
 * そのまま「覚えるかどうか」も分ける:
 *
 * | 起こし方           | `selection`     | `resume` | 覚えるか |
 * | ------------------ | --------------- | -------- | -------- |
 * | 起動               | `initial`       | `latest` | 覚えない |
 * | `switch-character` | `name`          | `latest` | **覚える** |
 * | `set-chat-mode`    | `current`       | `latest` | 覚えない |
 * | `switch-session`   | `current`       | `id`     | 覚えない |
 */
export type SessionLaunchRequest = {
  /** これから起こすパックの決め方。 */
  readonly selection: CharacterSelection
  /** 雑談モードで起こすか。undefined なら仕事（既定）。 */
  readonly chat: boolean | undefined
  /** これから起こすセッションの決め方。 */
  readonly resume: SessionResume
}

/**
 * これから起こすセッションの決め方。**「印から探す」と「画面から選ばれたID」を1つの欄で
 * 兼ねない**ための判別可能な合併型（{@link CharacterSelection} と同じ形。`undefined` を
 * 「探す」の意味に使うと、探した結果の「見つからなかった」と区別できない）。
 */
export type SessionResume =
  /** 印から最新の1つを探す（起動・`switch-character`・`set-chat-mode`）。 */
  | { readonly by: "latest" }
  /**
   * 画面から選ばれたセッション（`switch-session`）。**探さない** — 一覧に出したIDをそのまま
   * 続きにする。claude 側が知らないIDだったときは新規のセッションとして起き上がる。
   */
  | { readonly by: "id"; readonly sessionId: string }

/** 一続きの中で外の世界に頼むこと。実装はすべて配線層（`src/session-start.ts`）が `adapter` から渡す。 */
export type SessionLaunchPorts<Pack extends NamedCharacterPack> = {
  /**
   * いま動いている場所（起動時に1回決まり、**プロセスが動いている間は変わらない**）。
   * 頼みごとではなく値なのは、`adapter` に聞き直す必要が無いから——起こし直すたびに
   * 画面へ流し直すためだけにここが持つ。
   */
  readonly workspace: Workspace
  /**
   * これから起こすパックを決める。**決め方の3つ（起動時の初期パック・画面から選ばれた名前・
   * いま出しているパックのまま）を持ち主が区別する**ので、ここは選び方をそのまま渡すだけ。
   * 知らない名前が既定へ落ちるのも呼ばれた側（`selectCharacterPack`）の仕事。
   */
  readonly choosePack: (selection: CharacterSelection) => Pack
  /** 画面から選んだパックを覚える（次の起動の初期値になる）。 */
  readonly rememberPack: (pack: Pack) => void
  /** いま出しているパックを画面へ流す形（立ち絵の URL・選択肢・画面から変えられるか）。 */
  readonly characterEvent: (pack: Pack) => SessionEvent
  /** 駆動と同じ間だけ動く見張りを起こす。流すイベントは駆動のものと同じ受け口へ。 */
  readonly watchTasks: (onEvent: (event: SessionEvent) => void) => SessionWatcher
  /**
   * そのパックの、そのモードの続きから始めるセッションを探す（見つからなければ
   * `{ kind: "new" }`）。**雑談と仕事は別のセッション**なので、引く印も分かれる
   * （`docs/requirements.md` 4.9）。
   */
  readonly findResumeSession: (pack: Pack, chat: boolean) => Promise<SessionStart>
  /** 駆動を1つ起こす（本物か偽物かはここが選ぶ）。 */
  readonly startDriver: (
    seed: SessionLaunchSeed<Pack>,
    onEvent: (event: SessionEvent) => void,
  ) => SessionDriver
  /**
   * いま切り替え先として選べるセッションを一覧にする（**同じパックの、同じモードのもの
   * だけ**。`docs/requirements.md` 4.8）。読めなかったときは空。
   *
   * **{@link SessionLaunchPorts.findResumeSession} とは別の口**にしてあるのは、問いが違うから
   * （「続きはどれか」と「他にどれへ行けるか」）。どちらも同じ transcript の一覧を読むが、
   * 起こすのは起動と起こし直しのときだけなので、読む回数を惜しまない。
   */
  readonly listSessions: (pack: Pack, chat: boolean) => Promise<readonly SessionChoice[]>
  /** 前のセッションの記録を、画面に出す形のイベントに組み直す。 */
  readonly restoreEvents: (sessionId: string, pack: Pack) => Promise<readonly SessionEvent[]>
}

/**
 * セッションを起こす関数を作る（`session-manager` の `startDriver` にそのまま渡せる形）。
 *
 * 順序は**起動時も起こし直しも同じ**:
 * パックを決める → 画面から名前が届いたときだけ覚える → `character-changed` と `workspace` と
 * `chat-mode-changed` を流す → 見張りを起こす → 続きのセッションを決める → 切り替え先の一覧を流す → 駆動を起こす →
 * 続きから始まったなら履歴を組み直す。
 *
 * **受け口は2つ。** `onEvent` は駆動（と見張り）から新しく届くイベント、`onRestoredEvent` は
 * 前のセッションの記録を組み直した再生だけを流す（`docs/design.md` 7章「雑談の会話のアーカイブは
 * どこに置くか」の「誰がいつ書くか」）。**畳み方と配り方はどちらも同じ**（呼び出し側
 * — `session-manager` — が両方を同じように畳む）。分けるのは「どちらの口から来たか」を
 * 呼び出し側が知れるようにするためだけ。
 */
export function createSessionLaunch<Pack extends NamedCharacterPack>(
  ports: SessionLaunchPorts<Pack>,
): (
  onEvent: (event: SessionEvent) => void,
  onRestoredEvent: (event: SessionEvent) => void,
  request: SessionLaunchRequest,
) => Promise<SessionDriver> {
  return async (onEvent, onRestoredEvent, request) => {
    const { selection } = request
    const chat = request.chat ?? false
    const pack = ports.choosePack(selection)
    // **覚えるのは画面から名前が届いたときだけ。** 起動時やモードの切り替えでも覚えると、
    // その回だけの指定（`TSUKUMO_CHARACTER`）や同梱の既定が次の起動の初期値として残ってしまう
    // （docs/design.md 13.6）。
    if (selection.by === "name") {
      ports.rememberPack(pack)
    }
    onEvent(ports.characterEvent(pack))
    // **どこで動いているかも流し直す。** claude の作業先（worktree）と tsukumo のコードの
    // 出所（元の作業ツリー）は常に食い違うので、読み取れない状態にしない（T-349 の決定2）。
    onEvent({ kind: "workspace", workspace: ports.workspace })
    // **起こし直すと状態が初期値へ戻る**ので、雑談かどうかもここで流し直す（画面は
    // `chat-mode-changed` でしか知れない。`docs/requirements.md` 4.9）。
    onEvent({ kind: "chat-mode-changed", chat })

    const watcher = ports.watchTasks(onEvent)
    // **キャラクターごと・モードごとに別のセッションを持つ**（docs/design.md 7章、
    // docs/requirements.md 4.9）。起動時も切り替え時も、これから起こす側の続きを探す。
    // **画面から選ばれたときだけは探さない**（選ばれたIDがそのまま続きになる）。
    const start: SessionStart =
      request.resume.by === "id"
        ? { kind: "resume", sessionId: request.resume.sessionId }
        : await ports.findResumeSession(pack, chat)
    // **切り替え先の一覧も、起こすたびに引き直す**（画面はこのイベントでしか一覧を知れない。
    // 起こし直すと状態が初期値へ戻るので、`character-changed` と同じ扱い）。**どれを出して
    // いるかも一緒に流す**ので、最初の依頼を送る前でも画面は居場所を指せる。**画面へ渡す形
    // （`current: string | undefined`）はここで畳む**——`SessionStart` は core と adapter の
    // 間の語彙で、画面へ運ぶ語彙ではない。
    onEvent({
      kind: "sessions-changed",
      sessions: await ports.listSessions(pack, chat),
      current: start.kind === "resume" ? start.sessionId : undefined,
    })
    const driver = ports.startDriver({ pack, start, chat }, onEvent)

    if (start.kind === "resume") {
      void replayRestoredSession(ports, start.sessionId, pack, onRestoredEvent)
    }

    return {
      ...driver,
      close: () => {
        watcher.close()
        driver.close()
      },
    }
  }
}

/**
 * 前のセッションの記録を組み直して流す。**claude 側の会話は続きから始めること自体が繋いでいる**
 * ので、ここが失敗しても駆動は動き続ける（読めなかったぶんの履歴が画面に出ないだけ。
 * docs/requirements.md 4.8「復元できなかったときどうするか」）。
 *
 * 組み上がるのはこのプロセスのメモリの中だけで、**どこにも書き出さない**
 * （docs/coding-standards.md「会話内容の扱い」）。**駆動から新しく届くイベントとは別の口
 * （`onRestoredEvent`）へ流す**ので、呼び出し側はどちらから来たかを区別できる。
 */
async function replayRestoredSession<Pack extends NamedCharacterPack>(
  ports: SessionLaunchPorts<Pack>,
  sessionId: string,
  pack: Pack,
  onRestoredEvent: (event: SessionEvent) => void,
): Promise<void> {
  try {
    for (const event of await ports.restoreEvents(sessionId, pack)) {
      onRestoredEvent(event)
    }
  } catch {
    // 履歴が出ないだけで、セッションそのものは続く。
  }
}
