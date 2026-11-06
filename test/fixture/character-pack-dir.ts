// テストが置いたパックのディレクトリを、ディレクトリ名をパックの名前にして読む。
// 本番はパックの名前を一覧の側で決めて渡すが、テストは名前を置いたディレクトリ名と同じにして済ませる。

import { basename } from "node:path"

import {
  type CharacterPack,
  readCharacterPack,
} from "../../src/server/character-pack/adapter/character-pack.ts"
import { characterPackName } from "./character.ts"

export function readPackAt(dir: string): CharacterPack {
  return readCharacterPack(dir, characterPackName(basename(dir)))
}
