// セッションを起こす一続き。**パックを決めて
// 続きのセッションを探し、駆動を起こし、復元した履歴と `character-changed` を流すまでの順序**を
// 持つのがここで、起動時（`session-manager.create`）と起こし直し（`session-manager.restart`。
// `switch-character` と `set-chat-mode`）の3つともこの1つを通る。
//
// **画面を初期状態に戻すかどうかは持たない** — それは起こし直しだけの判断で、
// `src/server/core/session-manager.ts` の `restart` にある。ここは「どちらから来ても同じ順序」だけ。
//
// 外の世界（パックの読み込み・覚えた値・claude の transcript・見張り）には触らず、すべて
// 渡された関数（{@link SessionLaunchPorts}）越しに頼む。結ぶのは配線層（`src/session-start.ts`）。

import { type SessionEvent } from "../../shared/session-event.ts"
import { type CharacterSelection, type NamedCharacterPack } from "./character-selection.ts"
import { type SessionDriver } from "./session-driver.ts"

/** 駆動と同じ間だけ動く見張り（いまは `develop/tasks.json`）。駆動を閉じると一緒に閉じる。 */
export type SessionWatcher = { readonly close: () => void }

/** これから起こす駆動の種。**`core` はパックの中身を知らない**ので、決まった3つだけを渡す。 */
export type SessionLaunchSeed<Pack extends NamedCharacterPack> = {
  readonly pack: Pack
  /** 続きから始めるセッションのID（新規に起こすときは undefined）。 */
  readonly resume: string | undefined
  /**
   * 雑談モードで起こすか（`docs/requirements.md` 4.9）。**`systemPrompt` はセッションを
   * 起こすときに固定される**ので、レポートの記法を外すにはここで決まっている必要がある。
   */
  readonly chat: boolean
}

/**
 * 起こす（起こし直す）ときの指定。**起こし方は3つ**で、パックの決め方（{@link CharacterSelection}）が
 * そのまま「覚えるかどうか」も分ける:
 *
 * | 起こし方           | `selection`     | 覚えるか |
 * | ------------------ | --------------- | -------- |
 * | 起動               | `initial`       | 覚えない |
 * | `switch-character` | `name`          | **覚える** |
 * | `set-chat-mode`    | `current`       | 覚えない |
 */
export type SessionLaunchRequest = {
  /** これから起こすパックの決め方。 */
  readonly selection: CharacterSelection
  /** 雑談モードで起こすか。undefined なら仕事（既定）。 */
  readonly chat: boolean | undefined
}

/** 一続きの中で外の世界に頼むこと。実装はすべて配線層（`src/session-start.ts`）が `adapter` から渡す。 */
export type SessionLaunchPorts<Pack extends NamedCharacterPack> = {
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
   * そのパックの、そのモードの続きから始めるセッションを探す（無ければ undefined ＝ 新規に
   * 起こす）。**雑談と仕事は別のセッション**なので、引く印も分かれる
   * （`docs/requirements.md` 4.9）。
   */
  readonly findResumeSession: (pack: Pack, chat: boolean) => Promise<string | undefined>
  /** 駆動を1つ起こす（本物か偽物かはここが選ぶ）。 */
  readonly startDriver: (
    seed: SessionLaunchSeed<Pack>,
    onEvent: (event: SessionEvent) => void,
  ) => SessionDriver
  /** 前のセッションの記録を、画面に出す形のイベントに組み直す。 */
  readonly restoreEvents: (sessionId: string, pack: Pack) => Promise<readonly SessionEvent[]>
}

/**
 * セッションを起こす関数を作る（`session-manager` の `startDriver` にそのまま渡せる形）。
 *
 * 順序は**起動時も起こし直しも同じ**:
 * パックを決める → 画面から名前が届いたときだけ覚える → `character-changed` と `chat-mode-changed` を
 * 流す → 見張りを起こす → 続きのセッションを探す → 駆動を起こす → 続きから始まったなら履歴を
 * 組み直す。
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
    // **起こし直すと状態が初期値へ戻る**ので、雑談かどうかもここで流し直す（画面は
    // `chat-mode-changed` でしか知れない。`docs/requirements.md` 4.9）。
    onEvent({ kind: "chat-mode-changed", chat })

    const watcher = ports.watchTasks(onEvent)
    // **キャラクターごと・モードごとに別のセッションを持つ**（docs/design.md 7章、
    // docs/requirements.md 4.9）。起動時も切り替え時も、これから起こす側の続きを探す。
    const resume = await ports.findResumeSession(pack, chat)
    const driver = ports.startDriver({ pack, resume, chat }, onEvent)

    if (resume !== undefined) {
      void replayRestoredSession(ports, resume, pack, onRestoredEvent)
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
