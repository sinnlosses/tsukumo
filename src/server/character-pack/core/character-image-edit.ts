// 画像の差し替え・消去の計画（ほどき方・ファイル名・定義の書き換え方）と、新しいパックの定義の組み立て。ファイルは触らない。
// ファイル名は外から受け取らない（表情と形式から組み立てる）。

import {
  type BackgroundImage,
  backgroundFileName,
  parseBackgroundImage,
} from "../../../shared/character-pack/character-background.ts"
import {
  definitionWithAccent,
  definitionWithBackground,
  definitionWithFace,
  definitionWithName,
  definitionWithMini,
  definitionWithoutBackground,
  definitionWithoutFace,
  definitionWithoutMini,
  definitionWithoutPortrait,
  definitionWithPortrait,
  parseCharacterDefinition,
} from "../../../shared/character-pack/character-definition.ts"
import {
  type FaceImage,
  faceFileName,
  parseFaceImage,
} from "../../../shared/character-pack/character-face.ts"
import {
  type MiniImage,
  miniFileName,
  parseMiniImage,
} from "../../../shared/character-pack/character-mini.ts"
import type {
  Expression,
  RemovableExpression,
  RequiredExpression,
} from "../../../shared/character-pack/expression.ts"
import {
  type PortraitImage,
  parsePortraitImage,
  portraitFileName,
} from "../../../shared/character-pack/portrait-image.ts"
import type { CharacterCreate } from "../../../shared/contract/character-pack.ts"

/**
 * 新しいパックの `character.json`。
 * 表示名（`name`）は空なら書かない。読む側が表示名の無いときにパック名へ落とすので、ここでパック名を代入し直さない。
 * 画面の差し色（仕事・雑談）は境界で両方 required なので、必ず2つとも書く。
 */
export function newDefinitionJson(
  create: CharacterCreate,
  fileNames: Readonly<Record<RequiredExpression, string>>,
): string {
  const withName = definitionWithName(undefined, create.name)
  const withPortraits = definitionWithPortrait(withName, "default", fileNames.default)
  const withAccent = definitionWithAccent(withPortraits, "work", create.accent)
  return definitionWithAccent(withAccent, "chat", create.chatAccent)
}

/**
 * 立ち絵・ミニ立ち絵・背景・顔で違う部分だけをまとめた操作。
 * `set` と `clear` を1つの型に同居させないのは、立ち絵で受け取れる表情が違うから（消去は `default` を除いた {@link RemovableExpression}、差し替えは {@link Expression}）。
 */
export type ImageEdit<Image extends { readonly base64: string; readonly format: string }> =
  | {
      readonly kind: "set"
      readonly image: string
      /** data URL をほどく（読めない・受け付けない種類・大きすぎるときは undefined）。 */
      readonly parseImage: (dataUrl: string) => Image | undefined
      /** ほどいた画像から書き込み先のファイル名を組み立てる。 */
      readonly fileName: (image: Image) => string
      /** 書き換える前の、いまの定義が指しているファイル名。 */
      readonly previousFileName: (content?: string) => string | undefined
      /** 定義にファイル名を書き込む。 */
      readonly withImage: (content: string | undefined, fileName: string) => string
    }
  | {
      readonly kind: "clear"
      /** 書き換える前の、いまの定義が指しているファイル名。 */
      readonly previousFileName: (content?: string) => string | undefined
      /** 定義から参照を外す。 */
      readonly withoutImage: (content?: string) => string
    }

/** 立ち絵の差し替え（表情ごとに書き込み先とファイル名が変わる）。 */
export function portraitSetEdit(expression: Expression, image: string): ImageEdit<PortraitImage> {
  return {
    kind: "set",
    image,
    parseImage: parsePortraitImage,
    fileName: (portrait) => portraitFileName(expression, portrait.format),
    previousFileName: (content) => portraitFileNameOf(content, expression),
    withImage: (content, fileName) => definitionWithPortrait(content, expression, fileName),
  }
}

/** 立ち絵の消去（`default` は消せないので {@link RemovableExpression} だけ受け取る）。 */
export function portraitClearEdit(expression: RemovableExpression): ImageEdit<PortraitImage> {
  return {
    kind: "clear",
    previousFileName: (content) => portraitFileNameOf(content, expression),
    withoutImage: (content) => definitionWithoutPortrait(content, expression),
  }
}

/** 背景の差し替え（パックに1つだけなので、立ち絵と違い表情を受け取らない）。 */
export function backgroundSetEdit(image: string): ImageEdit<BackgroundImage> {
  return {
    kind: "set",
    image,
    parseImage: parseBackgroundImage,
    fileName: (background) => backgroundFileName(background.format),
    previousFileName: backgroundFileNameOf,
    withImage: definitionWithBackground,
  }
}

/** 背景の消去。 */
export function backgroundClearEdit(): ImageEdit<BackgroundImage> {
  return {
    kind: "clear",
    previousFileName: backgroundFileNameOf,
    withoutImage: definitionWithoutBackground,
  }
}

/** 顔の差し替え（パックに1つだけなので表情を受け取らない）。 */
export function faceSetEdit(image: string): ImageEdit<FaceImage> {
  return {
    kind: "set",
    image,
    parseImage: parseFaceImage,
    fileName: (face) => faceFileName(face.format),
    previousFileName: faceFileNameOf,
    withImage: definitionWithFace,
  }
}

/** 顔の消去。 */
export function faceClearEdit(): ImageEdit<FaceImage> {
  return {
    kind: "clear",
    previousFileName: faceFileNameOf,
    withoutImage: definitionWithoutFace,
  }
}

/** ミニ立ち絵の差し替え（パックに1つだけなので表情を受け取らない）。 */
export function miniSetEdit(image: string): ImageEdit<MiniImage> {
  return {
    kind: "set",
    image,
    parseImage: parseMiniImage,
    fileName: (mini) => miniFileName(mini.format),
    previousFileName: miniFileNameOf,
    withImage: definitionWithMini,
  }
}

/** ミニ立ち絵の消去。 */
export function miniClearEdit(): ImageEdit<MiniImage> {
  return {
    kind: "clear",
    previousFileName: miniFileNameOf,
    withoutImage: definitionWithoutMini,
  }
}

/** 書き換える前の、その表情の立ち絵のファイル名（定義が無い・読めないときは undefined）。 */
function portraitFileNameOf(
  content: string | undefined,
  expression: Expression,
): string | undefined {
  return content === undefined
    ? undefined
    : parseCharacterDefinition(content)?.portraits[expression]
}

/** 書き換える前の背景のファイル名（定義が無い・背景が無いときは undefined）。 */
function backgroundFileNameOf(content?: string): string | undefined {
  return content === undefined ? undefined : parseCharacterDefinition(content)?.background?.image
}

/** 書き換える前の顔のファイル名（定義が無い・顔が無いときは undefined）。 */
function faceFileNameOf(content?: string): string | undefined {
  return content === undefined ? undefined : parseCharacterDefinition(content)?.face
}

/** 書き換える前のミニ立ち絵のファイル名（定義が無い・`mini` が無いときは undefined）。 */
function miniFileNameOf(content?: string): string | undefined {
  return content === undefined ? undefined : parseCharacterDefinition(content)?.mini
}
