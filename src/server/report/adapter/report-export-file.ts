// 書き出した最終レポートの保存先。保存先のディレクトリに触るのはここだけ。
// 書いたパスをプロセスのメモリに覚え、開く・表示するは覚えたパスだけを外のコマンドの口へ渡す（画面から届いた任意のパスを渡さない）。
// 書いた中身はログに出さない。

import { readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { isObjectType } from "remeda"

import type { ReportExportFolder, ReportExportWrite } from "../core/export/report-export-command.ts"

/** 書いたファイルを外で開く口。`browser` は既定のアプリで開く、`finder` は Finder で表示する。 */
export type LaunchExportedFile = (path: string, mode: "browser" | "finder") => Promise<boolean>

/** 同じ名前が書く間にできたとき、名前を決め直す回数の上限。 */
const MAX_WRITE_ATTEMPTS = 5

const WRITE_FAILED = { kind: "failed" } as const satisfies ReportExportWrite

export function createReportExportFolder(options: {
  readonly directory: string
  readonly launch: LaunchExportedFile
}): ReportExportFolder {
  const written = new Set<string>()
  const launchWritten = (path: string, mode: "browser" | "finder"): Promise<boolean> =>
    written.has(path) ? options.launch(path, mode) : Promise.resolve(false)
  return {
    write: async (content, nameOf) => {
      const saved = await writeNew(options.directory, content, nameOf)
      if (saved.kind === "written") {
        written.add(saved.path)
      }
      return saved
    },
    openInBrowser: (path) => launchWritten(path, "browser"),
    revealInFinder: (path) => launchWritten(path, "finder"),
  }
}

/** 今ある名前と重ならない名前で書く。`wx` で開くので、同じ名前のファイルを上書きしない。 */
async function writeNew(
  directory: string,
  content: string,
  nameOf: (existingNames: ReadonlySet<string>) => string,
): Promise<ReportExportWrite> {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const fileName = nameOf(new Set(await readNames(directory)))
    const path = join(directory, fileName)
    const outcome = await writeExclusive(path, content)
    if (outcome === "written") {
      return { kind: "written", path, fileName }
    }
    if (outcome === "failed") {
      return WRITE_FAILED
    }
  }
  return WRITE_FAILED
}

/** 保存先にある名前。読めないときは空で返し、書く段で失敗させる。 */
async function readNames(directory: string): Promise<readonly string[]> {
  try {
    return await readdir(directory)
  } catch {
    // 保存先が無い・読めないときは、続く書き込みが同じ理由で失敗して断る
    return []
  }
}

async function writeExclusive(
  path: string,
  content: string,
): Promise<"written" | "exists" | "failed"> {
  try {
    await writeFile(path, content, { encoding: "utf8", flag: "wx" })
    return "written"
  } catch (error) {
    return isObjectType(error) && "code" in error && error.code === "EEXIST" ? "exists" : "failed"
  }
}
