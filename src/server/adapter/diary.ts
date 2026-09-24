// 日記の読み書き（`docs/design.md`「日記の受け取りと保存」「保存の形」）。ファイルに触るのは
// ここだけ（原則3。1ファイル = 1つの境界）。置き場は
// `~/.tsukumo/diary/<リポジトリ>/<YYYY-MM-DD>.json`（`TSUKUMO_HOME` を分けていればその下）。
//
// **`<リポジトリ>` は共有の `.git`（`git rev-parse --path-format=absolute --git-common-dir`）の
// 親ディレクトリの名前と、`.git` の絶対パスの SHA-256 の先頭12桁を `-` でつないだもの**
// （作業ツリーではなく共有の `.git` で見分けるので、同じリポジトリのどの作業ツリーから書いても
// 同じ日記帳に入る）。`git` を起こすのは `./git.ts`（`main-history.ts` / `task-summary.ts` と
// 同じ口）。
//
// 書けなくても・読めなくても例外を投げない（常駐プロセスは1回の失敗で落ちない。
// `docs/coding-standards.md`「エラーハンドリング」）。**日記の文面はログに出さない**
// （`docs/coding-standards.md`「会話内容の扱い」）。

import { createHash, randomBytes } from "node:crypto"
import { mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"

import {
  DIARY_VERSION,
  readDiary,
  type DailyDiaryStatus,
  type Diary,
  type DiaryBookmark,
  type DiaryParagraph,
} from "../../shared/diary.ts"
import { readOptionalFile } from "./character-pack.ts"
import { runGit } from "./git.ts"
import { isoWithOffset } from "./local-time.ts"
import { tsukumoHomeDir } from "./tsukumo-home.ts"

const DIARY_DIR_NAME = "diary"

/** `<リポジトリ>` の SHA-256 の取り分（先頭12桁）。 */
const REPOSITORY_HASH_LENGTH = 12

/** `readdir` で日記のある日を拾うときの、ファイル名の形。 */
const DIARY_FILE_NAME_PATTERN = /^(\d{4}-\d{2}-\d{2})\.json$/

/** 日記の置き場の根（`~/.tsukumo/diary`。`TSUKUMO_HOME` を分けていればその下）。 */
export function diaryDir(root: string = tsukumoHomeDir()): string {
  return join(root, DIARY_DIR_NAME)
}

/** 1段落を書き足すのに渡すもの。`writer` は書いた時点のパック（ディレクトリ名と表示名）。 */
export type DiaryParagraphInput = {
  readonly date: string
  readonly writtenAtEpochMilliseconds: number
  readonly body: string
  readonly expression: string
  readonly writer: { readonly pack: string; readonly name: string }
  readonly bookmark: DiaryBookmark
}

/**
 * その日の日記に1段落を書き足す（無ければ新しく作る）。**しおりは渡した値に差し替える**
 * （前の段落のしおりは残らない）。**読めない・版の違う既存ファイルは、新しい1段落だけの
 * ファイルで置き換える**（壊れたファイルのために書けなくしない）。一時ファイルに書いてから
 * 置き換えるので、途中で落ちても前の版が残る。
 *
 * リポジトリが見分けられない（`git` が無い・共有の `.git` が取れない）ときと、書き込みが
 * 失敗したときは `false`。
 */
export async function appendDiaryParagraph(
  cwd: string,
  input: DiaryParagraphInput,
  root: string = tsukumoHomeDir(),
): Promise<boolean> {
  const repositoryId = await repositoryDiaryId(cwd)
  if (repositoryId === undefined) {
    return false
  }

  const path = diaryFilePath(root, repositoryId, input.date)
  const existing = readDiaryFile(path)
  const base: Diary = existing ?? {
    version: DIARY_VERSION,
    date: input.date,
    paragraphs: [],
    bookmark: { kind: "none" },
  }
  const paragraph: DiaryParagraph = {
    writtenAt: isoWithOffset(input.writtenAtEpochMilliseconds),
    body: input.body,
    expression: input.expression,
    writer: input.writer,
  }
  const next: Diary = {
    ...base,
    date: input.date,
    paragraphs: [...base.paragraphs, paragraph],
    bookmark: input.bookmark,
  }
  return writeDiaryFileAtomic(path, next)
}

/**
 * その日の日記の状態を読む（`DailyAchievement.diary` に載せる形）。**ファイルが無い・
 * リポジトリが見分けられないときは `none`、ファイルはあるのに読めない（JSON が壊れている・
 * 版が違う）ときだけ `unreadable`**（成果そのものは配る。`docs/design.md`「日記の受け取りと保存」）。
 */
export async function readDiaryDay(
  cwd: string,
  date: string,
  root: string = tsukumoHomeDir(),
): Promise<DailyDiaryStatus> {
  const repositoryId = await repositoryDiaryId(cwd)
  if (repositoryId === undefined) {
    return { kind: "none" }
  }

  const path = diaryFilePath(root, repositoryId, date)
  const raw = readOptionalFile(path)
  if (raw === undefined) {
    return { kind: "none" }
  }
  const diary = parseDiaryContent(raw)
  return diary === undefined ? { kind: "unreadable" } : { kind: "written", diary }
}

/**
 * 日記のある日の一覧（新しい順）。中身は読まず、置き場の `readdir` 1回でファイル名だけを見る
 * （`docs/design.md`「日記の受け取りと保存」）。リポジトリが見分けられない・置き場が無いときは
 * 空の並び。
 */
export async function listDiaryDates(
  cwd: string,
  root: string = tsukumoHomeDir(),
): Promise<readonly string[]> {
  const repositoryId = await repositoryDiaryId(cwd)
  if (repositoryId === undefined) {
    return []
  }

  const entries = readDirNames(join(diaryDir(root), repositoryId))
  const dates = entries.flatMap((name) => {
    const match = DIARY_FILE_NAME_PATTERN.exec(name)
    return match?.[1] === undefined ? [] : [match[1]]
  })
  return [...dates].sort((left, right) => (left < right ? 1 : left > right ? -1 : 0))
}

function diaryFilePath(root: string, repositoryId: string, date: string): string {
  return join(diaryDir(root), repositoryId, `${date}.json`)
}

/**
 * 共有の `.git` から `<リポジトリ>` を組み立てる（冒頭のコメント）。`git` が無い・リポジトリでない
 * ときは `undefined`。
 */
async function repositoryDiaryId(cwd: string): Promise<string | undefined> {
  const result = await runGit(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
  if (result.kind !== "output") {
    return undefined
  }
  const gitDir = result.stdout.trim()
  if (gitDir === "") {
    return undefined
  }
  const repositoryRootName = basename(dirname(gitDir))
  const hash = createHash("sha256").update(gitDir).digest("hex").slice(0, REPOSITORY_HASH_LENGTH)
  return `${repositoryRootName}-${hash}`
}

function readDiaryFile(path: string): Diary | undefined {
  const raw = readOptionalFile(path)
  return raw === undefined ? undefined : parseDiaryContent(raw)
}

/** JSON として読めない・形が崩れていれば `undefined`（呼び出し側が「壊れた既存ファイル」として扱う）。 */
function parseDiaryContent(content: string): Diary | undefined {
  try {
    return readDiary(JSON.parse(content))
  } catch {
    return undefined
  }
}

/** 一時ファイルに書いてから置き換える。失敗したら `false`（例外を投げない）。 */
function writeDiaryFileAtomic(path: string, diary: Diary): boolean {
  const tempPath = `${path}.${randomBytes(6).toString("hex")}.tmp`
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(tempPath, JSON.stringify(diary))
    renameSync(tempPath, path)
    return true
  } catch {
    return false
  }
}

/** ディレクトリの中のファイル名だけを読む。無い・読めないときは空。 */
function readDirNames(dir: string): readonly string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}
