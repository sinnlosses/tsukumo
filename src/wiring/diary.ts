// 日記（成果の振り返り）の配線。振り返りの書き手と、書き手が読む直近に起こした代のパック情報を持つ。

import type { CharacterPack } from "../server/character-pack/adapter/character-pack.ts"
import { appendDiaryParagraph } from "../server/diary/adapter/diary.ts"
import { queryDiary } from "../server/diary/adapter/sdk-diary.ts"
import {
  createDiaryWriter,
  type DiaryWriterContext,
  type DiaryWriterSource,
} from "../server/diary/core/diary-writer.ts"
import type { SessionCommandPorts } from "../server/session/core/session-command.ts"
import type { SessionLaunchSeed } from "../server/session/core/session-launch.ts"
import { expressionChoices } from "../shared/character-pack/expression-choice.ts"
import type { WiringContext } from "./wiring-context.ts"

export function wireDiary(context: WiringContext): {
  readonly sessionCommands: Pick<SessionCommandPorts, "diary">
  /**
   * 代を起こすたびに呼ぶ。
   * キャラクターを切り替えたあとの振り返りは、切り替えたあとのパックで書く。
   */
  readonly noteLaunched: (seed: SessionLaunchSeed<CharacterPack>) => void
} {
  let latest: DiaryWriterContext | undefined = undefined
  return {
    sessionCommands: {
      // 疑似セッションでは振り返りの書き手を起こさない。
      diary:
        context.fakeSession === undefined
          ? diaryWriterSource(context, () => latest)
          : { kind: "dont-write" },
    },
    noteLaunched: (seed) => {
      latest = {
        persona: seed.pack.persona ?? "",
        expressions: expressionChoices(seed.pack.definition),
        writer: { pack: seed.pack.name, name: seed.pack.definition?.name ?? seed.pack.name },
        cwd: context.cwd,
        env: context.inheritedEnv,
      }
    },
  }
}

/**
 * 振り返りの書き手の出どころ。
 * 書く時点のパックは `readContext` で毎回読み直す。
 * `cwd` はリポジトリの見分けに使う（{@link appendDiaryParagraph}）。
 */
function diaryWriterSource(
  context: WiringContext,
  readContext: () => DiaryWriterContext | undefined,
): DiaryWriterSource {
  return {
    kind: "write",
    write: createDiaryWriter({
      now: context.now,
      save: (paragraph) => appendDiaryParagraph(context.cwd, paragraph),
      readContext,
      query: queryDiary,
    }),
  }
}
