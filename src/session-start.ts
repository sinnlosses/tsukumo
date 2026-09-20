// セッションを1つ起こす配線。**どの駆動で起こすか（本物の SDK か台本の偽物か）と、続きから
// 始めるセッションをどう探すか**をここで決め、起こす順序そのものは
// `src/server/core/session-launch.ts` に任せる（起動時も `switch-character` の起こし直しも
// 同じ関数を通る）。
//
// ここは配線層（`src/` 直下。docs/design.md 2章「層と依存の向き」）。

import { randomUUID } from "node:crypto"
import process from "node:process"

import { type CurrentCharacter } from "./current-character.ts"
import { buildSystemPromptAppend, type CharacterPack } from "./server/adapter/character-pack.ts"
import { type FakeScript, startFakeSession } from "./server/adapter/fake-driver.ts"
import { createPersonaMemory } from "./server/adapter/persona-memory.ts"
import {
  findSessionToResume,
  readRestoredEvents,
  startSession as startSdkSession,
} from "./server/adapter/sdk-driver.ts"
import { watchTaskSummary } from "./server/adapter/task-summary.ts"
import { type Config, sessionTag } from "./server/core/config.ts"
import { DEFAULT_PERMISSION_MODE, type SessionDriver } from "./server/core/session-driver.ts"
import { createSessionLaunch, type SessionLaunchSeed } from "./server/core/session-launch.ts"
import {
  createSessionManager,
  type DispatchResult,
  EVENT_BATCH_INTERVAL_MS,
} from "./server/core/session-manager.ts"
import { sessionRules } from "./server/core/session-rule.ts"
import { CHAT_COMPACT_THRESHOLD_BYTES } from "./shared/chat-log.ts"
import { type ClientCommand } from "./shared/command.ts"
import { expressionChoices } from "./shared/expression-choice.ts"
import { type ServerFrame } from "./shared/frame.ts"
import { type SessionEvent } from "./shared/session-event.ts"

/**
 * 起こしたセッション。**`sessionId` は外へ出さない** — 繋ぐ側（`src/view-delivery.ts`）が
 * 知るのは購読・受け渡し・終わらせ方の3つだけでよい。
 */
export type RunningSession = {
  /** フレームの押し先を1つ加える。外すための関数を返す。 */
  readonly subscribe: (send: (frame: ServerFrame) => void) => () => void
  /** 画面から届いたコマンドを渡す。 */
  readonly dispatch: (command: ClientCommand) => Promise<DispatchResult>
  /** 駆動を閉じる（claude の子プロセスを残さないため、終了時に必ず呼ぶ）。 */
  readonly close: () => void
}

export type SessionStartOptions = {
  readonly config: Config
  /** いま出しているキャラクター。起こすパックを決めるのも覚えるのもこれ越し。 */
  readonly character: CurrentCharacter
  /** 偽の駆動の台本（`TSUKUMO_DRIVER=fake` のときだけ）。あるときは claude を起こさない。 */
  readonly script: FakeScript | undefined
}

/** セッションを1つ起こし、開いたタブから触れる窓口を返す。 */
export function startSession(options: SessionStartOptions): RunningSession {
  const { config, character, script } = options
  const sessionId = randomUUID()
  const manager = createSessionManager({
    now: Date.now,
    batchIntervalMs: EVENT_BATCH_INTERVAL_MS,
    chatCompactThresholdBytes: CHAT_COMPACT_THRESHOLD_BYTES,
  })

  manager.create({
    sessionId,
    startDriver: createSessionLaunch<CharacterPack>({
      choosePack: (name) => character.choose(name),
      rememberPack: (pack) => character.remember(pack),
      characterEvent: () => character.event(),
      // develop/tasks.json の見張り。サイドバーの React の部品が `tasks-changed` を状態に
      // 畳んで読む（docs/design.md 12章）。
      watchTasks: (onEvent) =>
        watchTaskSummary(process.cwd(), (tasks) => onEvent({ kind: "tasks-changed", tasks })),
      findResumeSession: (pack, chat) =>
        findPackSessionToResume(config, process.cwd(), pack.name, chat),
      startDriver: (seed, onEvent) => startDriver(seed, script, config.fakeScene, onEvent),
      restoreEvents: (resumed, pack) =>
        readRestoredEvents(resumed, process.cwd(), expressionChoices(pack.definition)),
    }),
    editCharacter: (edit) => Promise.resolve(character.applyEdit(edit)),
    createCharacter: (create) => Promise.resolve(character.applyCreate(create)),
  })

  return {
    subscribe: (send) => manager.subscribe(sessionId, send),
    dispatch: (command) => manager.dispatch(sessionId, command),
    close: manager.close,
  }
}

/**
 * セッション駆動を1つ起こす。**台本があれば偽の駆動**（claude を起こさない。
 * `TSUKUMO_DRIVER=fake`）、無ければ Agent SDK の駆動。`scene` は台本のときだけ効く
 * （名指しした場面を起こした直後に流す。`TSUKUMO_FAKE_SCENE`）。
 */
function startDriver(
  seed: SessionLaunchSeed<CharacterPack>,
  script: FakeScript | undefined,
  scene: string | undefined,
  onEvent: (event: SessionEvent) => void,
): SessionDriver {
  if (script !== undefined) {
    return startFakeSession({ script, scene, onEvent })
  }

  return startSdkSession({
    cwd: process.cwd(),
    expressions: expressionChoices(seed.pack.definition),
    permissionMode: DEFAULT_PERMISSION_MODE,
    systemPromptAppend: buildSystemPromptAppend(seed.pack, sessionRules(seed.chat)),
    resume: seed.resume,
    tag: sessionTag(seed.pack.name, seed.chat),
    // **覚えたことを書き足す口は雑談のときだけ渡す**（渡ったときだけ `remember` ツールが
    // 載る。docs/design.md 7.1）。規約の文面を選ぶのと同じ単位で切り替わる。
    personaMemory: seed.chat ? createPersonaMemory(seed.pack, process.cwd()) : undefined,
    onEvent,
  })
}

/**
 * これから起こすキャラクターパックの、そのモードの続きから始めるセッションを探す
 * （docs/requirements.md 4.8）。無ければ undefined（新規に起こす）。
 *
 * **雑談と仕事で引く印が違う**（docs/requirements.md 4.9）。雑談へ入っても仕事の会話が続きに
 * ならないのはここで、代わりに**そのパックで一度も雑談のターンを終えていなければ新規から
 * 始まる**。
 *
 * **印はターンが終わって3秒後に付く**ので、ターンを1つも終えずに離れたセッションは
 * 次に来たときに見つからず、新規から始まる（`SESSION_TAG_DELAY_MS`。4.8「復元できなかったとき
 * どうするか」の範囲）。偽の駆動は claude を起こさないので、そもそも探さない。
 */
async function findPackSessionToResume(
  config: Config,
  cwd: string,
  characterName: string,
  chat: boolean,
): Promise<string | undefined> {
  return config.newSession || config.driver === "fake"
    ? undefined
    : findSessionToResume(cwd, sessionTag(characterName, chat))
}
