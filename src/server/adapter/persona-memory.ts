// 雑談で覚えたことを人格へ書き足し、覚えた1行を忘れる
// （`docs/design.md` 7.1「覚えたことを人格に書き足す・1行だけ忘れる」）。
// 書き込んでよいのは他の編集と同じ `~/.tsukumo/characters/<pack>/persona.md` の1つだけで、
// ホームへ写す道（`src/server/adapter/character-edit.ts` の `copyPackOnce`）を共有する。
//
// **何を書いてよいか・何を消してよいかはここが決めない。** 判断はモデル側の条
// （`src/server/core/chat-manner.ts`）が持ち、ここが持つのは「受け取った1行をどこにどう書くか
// /どの行と突き合わせるか」と上限だけ（`docs/chat-mode.md` 4.9。**会話を読んで判定しない**
// ので、`docs/coding-standards.md`「会話内容の扱い」とぶつからない）。
//
// **触るのは末尾の `## 覚えたこと` の節だけで、節より前は1バイトも触らない。** 人が書いた
// 見出しと表、機械が書いた領域の境目が、ファイルの中で1本に決まる（節を消せば書き足す前の
// 人格に戻り、**消せるのは自分で書き足した行だけ**という線もこの境目がそのまま担う）。
//
// 上限に当たった回も、消す行が見つからなかった回も**何も知らせない**（呼び出し側が返すのは
// `"ok"` だけ）。失敗しても例外を投げない（常駐プロセスは1回の失敗で落ちない。
// `docs/coding-standards.md`「エラーハンドリング」）。
//
// **画面の「編集」から1行消す口（{@link forgetRememberedLineFromScreen}）もここに置く**
// （`docs/design.md` 7.1「1行だけ忘れる」）。キャラクター自身の `forget`（{@link PersonaMemory.forget}）
// と同じ消し方（完全一致・節より前は触らない）を通すが、**1ターン1行の上限は掛からない**——
// その上限はモデルの暴走を防ぐためのもので、利用者が画面から名指しした削除には要らない。

import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { MAX_REMEMBERED_LINE_LENGTH } from "../../shared/persona-memory.ts"
import { type PersonaMemory } from "../core/session-driver.ts"
import { copyPackOnce } from "./character-edit.ts"
import {
  type CharacterPack,
  homeCharacterDir,
  isEditableCharacterPack,
  PERSONA_FILE_NAME,
} from "./character-pack.ts"

/** 書き足す節の見出し。**`persona.md` のいちばん最後に置く**（7.1）。 */
export const REMEMBERED_SECTION_HEADING = "## 覚えたこと"

/** 節が持てる行数（超えたらいちばん古い行を落とす。7.1 の表）。 */
export const MAX_REMEMBERED_LINES = 20

/**
 * 覚えたことの書き足し・忘れる口を1つ作る（**雑談モードのときだけ**呼ばれ、`remember` と
 * `forget` のツールの裏に立つ。`src/session-start.ts`）。
 *
 * 書かずに黙って捨てるのは次の4つ（どれも呼び出し側には伝えない。7.1）:
 *
 * - そのターンで既に1行書いている（{@link PersonaMemory.finishTurn} まで受け付けない）
 * - 空の行・改行を含む行・{@link MAX_REMEMBERED_LINE_LENGTH} を超える行
 * - 起動先の `characters/local` と同じ名前のパック（`isEditableCharacterPack`。書いても
 *   探索の順で負ける）
 * - ディスクに書けない
 *
 * 消さずに黙って何もしないのは、そのターンで既に1行消しているとき・節に一致する行が無いとき・
 * 上の3つ目と4つ目。**書いた数と消した数は別に数える**ので、同じターンで覚え直せる（7.1）。
 *
 * `root` は書き込み先の親（既定は `~/.tsukumo/characters`。差し替えられるのは置き場所だけで、
 * テストがホームを汚さないためにある）。
 *
 * `onChange` は**書けた・消せたときだけ**、更新後の一覧（{@link readRememberedLines}）を渡して
 * 呼ぶ（画面のサイドバーへ流し直す `remembered-lines-changed` の出どころ。配線は
 * `src/session-start.ts`）。**モデルへは戻さない**（ツールの戻り値は `"ok"` のまま）ので、
 * ここは規約とぶつからない。既定は何もしない関数（テストが気にしなくてよいように）。
 */
export function createPersonaMemory(
  pack: CharacterPack,
  cwd: string,
  root: string = homeCharacterDir(),
  onChange: (lines: readonly string[]) => void = () => {},
): PersonaMemory {
  // このターンで既に1行書いたか・消したか（どちらも1ターン1行の上限。**別々に数える**ので、
  // 覚え違いを同じターンで言い直せる。ターンの終わりは駆動が知らせる）。
  let written = false
  let forgotten = false

  return {
    remember: (line) => {
      const trimmed = line.trim()
      if (written || !isWritableLine(trimmed) || !isEditableCharacterPack(pack, cwd)) {
        return
      }

      written = writeRememberedLine(pack, join(root, pack.name), trimmed)
      if (written) {
        onChange(readRememberedLines(pack, root))
      }
    },
    forget: (line) => {
      const target = forgetTarget(line)
      if (forgotten || target === "" || !isEditableCharacterPack(pack, cwd)) {
        return
      }

      forgotten = eraseRememberedLine(pack, join(root, pack.name), target)
      if (forgotten) {
        onChange(readRememberedLines(pack, root))
      }
    },
    finishTurn: () => {
      written = false
      forgotten = false
    },
  }
}

/**
 * いまの「覚えたこと」の一覧（`- ` を外した文面。新しい行が末尾）。ホームの写しがあればそれ、
 * 無ければいま出しているパックの人格を読む（{@link eraseRememberedLine} と同じ考え方——
 * まだ1行も書き足していないセッションでは、起動時に読んだ全文で足りる）。節が無い・
 * 読めないときは空。
 */
export function readRememberedLines(
  pack: CharacterPack,
  root: string = homeCharacterDir(),
): readonly string[] {
  const path = join(root, pack.name, PERSONA_FILE_NAME)
  const current = readOptionalFile(path) ?? pack.persona ?? ""
  const start = rememberedSectionStart(current)
  return start === undefined
    ? []
    : rememberedLines(current.slice(start)).map((line) => line.slice(2))
}

/**
 * 画面の「編集」から1行消す（`docs/design.md` 7.1「1行だけ忘れる」）。消し方は
 * {@link PersonaMemory.forget} と同じ（完全一致・同じ文面が2行あればいちばん古いほうを消す・
 * 節より前は触らない）だが、**1ターン1行の上限は掛からない**——その上限はモデルの暴走を防ぐ
 * ためのもので、利用者が画面から名指しした削除には要らない。
 *
 * 消せたら更新後の一覧を返す。一致する行が無い・そのパックが編集できない
 * （`isEditableCharacterPack`）・書けないときは undefined。
 */
export function forgetRememberedLineFromScreen(
  pack: CharacterPack,
  cwd: string,
  line: string,
  root: string = homeCharacterDir(),
): readonly string[] | undefined {
  const target = forgetTarget(line)
  if (target === "" || !isEditableCharacterPack(pack, cwd)) {
    return undefined
  }

  return eraseRememberedLine(pack, join(root, pack.name), target)
    ? readRememberedLines(pack, root)
    : undefined
}

/** 1行として受け取れる形か（空でない・改行を含まない・長さが上限以内）。 */
function isWritableLine(line: string): boolean {
  return line !== "" && !/[\n\r]/.test(line) && [...line].length <= MAX_REMEMBERED_LINE_LENGTH
}

/** ホームのパックの `persona.md` に1行書き足す。書けたら true。 */
function writeRememberedLine(pack: CharacterPack, dir: string, line: string): boolean {
  try {
    copyPackOnce(pack, dir)
    const path = join(dir, PERSONA_FILE_NAME)
    writeFileSync(path, personaWithRememberedLine(readOptionalFile(path) ?? "", line))
    return true
  } catch {
    return false
  }
}

/**
 * 節に1行足した `persona.md` の全文。**節が無ければ見出しごと末尾に作り**、あれば箇条書きを
 * 1行足して {@link MAX_REMEMBERED_LINES} までに詰める（溢れるのはいちばん古い行）。
 *
 * **節より前の文字は足しも引きもしない。** 節を作るときに足すのは、見出しの前の改行だけ。
 */
function personaWithRememberedLine(content: string, line: string): string {
  const start = rememberedSectionStart(content)
  if (start === undefined) {
    return `${content}${headingSeparator(content)}${REMEMBERED_SECTION_HEADING}\n\n- ${line}\n`
  }

  const kept = [...rememberedLines(content.slice(start)), `- ${line}`].slice(-MAX_REMEMBERED_LINES)
  return `${content.slice(0, start)}${REMEMBERED_SECTION_HEADING}\n\n${kept.join("\n")}\n`
}

/**
 * 消す行として突き合わせる文面。**箇条書きの印（`- `）と前後の空白だけを落とす** —
 * モデルは `systemPrompt` に載った節をそのまま写すので、印の付いた形でも来る。
 */
function forgetTarget(line: string): string {
  return line
    .trim()
    .replace(/^-[ \t]+/, "")
    .trim()
}

/**
 * ホームのパックの `persona.md` から1行消す。消せたら true（一致が無ければ false）。
 *
 * **突き合わせる相手は、ホームの写しがあればそれ、無ければいま出しているパックの人格**
 * （写しが無い＝このセッションではまだ1行も書いていない、なので起動時に読んだ全文で足りる）。
 * **ホームへ写すのは消す行が見つかってから** — 一致しない呼び出しで写しだけが増えると、次の
 * 起動から同梱のパックが写しに隠れる。
 */
function eraseRememberedLine(pack: CharacterPack, dir: string, target: string): boolean {
  try {
    const path = join(dir, PERSONA_FILE_NAME)
    const current = readOptionalFile(path) ?? pack.persona ?? ""
    const erased = personaWithoutRememberedLine(current, target)
    if (erased === undefined) {
      return false
    }

    copyPackOnce(pack, dir)
    writeFileSync(path, erased)
    return true
  } catch {
    return false
  }
}

/**
 * 節から1行消した `persona.md` の全文（節が無い・一致する行が無いときは undefined）。
 * **同じ文面が2行あるときに消すのはいちばん古い1つだけ**（{@link MAX_REMEMBERED_LINES} で
 * 落ちるのと同じ向き。7.1）。
 *
 * **節より前の文字は足しも引きもしない。** 最後の1行を消したときは**見出しごと落とす**ので、
 * 残るのは節を作るときに入れた見出しの前の改行だけになる（空の節を `systemPrompt` に載せない）。
 */
function personaWithoutRememberedLine(content: string, target: string): string | undefined {
  const start = rememberedSectionStart(content)
  if (start === undefined) {
    return undefined
  }

  const lines = rememberedLines(content.slice(start))
  const at = lines.findIndex((line) => line.slice(2).trim() === target)
  if (at < 0) {
    return undefined
  }

  const before = content.slice(0, start)
  const kept = lines.filter((_, index) => index !== at)
  return kept.length === 0
    ? before
    : `${before}${REMEMBERED_SECTION_HEADING}\n\n${kept.join("\n")}\n`
}

/**
 * 節の見出しが始まる位置（無ければ undefined）。**見出しは最後のものを見る** —
 * 節はいちばん最後に置くと決めてあるので、そこから末尾までが機械の書いた領域になる。
 */
function rememberedSectionStart(content: string): number | undefined {
  const marker = `\n${REMEMBERED_SECTION_HEADING}`
  for (let at = content.lastIndexOf(marker); at >= 0; at = content.lastIndexOf(marker, at - 1)) {
    if (isHeadingLine(content, at + 1)) {
      return at + 1
    }
  }

  return isHeadingLine(content, 0) ? 0 : undefined
}

/** その位置から見出しの1行がちょうど始まっているか（`## 覚えたことメモ` のような行は別物）。 */
function isHeadingLine(content: string, at: number): boolean {
  if (!content.startsWith(REMEMBERED_SECTION_HEADING, at)) {
    return false
  }

  const next = content.charAt(at + REMEMBERED_SECTION_HEADING.length)
  return next === "" || next === "\n" || next === "\r"
}

/** 節の中の箇条書きの行（見出しと空行、人が書いた地の文は持ち越さない）。 */
function rememberedLines(section: string): readonly string[] {
  return section
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.startsWith("- "))
}

/** 節を新しく作るときに、見出しの前に入れる改行（元の末尾と合わせて空行1つになる形）。 */
function headingSeparator(content: string): string {
  if (content === "" || content.endsWith("\n\n")) {
    return ""
  }

  return content.endsWith("\n") ? "\n" : "\n\n"
}

function readOptionalFile(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}
