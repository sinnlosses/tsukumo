// 日記を書いたパックから、成果の画面が出す立ち絵と名前を導く。
//
// 書いたパックは「いま出しているパック」と別物。
// 日記の段落（`DiaryParagraph`）は書いた時点のパックのディレクトリ名・名前・表情を凍結して持つ。
// 名前は日記に残したものをそのまま出し、立ち絵は `SessionState.characterPacks` からそのディレクトリ名を引けるときだけ出す。
// パックを消した・名前を変えたなど引けないときは、名前だけを残し立ち絵は出さない。
// いまのパックの絵で代えると、別の誰かが書いたように見えるため。

import type {
  CharacterInfo,
  CharacterPackEntry,
} from "../../../../../shared/character-pack/character.ts"
import { resolveExpressionLabel } from "../../../../../shared/character-pack/expression-choice.ts"
import { isExpression } from "../../../../../shared/character-pack/expression.ts"
import type { DailyDiaryStatus, DiaryParagraph } from "../../../../../shared/diary/diary.ts"
import {
  DEFAULT_CHARACTER_NAME,
  portraitAppearance,
  type PortraitAppearance,
} from "../../../../domain/portrait-appearance.ts"

/** 書いたパックの立ち絵と名前。 */
export type DiaryWriterPortrait = {
  readonly name: string
  readonly portrait: PortraitAppearance
}

/**
 * 日記の区画と日記帳に出す立ち絵と名前。
 * 書き上がった日記があれば最後の段落を書いたパック、そうでなければいまのパックを `default` の表情で。
 */
export function currentWriterPortraitOf(
  diary: DailyDiaryStatus,
  character: CharacterInfo | undefined,
  packs: readonly CharacterPackEntry[],
): DiaryWriterPortrait {
  if (diary.kind === "written") {
    const latest = diary.diary.paragraphs.at(-1)
    if (latest !== undefined) {
      return diaryWriterPortraitOf(latest, packs)
    }
  }
  return {
    name: character?.name ?? DEFAULT_CHARACTER_NAME,
    portrait: portraitAppearance(character, "default", "default"),
  }
}

/**
 * 段落を書いたパックの立ち絵と名前を導く。
 * `packs` は `SessionState.characterPacks`（見つからなければ立ち絵は出ない）。
 * 表情は日記が文字列で持つ（{@link DiaryParagraph.expression}）ので、そのパックの表情でなくなっていても `default` へ落として読む。
 */
function diaryWriterPortraitOf(
  paragraph: DiaryParagraph,
  packs: readonly CharacterPackEntry[],
): DiaryWriterPortrait {
  const pack = packs.find((entry) => entry.name === paragraph.writer.pack)
  const expression = isExpression(paragraph.expression) ? paragraph.expression : "default"
  return {
    name: paragraph.writer.name,
    portrait:
      pack === undefined
        ? { portraitUrl: undefined, accent: undefined, altText: paragraph.writer.name }
        : {
            ...portraitAppearance(pack.character, expression, "default"),
            altText: `${paragraph.writer.name}（${resolveExpressionLabel(pack.character.expressions, expression)}）`,
          },
  }
}
