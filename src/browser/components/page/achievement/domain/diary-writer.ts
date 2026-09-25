// 日記を**書いたパック**から、成果の画面が出す立ち絵と名前を導く（`docs/screen-design.md` 13.10
// 「並べるもの」2「書いたパックが無いとき」）。読むのはこの画面の直下（container/presenter）と
// 部品だけなので、フックでない純関数として `domain/`（そのページだけの語彙。`docs/design.md`
// 2章「ページの形」）に置く。
//
// **書いたパックは「いま出しているパック」と別物**——日記の段落は書いた時点のパックのディレクトリ
// 名・名前・表情を凍結して持つ（`src/shared/diary.ts`）。名前は日記に残したものをそのまま出し、
// 立ち絵は `SessionState.characterPacks`（`docs/design.md` 7.2）からそのディレクトリ名を引ける
// ときだけ出す。パックを消した・名前を変えたなど引けないときは、名前だけを残し立ち絵は出さない
// （**いまのパックの絵で代えない**——別の誰かが書いたように見えるため）。

import { type CharacterPackEntry } from "../../../../../shared/character.ts"
import { type DiaryParagraph } from "../../../../../shared/diary.ts"
import { resolveExpressionLabel } from "../../../../../shared/expression-choice.ts"
import { isExpression } from "../../../../../shared/expression.ts"
import {
  portraitAppearance,
  type PortraitAppearance,
} from "../../../../domain/portrait-appearance.ts"

/** 書いたパックの立ち絵と名前。 */
export type DiaryWriterPortrait = {
  readonly name: string
  readonly portrait: PortraitAppearance
}

/**
 * 段落を書いたパックの立ち絵と名前を導く。`packs` は `SessionState.characterPacks`（見つからな
 * ければ立ち絵は出ない）。表情は日記が文字列で持つ（{@link DiaryParagraph.expression}）ので、
 * そのパックの表情でなくなっていても `default` へ落として読む。
 */
export function diaryWriterPortraitOf(
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
