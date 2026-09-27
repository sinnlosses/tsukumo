// Claude Code が手元に持つセッションの一覧・transcript・印（`listSessions` /
// `getSessionMessages` / `tagSession`）。続きから始めるセッションを探す・切り替え先を並べる・
// 履歴を読み直す・ターンの終わりに印を付け直す（`docs/requirements.md`「セッションの復元」）。
// 選ぶ計算と履歴への変換は core 側が持ち、ここは SDK を呼ぶだけ。

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
import type { SessionChoice } from "../../../shared/session/session-choice.ts"
import {
  type SessionDigest,
  UNAVAILABLE_SESSION_DIGEST,
} from "../../../shared/session/session-digest.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { toSessionDigest } from "../core/session-digest.ts"
import type { SessionDriverOptions } from "../core/session-driver.ts"
import {
  listMarkedSessions,
  selectSessionToResume,
  toRestoredEvents,
} from "../core/session-restore.ts"
import {
  decideSessionTitle,
  INITIAL_SESSION_TITLE_STATE,
  noteConversationCleared,
  type SessionTitleState,
} from "../core/session-title.ts"

/**
 * ターンが終わってから印（`tagSession`）を付け直すまでの待ち。本体もターンの終わりに
 * セッションの要約を自分で書き、そこに印が含まれないので、書き込みと重なると印が消える
 * （実測: `init` の直後・`result` の直後に付けた印はどちらも消え、ターンの3秒後に
 * 付けた印は入力を閉じたあとまで残った）。ターンが終わるたびに付け直すので、途中の1回が
 * 消えても次のターンで戻る。
 */
const SESSION_TAG_DELAY_MS = 3_000

/**
 * 続きから始めるセッションを探す（起動時と、キャラクターを切り替えるたび。
 * `docs/requirements.md`「セッションの復元」）。同じ作業ディレクトリで、渡された印を持つもののうち最新の1つを
 * 返し、無ければ undefined（新規に起こす）。
 *
 * `includeWorktrees` を入れてあるのは、セッションごとに別の worktree で起こされうるため
 * （作業ツリーを用意するのは orca の側）。起こすたびに違うディレクトリなら、作業ディレクトリ
 * だけで絞ると前の続きが一度も見つからなくなる。同じリポジトリの worktree を全部見たうえで、
 * 印（`tsukumo:<パック>@<ポート>`）で絞る。
 *
 * 一覧が読めなくても落とさない（前提不足ではなく動作中の一時的な失敗として扱い、新規に
 * 起こす。docs/coding-standards.md「エラーハンドリング」）。
 */
export async function findSessionToResume(cwd: string, tag: string): Promise<string | undefined> {
  try {
    return selectSessionToResume(await listSessions({ dir: cwd, includeWorktrees: true }), tag)
  } catch {
    return undefined
  }
}

/**
 * 切り替え先として選べるセッションを一覧にする（切り替え画面。
 * `docs/requirements.md`「セッションの復元」）。絞り込みと並びは `listMarkedSessions` が決める。
 *
 * 絞り込みの鍵も `includeWorktrees` を入れる理由も {@link findSessionToResume} と同じで、違うのは
 * 「最新の1つ」ではなく「同じ印を持つものを全部」返すところだけ。
 *
 * 一覧が読めなくても落とさない（切り替えの選択肢が出ないだけ。
 * docs/coding-standards.md「エラーハンドリング」）。
 */
export async function listSwitchableSessions(
  cwd: string,
  tag: string,
): Promise<readonly SessionChoice[]> {
  try {
    return listMarkedSessions(await listSessions({ dir: cwd, includeWorktrees: true }), tag)
  } catch {
    return []
  }
}

/**
 * 前のセッションの transcript を読み直して、画面の履歴を組み直すためのイベントにする
 * （`docs/requirements.md`「セッションの復元」）。読めなければ空（会話（`resume`）だけ生きていれば続行する）。
 *
 * `includeSystemMessages: true` を渡す。既定では `system` のメッセージ
 * （`compact_boundary` を含む）が返らず、`getSessionMessages` は親子の鎖をたどるので、圧縮が
 * 起きたセッションではそこより前が既定では返らない（docs/glossary.md「圧縮の区切り」）。
 * 他の `system` メッセージが混ざっても、`toSessionEvents` 側が知らない種別を空へ倒すので落ちない。
 *
 * `dir` は渡さない（SDK 側はすべてのプロジェクトから探す）。続きから始めるセッションは
 * 別の worktree で起きたものでありうるので、いまの作業ディレクトリで絞ると見つからない
 * （`findSessionToResume` が `includeWorktrees` を入れてあるのと同じ理由）。指しているのは
 * 一意なセッションIDなので、絞らなくても別のものには当たらない。
 *
 * 読んだ内容はそのままイベントの流れに渡すだけで、どこにも書き出さない
 * （docs/coding-standards.md「会話内容の扱い」）。
 */
export async function readRestoredEvents(
  sessionId: string,
  expressions: readonly ExpressionChoice[],
): Promise<readonly SessionEvent[]> {
  try {
    return toRestoredEvents(
      await getSessionMessages(sessionId, { includeSystemMessages: true }),
      toExpressionNames(expressions),
    )
  } catch {
    return []
  }
}

/**
 * セッション1件の中身（依頼の数・要約・最後のセリフ）を transcript から読む
 * （`docs/glossary.md`「セッションの要約」）。組み方は `toSessionDigest`。`dir` を渡さない理由と
 * `includeSystemMessages` を入れる理由は {@link readRestoredEvents} と同じ。
 *
 * 読めなければ「読めない」（切り替え画面の右が空になるだけ）。読んだ内容はどこにも書き出さない
 * （docs/coding-standards.md「会話内容の扱い」）。
 */
export async function readSessionDigest(
  sessionId: string,
  expressions: readonly ExpressionChoice[],
): Promise<SessionDigest> {
  try {
    return toSessionDigest(
      await getSessionMessages(sessionId, { includeSystemMessages: true }),
      toExpressionNames(expressions),
    )
  } catch {
    return UNAVAILABLE_SESSION_DIGEST
  }
}

/**
 * ターンの終わりに tsukumo の印を付け直す予約をする（次に起こしたときに自分のセッションを
 * 見分けるため。`docs/requirements.md`「鍵」）。本体側の書き込みと重ならないように
 * {@link SESSION_TAG_DELAY_MS} だけ待つ。
 *
 * 待っている間に tsukumo が終わるなら印はどのみち要らないので、タイマーでプロセスを
 * 引き延ばさない（`unref`）。
 */
export function scheduleMarkSession(sessionId: string, options: SessionDriverOptions): void {
  setTimeout(() => {
    void markSession(sessionId, options)
  }, SESSION_TAG_DELAY_MS).unref()
}

/**
 * セッションに tsukumo の印を付ける。失敗しても続行する — 付かなかったときに起きるのは
 * 「次回は新規から始まる」ことだけで、いま動いているセッションには影響しない
 * （docs/coding-standards.md「エラーハンドリング」）。
 */
async function markSession(sessionId: string, options: SessionDriverOptions): Promise<void> {
  try {
    await tagSession(sessionId, options.tag, { dir: options.cwd })
  } catch {
    // 印が付かないだけなので、何も流さずに諦める。
  }
}

/**
 * Claude が `report` で付けた題を書く役。`renameSession` を呼ぶのは
 * ここだけ（`docs/architecture.md`「1ファイル = 1つの境界」）。書くかどうかの判断は {@link decideSessionTitle}（core）が持ち、ここは
 * SDK を呼ぶだけ。
 */
export type SessionTitleWriter = {
  /**
   * ターンの終わりに、書けそうなら書く予約をする。{@link SESSION_TAG_DELAY_MS} だけ遅らせるのは
   * {@link scheduleMarkSession} と同じ理由——本体がターンの終わりに自分の要約を書くのと
   * 重なると、直後に書いた値が消える実測があるため。
   */
  readonly schedule: (sessionId: string, candidate: string, options: SessionDriverOptions) => void
  /**
   * `/clear` の合図を受けたことを伝える。本体が前のセッションの題を新しいセッションへ
   * 書き写すため、次に書くときだけ現在値を tsukumo が最後に書いたものとみなす
   * （{@link noteConversationCleared}）。
   */
  readonly noteConversationCleared: () => void
}

/**
 * {@link SessionTitleWriter} を1つ作る。セッション1つに1つ——「tsukumo が最後に書いた題」
 * （{@link SessionTitleState}）をこの中に閉じ込め、呼び出し側には見せない
 * （`docs/coding-standards.md`「引数として渡した入れ物が呼び出し先で書き変わる契約にしない」を、
 * 可変な入れ物を渡し合う形ではなく `createReportGate` と同じ「工場関数が閉じ込める」形で守る）。
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
      // `renameSession` の成否に関わらず、この判断で `adoptCurrentTitleNext` は使い切る
      // （`lastWritten` は実際に書けたときだけ進めたいので、ここでは触らない）。
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
    schedule(sessionId, candidate, options) {
      setTimeout(() => {
        void writeTitle(sessionId, candidate, options)
      }, SESSION_TAG_DELAY_MS).unref()
    },
    noteConversationCleared() {
      state = noteConversationCleared(state)
    },
  }
}
