// 雑談で覚えたことを人格へ書き足し、覚えた1行を忘れる。
// 書き込んでよいのは `~/.tsukumo/characters/<pack>/persona.md` の1つだけで、ホームへ写すのは `copyPackOnce` を通す。
//
// 何を書いてよいか・何を消してよいかはここが決めない（判断はモデル側の条 `CHAT_MANNER_PROMPT` が持つ）。
// ここが持つのは受け取った1行をどこにどう書くか・どの行と突き合わせるかと、上限だけ。
// 会話を読んで判定しないので、`docs/coding-standards.md`「会話内容の扱い」の書き出しに数えない（キャラクター自身の属性として書く）。
//
// 触るのは末尾の `## 覚えたこと` の節だけで、節より前は1バイトも触らない。
// 人が書いた見出しと表、機械が書いた領域の境目が、ファイルの中で1本に決まる。
// 節を消せば書き足す前の人格に戻り、消せるのは自分で書き足した行だけという線もこの境目がそのまま担う。
//
// 書けなかった回・消せなかった回は結果の種類（`PersonaRememberResult` / `PersonaForgetResult`）で返し、例外は投げない。

import { join } from "node:path"

import { writeFileAtomic } from "../../adapter/lib/atomic-file.ts"
import { readOptionalFile } from "../../adapter/lib/optional-file.ts"
import { copyPackOnce } from "../../character-pack/adapter/character-edit.ts"
import {
  type CharacterPack,
  homeCharacterDir,
  isEditableCharacterPack,
  PERSONA_FILE_NAME,
} from "../../character-pack/adapter/character-pack.ts"
import type { PersonaMemory } from "../core/memory/chat-memory.ts"
import {
  forgetRejection,
  forgetTarget,
  personaWithoutRememberedLine,
  personaWithRememberedLine,
  rememberedTexts,
  rememberRejection,
} from "../core/memory/persona-memory-edit.ts"

/** `persona.md` に書けなかったことの知らせ口。`error` からは `error.name` と code だけを写すこと。 */
export type PersonaMemoryFailureReport = (
  place: "persona-remember" | "persona-forget",
  error: unknown,
) => void

/** 書き足しの結果。 */
type PersonaWriteResult =
  | { readonly kind: "written" }
  | { readonly kind: "failed"; readonly error: unknown }

/** 消す結果。`no-match` は節に一致する行が無かった（正常）。 */
type PersonaEraseResult =
  | { readonly kind: "erased" }
  | { readonly kind: "no-match" }
  | { readonly kind: "failed"; readonly error: unknown }

/**
 * 覚えたことの書き足し・忘れる口を1つ作る（`remember` と `forget` のツールの裏に立つ）。
 *
 * 書かずに返すのは次の5つ:
 *
 * - そのターンで既に1行書いている（{@link PersonaMemory.finishTurn} まで受け付けない）
 * - 空の行・改行を含む行・`MAX_REMEMBERED_LINE_LENGTH` を超える行
 * - 起動先の `characters/local` と同じ名前のパック（`isEditableCharacterPack`。書いても探索の順で負ける）
 * - 節に同じ文面の行がある（ターンの1行は使わない）
 * - ディスクに書けない（`onFailure` へも知らせる）
 *
 * 消さずに返すのは、そのターンで既に1行消しているとき・節に一致する行が無いとき・上の3つ目と5つ目。
 * 書いた数と消した数は別に数えるので、同じターンで覚え直せる。
 *
 * `root` は書き込み先の親（既定は `~/.tsukumo/characters`）。
 *
 * `onChange` は書けた・消せたときだけ、更新後の一覧（{@link readRememberedLines}）を渡して呼ぶ。
 * 一覧は画面へだけ流し、モデルへは戻さない。
 */
export function createPersonaMemory(
  pack: CharacterPack,
  cwd: string,
  root: string = homeCharacterDir(),
  onChange: (lines: readonly string[]) => void = () => {},
  onFailure: PersonaMemoryFailureReport = () => {},
): PersonaMemory {
  // このターンで既に1行書いたか・消したか（どちらも1ターン1行の上限）。
  // 別々に数えるので、覚え違いを同じターンで言い直せる。
  let written = false
  let forgotten = false

  return {
    remember: (line) => {
      const trimmed = line.trim()
      const rejection = rememberRejection({
        turnUsed: written,
        line: trimmed,
        editable: isEditableCharacterPack(pack, cwd),
        remembered: readRememberedLines(pack, root),
      })
      if (rejection !== undefined) {
        return rejection
      }

      const result = writeRememberedLine(pack, join(root, pack.name), trimmed)
      if (result.kind === "failed") {
        onFailure("persona-remember", result.error)
        return "failed"
      }
      written = true
      onChange(readRememberedLines(pack, root))
      return "written"
    },
    forget: (line) => {
      const target = forgetTarget(line)
      const rejection = forgetRejection({
        turnUsed: forgotten,
        editable: isEditableCharacterPack(pack, cwd),
        target,
      })
      if (rejection !== undefined) {
        return rejection
      }

      const result = eraseRememberedLine(pack, join(root, pack.name), target)
      if (result.kind === "failed") {
        onFailure("persona-forget", result.error)
        return "failed"
      }
      if (result.kind === "no-match") {
        return "no-match"
      }
      forgotten = true
      onChange(readRememberedLines(pack, root))
      return "erased"
    },
    finishTurn: () => {
      written = false
      forgotten = false
    },
  }
}

/**
 * いまの「覚えたこと」の一覧（`- ` を外した文面。新しい行が末尾）。節が無い・読めないときは空。
 * ホームの写しがあればそれ、無ければいま出しているパックの人格を読む（まだ1行も書き足していないセッションでは、起動時に読んだ全文で足りる）。
 */
export function readRememberedLines(
  pack: CharacterPack,
  root: string = homeCharacterDir(),
): readonly string[] {
  const path = join(root, pack.name, PERSONA_FILE_NAME)
  const current = readOptionalFile(path) ?? pack.persona ?? ""
  return rememberedTexts(current)
}

/**
 * 画面の「編集」から1行消す。
 * 消し方は {@link PersonaMemory.forget} と同じ（完全一致・同じ文面が2行あればいちばん古いほうを消す・節より前は触らない）。
 * 1ターン1行の上限は掛けない。その上限はモデルの暴走を防ぐためのもので、利用者が画面から名指しした削除には要らない。
 *
 * 消せたら更新後の一覧を返す。
 * 一致する行が無い・そのパックが編集できない（`isEditableCharacterPack`）・書けないときは undefined（書けないときは `onFailure` へも知らせる）。
 */
export function forgetRememberedLineFromScreen(
  pack: CharacterPack,
  cwd: string,
  line: string,
  root: string = homeCharacterDir(),
  onFailure: PersonaMemoryFailureReport = () => {},
): readonly string[] | undefined {
  const target = forgetTarget(line)
  if (target === "" || !isEditableCharacterPack(pack, cwd)) {
    return undefined
  }

  const result = eraseRememberedLine(pack, join(root, pack.name), target)
  if (result.kind === "failed") {
    onFailure("persona-forget", result.error)
  }
  return result.kind === "erased" ? readRememberedLines(pack, root) : undefined
}

/** ホームのパックの `persona.md` に1行書き足す。 */
function writeRememberedLine(pack: CharacterPack, dir: string, line: string): PersonaWriteResult {
  try {
    copyPackOnce(pack, dir)
    const path = join(dir, PERSONA_FILE_NAME)
    writeFileAtomic(path, personaWithRememberedLine(readOptionalFile(path) ?? "", line))
    return { kind: "written" }
  } catch (error) {
    return { kind: "failed", error }
  }
}

/**
 * ホームのパックの `persona.md` から1行消す。
 *
 * 突き合わせる相手は、ホームの写しがあればそれ、無ければいま出しているパックの人格。
 * ホームへ写すのは消す行が見つかってから。一致しない呼び出しで写しだけが増えると、次の起動から同梱のパックが写しに隠れる。
 */
function eraseRememberedLine(pack: CharacterPack, dir: string, target: string): PersonaEraseResult {
  try {
    const path = join(dir, PERSONA_FILE_NAME)
    const current = readOptionalFile(path) ?? pack.persona ?? ""
    const erased = personaWithoutRememberedLine(current, target)
    if (erased === undefined) {
      return { kind: "no-match" }
    }

    copyPackOnce(pack, dir)
    writeFileAtomic(path, erased)
    return { kind: "erased" }
  } catch (error) {
    return { kind: "failed", error }
  }
}
