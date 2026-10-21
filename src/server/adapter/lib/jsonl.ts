// 日付ごとの JSONL の読み書き。
// 境界（どこに・何のために書くか）は名乗らず、JSONL という形式の扱い方だけを知っている。
//
// ここが持つのは「行を追記する」「日付のファイル名を並べる」「行を JSON として読む」だけ。
// スキーマの検証・索引ファイルの扱い・後ろから読む読み戻しは呼び出し元が持ち、行の形が正しいかはここでは見ない（`unknown` のまま返す）。
//
// 書けなくても・読めなくても例外を投げない。壊れた行は1行ずつ読み飛ばす。

import {
  appendFileSync,
  closeSync,
  fstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
} from "node:fs"
import { dirname, join } from "node:path"

import { parseJson } from "../../../shared/utils/parse-json.ts"

/** 日付だけで積むファイルの名前（`YYYY-MM-DD.jsonl`）。これ以外のファイルは対象にしない。 */
const DATE_FILE_NAME = /^\d{4}-\d{2}-\d{2}\.jsonl$/

/** 1行を追記する。ディレクトリが無ければ作る。失敗したその回は諦めて次へ進む。書けたら true。 */
export function appendJsonLine(path: string, record: unknown): boolean {
  return appendJsonLines(path, [record])
}

/**
 * 複数行を1回の書き込みで追記する。空なら何もしない（true）。失敗したその回は諦めて次へ進む。書けたら true。
 * 書きかけで落ちて末尾が改行で終わっていないファイルには、改行を補ってから足す（足す最初の行が書きかけの行に繋がって読めなくなるため）。
 */
export function appendJsonLines(path: string, records: readonly unknown[]): boolean {
  if (records.length === 0) {
    return true
  }
  try {
    mkdirSync(dirname(path), { recursive: true })
    const lines = records.map((record) => `${JSON.stringify(record)}\n`).join("")
    appendFileSync(path, endsWithoutNewline(path) ? `\n${lines}` : lines)
    return true
  } catch {
    return false
  }
}

/**
 * 1ファイルの行を JSON として読む（書いた順のまま）。壊れた JSON・空行・読めないファイルは読み飛ばす。
 * 鍵が揃っているか・版が合っているかは見ない。
 */
export function readJsonLines(path: string): readonly unknown[] {
  return readRawLines(path).flatMap((line) => {
    const parsed = parseJson(line)
    return parsed === undefined ? [] : [parsed]
  })
}

/**
 * 日付のファイル名（`YYYY-MM-DD.jsonl`）だけを古い→新しい順に並べる（読めないディレクトリは空）。
 * 新しい順にする判断は呼び出し元が行う。
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

/** {@link dateFileNames} のうち、日付が `fromDate` 以上 `toDate` 以下のものを古い順に返す（`undefined` の側は絞らない）。 */
export function dateFileNamesBetween(
  dir: string,
  fromDate: string | undefined,
  toDate: string | undefined,
): readonly string[] {
  return dateFileNames(dir).filter((name) => {
    const date = name.slice(0, 10)
    return (fromDate === undefined || date >= fromDate) && (toDate === undefined || date <= toDate)
  })
}

/** 日付キー（`YYYY-MM-DD`）の日のファイルのパス。名前の形は {@link dateFileNames} が拾う形と同じ。 */
export function dateFilePath(root: string, dateKey: string): string {
  return join(root, `${dateKey}.jsonl`)
}

/** 1ファイルの行のうち、スキーマを通った行の `data` だけを書いた順に返す。 */
export function readValidLines<T>(
  path: string,
  schema: { safeParse(raw: unknown): { success: true; data: T } | { success: false } },
): readonly T[] {
  return readJsonLines(path).flatMap((raw) => {
    const parsed = schema.safeParse(raw)
    return parsed.success ? [parsed.data] : []
  })
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

/** ファイルがあり、空でなく、最後の1バイトが改行でないとき true。無いファイルは false で、それ以外の読めない失敗は投げる。 */
function endsWithoutNewline(path: string): boolean {
  const fd = openIfExists(path)
  if (fd === undefined) {
    return false
  }
  try {
    const { size } = fstatSync(fd)
    if (size === 0) {
      return false
    }
    const last = Buffer.alloc(1)
    readSync(fd, last, 0, 1, size - 1)
    return last[0] !== NEWLINE_BYTE
  } finally {
    closeSync(fd)
  }
}

/** 読むために開く。無ければ undefined で、それ以外の失敗は投げる。 */
function openIfExists(path: string): number | undefined {
  try {
    return openSync(path, "r")
  } catch (error) {
    if (error instanceof Error && Reflect.get(error, "code") === "ENOENT") {
      return undefined
    }
    throw error
  }
}

const NEWLINE_BYTE = 0x0a
