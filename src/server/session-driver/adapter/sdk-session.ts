// Claude Code が手元に持つセッションの一覧・transcript・印（`listSessions` / `getSessionMessages` / `tagSession`）。
// セッションの一覧を読む・履歴を読み直す・ターンの終わりに印を付け直す。
// 選ぶ計算と履歴への変換は core 側が持ち、ここは SDK を呼ぶだけ。
//
// 読んだ transcript の内容はイベントの流れに渡すだけで、どこにも書き出さない。

import {
  getSessionInfo,
  getSessionMessages,
  listSessions,
  renameSession,
  tagSession,
} from "@anthropic-ai/claude-agent-sdk"

import {
  type ExpressionChoice,
  expressionNames as toExpressionNames,
} from "../../../shared/character-pack/expression-choice.ts"
import {
  type SessionDigest,
  UNAVAILABLE_SESSION_DIGEST,
} from "../../../shared/session/session-digest.ts"
import type { RestoredEvent } from "../../../shared/session/session-event.ts"
import { createSessionDigestCache, type TranscriptStamp } from "../core/session-digest-cache.ts"
import { toSessionDigest } from "../core/session-digest.ts"
import type { SessionDriverOptions } from "../core/session-driver.ts"
import { toRestoredEvents } from "../core/session-restore.ts"
import {
  decideSessionTitle,
  INITIAL_SESSION_TITLE_STATE,
  noteConversationCleared,
  type SessionTitleState,
} from "../core/session-title.ts"
import { readInputLedger } from "./input-ledger-file.ts"

/**
 * 同じリポジトリのセッションの一覧を SDK から読む（印で絞るのと、続きを選ぶのは core 側）。
 * 読めなかったときは投げる。
 *
 * `includeWorktrees` を入れてあるのは、セッションごとに別の worktree で起こされうるため（作業ツリーを用意するのは orca の側）。
 * 起こすたびに違うディレクトリなら、作業ディレクトリだけで絞ると前の続きが一度も見つからなくなる。
 * 同じリポジトリの worktree を全部見たうえで、印のパックとモード（目印を除いた `tsukumo:<パック>`）で絞る。
 */
export async function listRepositorySessions(cwd: string): Promise<unknown> {
  return listSessions({ dir: cwd, includeWorktrees: true })
}

/**
 * 前のセッションの transcript を読み直して、画面の履歴を組み直すためのイベントにする。
 * 読めなければ空（会話（`resume`）だけ生きていれば続行する）。
 *
 * `includeSystemMessages: true` を渡す。
 * 既定では `system` のメッセージ（`compact_boundary` を含む）が返らず、`getSessionMessages` は親子の鎖をたどるので、圧縮が起きたセッションではそこより前が返らない。
 * 他の `system` メッセージが混ざっても、`toSessionEvents` 側が知らない種別を空へ倒すので落ちない。
 *
 * `dir` は渡さない（SDK 側はすべてのプロジェクトから探す）。
 * 続きから始めるセッションは別の worktree で起きたものでありうるので、いまの作業ディレクトリで絞ると見つからない。
 * 指しているのは一意なセッションIDなので、絞らなくても別のものには当たらない。
 *
 * 入力の種類とターンの終わり方は、そのセッションの入力の控え（`readInputLedger`）から引く。
 */
export async function readRestoredEvents(
  sessionId: string,
  expressions: readonly ExpressionChoice[],
): Promise<readonly RestoredEvent[]> {
  try {
    return toRestoredEvents(
      await getSessionMessages(sessionId, { includeSystemMessages: true }),
      toExpressionNames(expressions),
      readInputLedger(sessionId),
    )
  } catch {
    return []
  }
}

/**
 * セッション1件の中身（依頼の数・要約・最後のセリフ）を transcript から読む口を1つ作る。駆動1つに1つ。
 * `dir` を渡さない理由と `includeSystemMessages` を入れる理由は {@link readRestoredEvents}。
 * 読めなければ「読めない」（切り替え画面の右が空になるだけ）。
 *
 * transcript の更新時刻と大きさが前に読んだときと同じなら、読み直さずに前の中身を返す。
 * 印は読む前に取るので、読んでいる間に伸びた分は次の呼び出しで読み直される。
 */
export function createSessionDigestReader(
  expressions: readonly ExpressionChoice[],
): (sessionId: string) => Promise<SessionDigest> {
  const cache = createSessionDigestCache()

  return async (sessionId) => {
    try {
      const stamp = await readTranscriptStamp(sessionId)
      const cached = stamp === undefined ? undefined : cache.get(sessionId, stamp)
      if (cached !== undefined) {
        return cached
      }

      const digest = toSessionDigest(
        await getSessionMessages(sessionId, { includeSystemMessages: true }),
        toExpressionNames(expressions),
      )
      if (stamp !== undefined) {
        cache.set(sessionId, stamp, digest)
      }
      return digest
    } catch {
      return UNAVAILABLE_SESSION_DIGEST
    }
  }
}

/**
 * セッションに tsukumo の印を付け、付いたら `onSessionMarked` で知らせる。失敗しても続行する。
 * 付かなかったときに起きるのは「次回は新規から始まる」ことだけで、いま動いているセッションには影響しない。
 *
 * ターンが終わるたびに（`result` の直後に）呼ぶ。`init` の直後はまだ transcript が無く、SDK が投げる。
 * 印は末尾 64 KiB の外へ押し出されると消えるので、1回付ければ済むものではない（`docs/requirements.md`「4.8 セッションの復元」）。
 */
export async function markSession(sessionId: string, options: SessionDriverOptions): Promise<void> {
  try {
    await tagSession(sessionId, options.tag, { dir: options.cwd })
    options.onSessionMarked(sessionId)
  } catch {
    // 印が付かないだけなので、何も流さずに諦める。
  }
}

/**
 * Claude が `report` で付けた題を書く役。
 * 書くかどうかの判断は {@link decideSessionTitle}（core）が持ち、ここは SDK を呼ぶだけ。
 */
export type SessionTitleWriter = {
  /** ターンの終わり（`result` の直後）に、書けそうなら書く。 */
  readonly write: (
    sessionId: string,
    candidate: string,
    options: SessionDriverOptions,
  ) => Promise<void>
  /**
   * `/clear` の合図を受けたことを伝える。
   * Claude Code が前のセッションの題を新しいセッションへ書き写すため、次に書くときだけ現在値を tsukumo が最後に書いたものとみなす（{@link noteConversationCleared}）。
   */
  readonly noteConversationCleared: () => void
}

/**
 * {@link SessionTitleWriter} を1つ作る。セッション1つに1つ。
 * 「tsukumo が最後に書いた題」（{@link SessionTitleState}）をこの中に閉じ込め、呼び出し側には見せない。
 */
export function createSessionTitleWriter(): SessionTitleWriter {
  let state: SessionTitleState = INITIAL_SESSION_TITLE_STATE

  const writeTitle = async (
    sessionId: string,
    candidate: string,
    options: SessionDriverOptions,
  ): Promise<void> => {
    try {
      const info = await getSessionInfo(sessionId, { dir: options.cwd })
      const action = decideSessionTitle(state, candidate, info?.customTitle)
      // `renameSession` の成否に関わらず、この判断で `adoptCurrentTitleNext` は使い切る。
      // `lastWritten` は実際に書けたときだけ進めたいので、ここでは触らない。
      state = { ...state, adoptCurrentTitleNext: false }
      if (action.kind === "write") {
        await renameSession(sessionId, action.title, { dir: options.cwd })
        state = { ...state, lastWritten: action.title }
      }
    } catch {
      // 題が書けなかっただけなので、何も流さずに諦める。
    }
  }

  return {
    write: writeTitle,
    noteConversationCleared() {
      state = noteConversationCleared(state)
    },
  }
}

/** transcript の印。大きさの分からない保存先・印が読めなかったときは undefined（毎回読む）。 */
async function readTranscriptStamp(sessionId: string): Promise<TranscriptStamp | undefined> {
  try {
    const info = await getSessionInfo(sessionId)
    return info?.fileSize === undefined
      ? undefined
      : { lastModified: info.lastModified, fileSize: info.fileSize }
  } catch {
    return undefined
  }
}
