// パックの名前（`characters/<name>` のディレクトリ名）の検査済みの型と、それを作る唯一の入口。
// 素材の URL を組む側と姿を組む側が互いを読み合わずに済むよう、ここに独立させてある。

import { z } from "zod"

/**
 * キャラクターパックの名前として受け付ける長さの上限。
 * 切り替えも含め、名前を受け取る入口は {@link parseCharacterPackName} と同じ形（半角英数字と `.` `_` `-`）で見る。
 */
const MAX_CHARACTER_PACK_NAME_LENGTH = 200

/** パスに組んでよいと検査したパックの名前。作れるのは {@link parseCharacterPackName} と {@link characterPackNameSchema} だけ。 */
export type CharacterPackName = string & { readonly __brand: "CharacterPackName" }

/**
 * パックの名前として受け付ける形なら、検査済みの型にして返す（通らなければ undefined）。
 * 受け取った文字列がディレクトリ名になる場面（作る・書き込む・切り替える・会話の記録の置き場を組む）で見る。
 *
 * - 使えるのは半角英数字と `.` `_` `-` だけ（パスの区切り・空白・非 ASCII は入らない）
 * - `.` で始まらない（`.` `..` と隠しディレクトリが名前として通らないので、パストラバーサルの経路が生まれない）
 *
 * 表示名（`character.json` の `name`）はここでは見ない（文字種を縛らないので日本語も使える）。
 */
export function parseCharacterPackName(value: string): CharacterPackName | undefined {
  return hasPackNameShape(value) ? value : undefined
}

export const characterPackNameSchema = z.string().refine(hasPackNameShape)

function hasPackNameShape(value: string): value is CharacterPackName {
  return value.length <= MAX_CHARACTER_PACK_NAME_LENGTH && CHARACTER_PACK_NAME_PATTERN.test(value)
}

const CHARACTER_PACK_NAME_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/
