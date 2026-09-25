// `session` 自身が受けるコマンドの表（`docs/design.md` 2章「コマンドの受け手と手続きの置き方」）。
// 駆動へ渡す6種・`nudge`・起こし直し3種・成果の振り返り・新しいセッションの既定の12種。
// 手続き（`session/adapter/session-procedure.ts`）がここの行へ委ねる。断る条件は契約
// `src/shared/contract/session.ts` の `meta`。

import {
  achievementReflectionRequestText,
  type DailyAchievement,
  isEmptyAchievementDay,
} from "../../../shared/achievement.ts"
import { type CommandInputs } from "../../../shared/command.ts"
import { type sessionContract } from "../../../shared/contract/session.ts"
import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import { BUILTIN_SESSION_DEFAULT, type SessionDefault } from "../../../shared/session-default.ts"
import { type SessionEvent } from "../../../shared/session-event.ts"
import { type DispatchResult } from "../../core/command-receiver.ts"
import { type DiaryDayTask } from "../../diary/core/diary-tool.ts"
import { type DiaryWriteRequest, type DiaryWriterSource } from "../../diary/core/diary-writer.ts"
import { type PromptImageShelf } from "../../session-driver/core/prompt-image-shelf.ts"
import { type SessionDriver } from "../../session-driver/core/session-driver.ts"
import {
  type CommandReceiver,
  type CommandSession,
  type SessionReceiver,
} from "./command-session.ts"
import { ACCEPTED, askDriver, declined, nudge } from "./driver-command.ts"

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

/** `session` が受けるコマンドの表（契約 `src/shared/contract/session.ts` の手続きごとに1行）。 */
export type SessionCommandTable = {
  readonly [K in keyof typeof sessionContract]: CommandReceiver<SessionCommandInputs[K]>
}

type SessionCommandInputs = CommandInputs<typeof sessionContract>

/** `session` が受けるコマンドの表。 */
export function sessionCommands(ports: SessionCommandPorts): SessionCommandTable {
  // 駆動へそのまま渡す6種は、駆動の口を1つ呼ぶだけ（待ち方と畳み方は `driver-command.ts`）。
  return {
    // 原寸は**駆動へ渡す前に棚へ置く**（id は `request` のイベントに載って記録へ入る）。
    // 駆動が投げて `request` が流れなかったときの原寸は記録に載らないまま残るが、
    // 棚の枚数の上限で古いほうから押し出される。
    prompt: toDriver((started, input) => {
      started.prompt(input.text, ports.promptImageShelf.shelve(input.images))
      return ACCEPTED
    }),
    interrupt: toDriver(async (started) => {
      await started.interrupt()
      return ACCEPTED
    }),
    answer: toDriver((started, input) =>
      started.answer(input.id, input.answer)
        ? ACCEPTED
        : { ok: false, reason: FRAME_ERROR_REASON.unresolvedAnswer },
    ),
    setModel: toDriver(async (started, input) => {
      await started.setModel(input.model)
      return ACCEPTED
    }),
    setEffort: toDriver(async (started, input) => {
      await started.setEffort(input.effort)
      return ACCEPTED
    }),
    setPermissionMode: toDriver(async (started, input) => {
      await started.setPermissionMode(input.mode)
      return ACCEPTED
    }),
    // **雑談のときだけ**（`docs/screen-design.md` 13.7。断る条件は契約の `meta`）。**文面は core が
    // 持つ**ので駆動へそのまま渡さない（`driver-command.ts` の `nudge`）。
    nudge: {
      kind: "session",
      receive: (_input, session) => nudge(session.driver()),
    },
    // **雑談かどうかは切り替えをまたいで保つ**（パックを変えただけで仕事へ戻らない）。
    // 画面から名前が届いた唯一の口なので、**ここで選んだパックだけが次の起動の初期値に
    // なる**（docs/screen-design.md 13.6）。
    switchCharacter: {
      kind: "session",
      receive: (input, session) =>
        session.restart({
          selection: { by: "name", name: input.name },
          chat: session.state().chatMode,
          resume: { by: "latest" },
        }),
    },
    // **いま出しているパックのまま**起こし直す（雑談に入るとキャラクターが変わる、
    // とは決めていない）。**名前では渡さない** — 渡すと「画面から選ばれた名前」と
    // 区別がつかず、モードを切り替えただけで覚えた値が書き換わる（docs/screen-design.md 13.6）。
    setChatMode: {
      kind: "session",
      receive: (input, session) =>
        session.restart({
          selection: { by: "current" },
          chat: input.chat,
          resume: { by: "latest" },
        }),
    },
    // **キャラクターもモードもいま出しているまま**（変わるのは、どの transcript の続きから
    // 始めるかだけ）。一覧は同じパック・同じモードのものしか出していないので、選んだ先で
    // 相手が入れ替わることもない。
    switchSession: {
      kind: "session",
      receive: (input, session) =>
        session.restart({
          selection: { by: "current" },
          chat: session.state().chatMode,
          resume: { by: "id", sessionId: input.sessionId },
        }),
    },
    // **会話のターン中・答え待ちでも受ける**ので `meta` では断らない。断るかどうかは受け手の中で
    // 見る（`docs/design.md`「日記の受け取りと保存」「コマンドと依頼」）。
    reflectAchievement: {
      kind: "session",
      receive: (input, session) => reflectAchievement(input.date, session, ports),
    },
    // **起こし直さない**（次に起こすときから効く値なので、いまの会話には触らない）。
    // 書いて、覚えた値を画面へ流すだけ。
    setSessionDefault: {
      kind: "write",
      receive: (input) =>
        ports.rememberSessionDefault({
          model: input.model,
          effort: input.effort,
          permissionMode: input.permissionMode,
        }),
      failure: FRAME_ERROR_REASON.sessionDefaultFailed,
    },
  }
}

/** 駆動へ1件頼む行（駆動が起き上がるのを待ってから `ask` を呼ぶ）。 */
function toDriver<C>(
  ask: (started: SessionDriver, input: C) => DispatchResult | Promise<DispatchResult>,
): SessionReceiver<C> {
  return {
    kind: "session",
    receive: (input, session) => askDriver(session.driver(), (started) => ask(started, input)),
  }
}

/**
 * 成果の振り返り（`reflectAchievement`）。断るのは日記を書いている最中
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
  // **待たない**（書き手は自分でイベントを流し終える。`reflectAchievement` はここで返す）。
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
