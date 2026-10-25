// 立ち絵1枚から生成した、新しく作るパックの欄の値（id・名前・差し色2つ・ペルソナ）。
// 作るダイアログの欄を埋めるだけで、書き込みは利用者が直してから押す「作る」が行う。

import { z } from "zod"

import { isAccentColor, MAX_CHARACTER_NAME_LENGTH } from "./character-definition.ts"
import { parseCharacterPackName } from "./character.ts"
import { MAX_PERSONA_BODY_LENGTH, rememberedSectionStart } from "./persona-section.ts"

/**
 * 生成した欄の値の形。
 * id は空文字（パックの名前として通らなかったので利用者が打つ）か、パックの名前として通るもの。
 * ペルソナは `## 覚えたこと` の節の見出しを含まない（含むと節より前だけを本文とする読み方とずれる）。
 */
export const generatedCharacterSchema = z.object({
  id: z.string().refine((value) => value === "" || parseCharacterPackName(value) !== undefined),
  name: z
    .string()
    .max(MAX_CHARACTER_NAME_LENGTH)
    .refine((value) => value.trim() !== ""),
  accent: z.string().refine(isAccentColor),
  chatAccent: z.string().refine(isAccentColor),
  persona: z
    .string()
    .max(MAX_PERSONA_BODY_LENGTH)
    .refine((value) => value.trim() !== "" && rememberedSectionStart(value) === undefined),
})

export type GeneratedCharacter = z.infer<typeof generatedCharacterSchema>
