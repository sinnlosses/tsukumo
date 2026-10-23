// ホスト（ターミナル環境）へ頼むコマンドの契約。

import { z } from "zod"

import { commandBase } from "../command.ts"
import { MAX_REPOSITORY_PATH_LENGTH } from "../repository/repository-file-list.ts"

export const hostContract = {
  /**
   * レポートに書かれたパス（inline code・フェンスのファイル名・相対リンクの3か所）をホストで開く（Orca はエディタ、ブラウザのホストは OS の既定のアプリ）。
   * `path` は cwd 相対で、git 管理下の一覧にあるものだけを渡す。
   * サーバ側でも同じ一覧と照合してからホストのコマンドを呼ぶ（任意の文字列を外部コマンドへ渡さない）。
   * 行番号は運ばない（ホストに口が無い。表示の `:12` は残るが、開くのは裸のパスだけ）。
   */
  openFile: commandBase.input(
    z.object({ path: z.string().min(1).max(MAX_REPOSITORY_PATH_LENGTH) }),
  ),
}
