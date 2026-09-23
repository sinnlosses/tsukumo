// `~/.tsukumo/` に積む日付ごとの JSONL（token-usage-log.ts・chat-archive.ts・context-usage-log.ts）
// が同じ手で書き写していた読み書きをここに1つにする。**境界（どこに・何のために書くか）は
// 名乗らず、JSONL という形式の扱い方だけを知っている**（`docs/design.md` 2章
// 「`lib/` と `utils/` に置く基準」——「adapter/lib/ はその下の段で、境界を名乗らず、技術の
// 扱い方だけを知っている道具（『JSONL を1行ずつ読む』）が入る」の例そのもの）。
//
// **スキーマの検証・索引ファイルの扱い・後ろから読む読み戻しは呼び出し元が持つ。** ここが持つのは
// 「1行を追記する」「日付のファイル名を並べる」「行を JSON として読む」だけで、行の形が正しいかは
// 見ない（`unknown` のまま返し、検証は呼び出し元の zod スキーマに委ねる）。
//
// 書けなくても・読めなくても例外を投げない（常駐プロセスは1回の失敗で落ちない。
// `docs/coding-standards.md`「エラーハンドリング」）。**壊れた行は1行ずつ読み飛ばす**（JSONL は
// 壊れても被害が1行に収まる）。

import { appendFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs"
import { dirname } from "node:path"

/** 日付だけで積むファイルの名前（`YYYY-MM-DD.jsonl`）。**これ以外のファイルは対象にしない。** */
const DATE_FILE_NAME = /^\d{4}-\d{2}-\d{2}\.jsonl$/

/** 1行を追記する。ディレクトリが無ければ作る。失敗したその回は諦めて次へ進む。 */
export function appendJsonLine(path: string, record: unknown): void {
  try {
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, `${JSON.stringify(record)}\n`)
  } catch {
    // 書けなかった回は諦めて次へ進む。
  }
}

/**
 * 1ファイルの行を JSON として読む（書いた順のまま）。**壊れた JSON・空行・読めないファイルは
 * 読み飛ばす。** 鍵が揃っているか・版が合っているかは見ない——呼び出し元のスキーマが検証する。
 */
export function readJsonLines(path: string): readonly unknown[] {
  return readRawLines(path).flatMap((line) => {
    const parsed = parseJson(line)
    return parsed === undefined ? [] : [parsed]
  })
}

/**
 * 日付のファイル名（`YYYY-MM-DD.jsonl`）だけを古い→新しい順に並べる（読めないディレクトリは空）。
 * **範囲で絞る・新しい順にする判断は呼び出し元が行う**（`token-usage-log.ts` は期間で絞り、
 * `chat-archive.ts` は絞らずに新しい順へ並べ替える。並べ方の元は同じ1つ）。
 */
export function dateFileNames(dir: string): readonly string[] {
  try {
    return readdirSync(dir)
      .filter((name) => DATE_FILE_NAME.test(name))
      .toSorted()
  } catch {
    return []
  }
}

/** 1ファイルの生の行（読めないファイルは空。空行は落とす）。 */
function readRawLines(path: string): readonly string[] {
  try {
    return readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line !== "")
  } catch {
    return []
  }
}

/** JSON として読む（壊れていれば undefined。JSONL は壊れても被害が1行）。 */
function parseJson(line: string): unknown {
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}
