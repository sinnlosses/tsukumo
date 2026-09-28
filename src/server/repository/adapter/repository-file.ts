// 作業ディレクトリの git 管理下のファイルを列挙する（`git ls-files`）。
//
// 返すのはパスだけで、ファイルを開かない（入力欄の `@` 補完が要るのは名前だけ。取り込む情報を最小に保つ）。
// パスは `cwd` からの相対で、サブディレクトリで起動していればその下だけが並ぶ（利用者が打つパスと同じ基準になる）。
//
// git リポジトリでない・`git` が無い・時間がかかりすぎたときは空を返す（例外を投げない）。
// git リポジトリでないのは異常ではないので、ターミナルにも何も出さない。

import { runGit } from "./git.ts"

/**
 * 返す件数の上限。巨大なリポジトリでも応答の大きさを見切れる形にしておく（ブラウザ側は一覧を1回取ってから絞り込む）。
 * 超えた分は黙って落ちる。
 */
export const MAX_REPOSITORY_FILES = 20000

/**
 * git 管理下のファイルのパスを、`cwd` からの相対で返す。失敗したときは空。
 * `-z` で NUL 区切りにする（`git` は既定だと変わった名前を引用符で包んで書き換えるので、そのままではパスとして使えない）。
 */
export async function listRepositoryFiles(cwd: string): Promise<readonly string[]> {
  const outcome = await runGit(cwd, ["ls-files", "-z"])
  return outcome.kind === "output" ? splitNulSeparated(outcome.stdout) : []
}

/** NUL 区切りの出力をパスの並びにする（末尾の NUL が作る空文字は落とす）。 */
function splitNulSeparated(output: string): readonly string[] {
  return output
    .split("\0")
    .filter((path) => path !== "")
    .slice(0, MAX_REPOSITORY_FILES)
}
