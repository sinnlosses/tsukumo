// セッションを起こす一続き。**パックを決めて
// 続きのセッションを探し、駆動を起こし、復元した履歴と `character-changed` を流すまでの順序**を
// 持つのがここで、起動時（`session-manager.create`）と `switch-character` の起こし直し
// （`session-manager.restart`）の両方がこの1つを通る。
//
// **画面を初期状態に戻すかどうかは持たない** — それは起こし直しだけの判断で、
// `src/core/session-manager.ts` の `restart` にある。ここは「どちらから来ても同じ順序」だけ。
//
// 外の世界（パックの読み込み・覚えた値・claude の transcript・見張り）には触らず、すべて
// 渡された関数（{@link SessionLaunchPorts}）越しに頼む。結ぶのは配線層（`src/cli.ts`）。

import { type SessionEvent } from "../shared/session-event.ts"
import { type NamedCharacterPack } from "./character-selection.ts"
import { type SessionDriver } from "./session-driver.ts"

/** 駆動と同じ間だけ動く見張り（いまは `develop/tasks.json`）。駆動を閉じると一緒に閉じる。 */
export type SessionWatcher = { readonly close: () => void }

/** これから起こす駆動の種。**`core` はパックの中身を知らない**ので、決まった2つだけを渡す。 */
export type SessionLaunchSeed<Pack extends NamedCharacterPack> = {
  readonly pack: Pack
  /** 続きから始めるセッションのID（新規に起こすときは undefined）。 */
  readonly resume: string | undefined
}

/** 一続きの中で外の世界に頼むこと。実装はすべて配線層（`src/cli.ts`）が `adapter` から渡す。 */
export type SessionLaunchPorts<Pack extends NamedCharacterPack> = {
  /**
   * これから起こすパックを決める。**`character` が入っているのは画面から選んだときだけ**で、
   * 無ければ起動時の初期パック（`selectInitialCharacterPack` の結果）。知らない名前が
   * 既定へ落ちるのも呼ばれた側（`selectCharacterPack`）の仕事。
   */
  readonly choosePack: (character: string | undefined) => Pack
  /** 画面から選んだパックを覚える（次の起動の初期値になる）。 */
  readonly rememberPack: (pack: Pack) => void
  /** いま出しているパックを画面へ流す形（立ち絵の URL・選択肢・画面から変えられるか）。 */
  readonly characterEvent: (pack: Pack) => SessionEvent
  /** 駆動と同じ間だけ動く見張りを起こす。流すイベントは駆動のものと同じ受け口へ。 */
  readonly watchTasks: (onEvent: (event: SessionEvent) => void) => SessionWatcher
  /** そのパックの、続きから始めるセッションを探す（無ければ undefined ＝ 新規に起こす）。 */
  readonly findResumeSession: (pack: Pack) => Promise<string | undefined>
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
 * パックを決める → 画面から選んだときだけ覚える → `character-changed` を流す → 見張りを起こす →
 * 続きのセッションを探す → 駆動を起こす → 続きから始まったなら履歴を組み直す。
 */
export function createSessionLaunch<Pack extends NamedCharacterPack>(
  ports: SessionLaunchPorts<Pack>,
): (
  onEvent: (event: SessionEvent) => void,
  character: string | undefined,
) => Promise<SessionDriver> {
  return async (onEvent, character) => {
    const pack = ports.choosePack(character)
    // **覚えるのは画面から選んだときだけ。** 起動時にも覚えると、その回だけの指定や同梱の既定が
    // 次の起動の初期値として残ってしまう（docs/design.md 13.6）。
    if (character !== undefined) {
      ports.rememberPack(pack)
    }
    onEvent(ports.characterEvent(pack))

    const watcher = ports.watchTasks(onEvent)
    // **キャラクターごとに別のセッションを持つ**（docs/design.md 7章）。起動時も切り替え時も、
    // これから起こすパックの続きを探す。
    const resume = await ports.findResumeSession(pack)
    const driver = ports.startDriver({ pack, resume }, onEvent)

    if (resume !== undefined) {
      void replayRestoredSession(ports, resume, pack, onEvent)
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
 * （docs/coding-standards.md「会話内容の扱い」）。
 */
async function replayRestoredSession<Pack extends NamedCharacterPack>(
  ports: SessionLaunchPorts<Pack>,
  sessionId: string,
  pack: Pack,
  onEvent: (event: SessionEvent) => void,
): Promise<void> {
  try {
    for (const event of await ports.restoreEvents(sessionId, pack)) {
      onEvent(event)
    }
  } catch {
    // 履歴が出ないだけで、セッションそのものは続く。
  }
}
