// `session` 自身が受けるコマンドの表（`docs/design.md` 2章「コマンドの受け手と手続きの置き方」）。
// 駆動へ渡す6種・`nudge`・起こし直し3種・成果の振り返り・新しいセッションの既定の12種。
// ほかの機能の行は各機能の `<機能>-command.ts` にあり、束ねるのは配線の `src/command-route.ts`。

import {
  achievementReflectionRequestText,
  type DailyAchievement,
  isEmptyAchievementDay,
} from "../../../shared/achievement.ts"
import { type DriverCommand } from "../../../shared/command.ts"
import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import { BUILTIN_SESSION_DEFAULT, type SessionDefault } from "../../../shared/session-default.ts"
import { type SessionEvent } from "../../../shared/session-event.ts"
import { type CommandByType, NO_COMMAND_GUARD } from "../../core/command-receiver.ts"
import { type DiaryDayTask } from "../../diary/core/diary-tool.ts"
import { type DiaryWriteRequest, type DiaryWriterSource } from "../../diary/core/diary-writer.ts"
import { type PromptImageShelf } from "../../session-driver/core/prompt-image-shelf.ts"
import {
  type CommandReceiver,
  type CommandSession,
  type DispatchResult,
  type SessionReceiver,
} from "./command-dispatch.ts"
import { declined, dispatchToDriver, nudge } from "./driver-command.ts"

export type SessionCommandPorts = {
  /**
   * 依頼に添えた画像の原寸の棚（`prompt` を受けたときに置く。捨てるのは `session-manager.ts`）。
   */
  readonly promptImageShelf: PromptImageShelf
  /**
   * 新しいセッションの既定（モデル・effort・許可モード）を覚え、**画面へ流す
   * `session-default-changed` イベントを返す**（覚え先は `session/adapter/remembered-default.ts`。
   * `docs/screen-design.md` 13.6）。**いま動いているセッションには効かない**（効くのは次に
   * 起こすときから）。書き込みは失敗しても投げない口なので、返すイベントは常に1つ。
   */
  readonly rememberSessionDefault: (sessionDefault: SessionDefault) => SessionEvent
  /**
   * 成果の振り返りを受けたときに、その日の成果を数え直す口（`docs/design.md`「日記の受け取りと
   * 保存」「コマンドと依頼」）。**画面が出している手続き `achievement.day` と同じ数え方**を使う。
   * `main` が読めない・`git` の呼び出しが失敗したときは undefined。
   */
  readonly readAchievementDay: (date: string) => Promise<DailyAchievement | undefined>
  /**
   * 成果の振り返りの書き手の出どころ（`src/server/diary/core/diary-writer.ts`）。疑似セッションでは
   * `dont-write`。
   */
  readonly diary: DiaryWriterSource
}

type SessionCommandType =
  | "prompt"
  | "interrupt"
  | "answer"
  | "set-model"
  | "set-effort"
  | "set-permission-mode"
  | "nudge"
  | "switch-character"
  | "set-chat-mode"
  | "switch-session"
  | "reflect-achievement"
  | "set-session-default"

/** `session` が受けるコマンドの表。 */
export function sessionCommands(ports: SessionCommandPorts): {
  readonly [T in SessionCommandType]: CommandReceiver<CommandByType[T]>
} {
  // 駆動へそのまま渡す6種は同じ1行（渡し方は `driver-command.ts`）。
  const toDriver = {
    ...NO_COMMAND_GUARD,
    kind: "session",
    receive: (command, session) =>
      dispatchToDriver(session.driver(), command, ports.promptImageShelf),
  } satisfies SessionReceiver<DriverCommand>
  return {
    prompt: toDriver,
    interrupt: toDriver,
    answer: toDriver,
    "set-model": toDriver,
    "set-effort": toDriver,
    "set-permission-mode": toDriver,
    // **雑談のときだけ**（`docs/screen-design.md` 13.7）——仕事のメインビューは記録を積んで
    // レポートを出す面なので、キャラクターから始まるターンを混ぜない。**文面は core が持つ**ので
    // 駆動へそのまま渡さない（`driver-command.ts` の `nudge`）。
    nudge: {
      kind: "session",
      chatOnly: FRAME_ERROR_REASON.nudgeOutsideChat,
      idleTurn: FRAME_ERROR_REASON.nudgeDuringTurn,
      receive: (_command, session) => nudge(session.driver()),
    },
    // **雑談かどうかは切り替えをまたいで保つ**（パックを変えただけで仕事へ戻らない）。
    // 画面から名前が届いた唯一の口なので、**ここで選んだパックだけが次の起動の初期値に
    // なる**（docs/screen-design.md 13.6）。
    "switch-character": {
      kind: "session",
      chatOnly: false,
      idleTurn: FRAME_ERROR_REASON.switchDuringTurn,
      receive: (command, session) =>
        session.restart({
          selection: { by: "name", name: command.name },
          chat: session.state().chatMode,
          resume: { by: "latest" },
        }),
    },
    // **いま出しているパックのまま**起こし直す（雑談に入るとキャラクターが変わる、
    // とは決めていない）。**名前では渡さない** — 渡すと「画面から選ばれた名前」と
    // 区別がつかず、モードを切り替えただけで覚えた値が書き換わる（docs/screen-design.md 13.6）。
    "set-chat-mode": {
      kind: "session",
      chatOnly: false,
      idleTurn: FRAME_ERROR_REASON.chatModeSwitchDuringTurn,
      receive: (command, session) =>
        session.restart({
          selection: { by: "current" },
          chat: command.chat,
          resume: { by: "latest" },
        }),
    },
    // **キャラクターもモードもいま出しているまま**（変わるのは、どの transcript の続きから
    // 始めるかだけ）。一覧は同じパック・同じモードのものしか出していないので、選んだ先で
    // 相手が入れ替わることもない。
    "switch-session": {
      kind: "session",
      chatOnly: false,
      idleTurn: FRAME_ERROR_REASON.sessionSwitchDuringTurn,
      receive: (command, session) =>
        session.restart({
          selection: { by: "current" },
          chat: session.state().chatMode,
          resume: { by: "id", sessionId: command.sessionId },
        }),
    },
    // **会話のターン中・答え待ちでも受ける**ので列では断らない。断るかどうかは受け手の中で見る
    // （`docs/design.md`「日記の受け取りと保存」「コマンドと依頼」）。
    "reflect-achievement": {
      ...NO_COMMAND_GUARD,
      kind: "session",
      receive: (command, session) => reflectAchievement(command.date, session, ports),
    },
    // **起こし直さない**（次に起こすときから効く値なので、いまの会話には触らない）。
    // 書いて、覚えた値を画面へ流すだけ。
    "set-session-default": {
      ...NO_COMMAND_GUARD,
      kind: "write",
      receive: (command) =>
        ports.rememberSessionDefault({
          model: command.model,
          effort: command.effort,
          permissionMode: command.permissionMode,
        }),
      failure: FRAME_ERROR_REASON.sessionDefaultFailed,
    },
  }
}

/**
 * 成果の振り返り（`reflect-achievement`）。断るのは日記を書いている最中
 * （`state.diaryWriting.kind === "writing"`）と、その日の成果が読めない・空の日のときだけ。通れば
 * `diary-requested` を流し、**代の持ち物の書き手**に1回ぶんを渡す。会話の `SessionDriver` は
 * 通らない——書き手は会話とは別の使い捨ての問い合わせ。
 */
async function reflectAchievement(
  date: string,
  session: CommandSession,
  ports: SessionCommandPorts,
): Promise<DispatchResult> {
  if (session.state().diaryWriting.kind === "writing") {
    return declined(FRAME_ERROR_REASON.achievementReflectionWriting)
  }

  // **いまの代を1つに固定する**——数え直しを待つ間に起こし直しても、この振り返りは始めたときの
  // 代のまま進める（起こし直した代のイベントに混ざらない。`emit` は代が閉じたら黙って捨てる）。
  const generation = session.generation()

  const achievement = await readAchievementDaySafely(date, ports)
  if (
    achievement === undefined ||
    achievement.kind !== "known" ||
    isEmptyAchievementDay(achievement.commitCount, achievement.doneTasks)
  ) {
    return declined(FRAME_ERROR_REASON.achievementReflectionUnavailable)
  }

  const doneTasks: readonly DiaryDayTask[] =
    achievement.doneTasks.kind === "known" ? achievement.doneTasks.items : []
  const text = achievementReflectionRequestText({
    date,
    today: achievement.today,
    commitCount: achievement.commitCount,
    doneTasks: achievement.doneTasks,
    graduations: achievement.graduations,
    milestones: achievement.milestones,
    alreadyWritten: achievement.diary.kind === "written",
  })

  generation.emit({ kind: "diary-requested", date })

  if (ports.diary.kind === "dont-write") {
    // 疑似セッション: claude を起こさず、`diary-requested` のすぐ後に `diary-failed` を流す
    // （`docs/design.md`「日記の受け取りと保存」「問い合わせの起こし方」）。
    generation.emit({ kind: "diary-failed", date })
    return { ok: true }
  }

  const request: DiaryWriteRequest = {
    date,
    doneTasks,
    requestText: text,
    model: session.state().model ?? BUILTIN_SESSION_DEFAULT.model,
  }
  // **待たない**（書き手は自分でイベントを流し終える。`reflect-achievement` はここで返す）。
  void ports.diary.write(request, generation.emit, generation.diarySignal)
  return { ok: true }
}

/** `readAchievementDay` が例外を投げても、常駐プロセスは落とさず undefined に畳む。 */
async function readAchievementDaySafely(
  date: string,
  ports: SessionCommandPorts,
): Promise<DailyAchievement | undefined> {
  try {
    return await ports.readAchievementDay(date)
  } catch {
    return undefined
  }
}
