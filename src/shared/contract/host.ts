// ホスト（ターミナル環境）へ頼むコマンドの契約（`docs/glossary.md`「契約」）。受け手は
// `src/server/host/adapter/host-procedure.ts`、委ね先の行は `src/server/host/core/host-command.ts`。

import { z } from "zod"

import { commandBase } from "../command.ts"

/**
 * レポートから開く依頼のパスの上限。**形の検査ではなく素朴な上限**（実際に開けるかどうかは
 * git 管理下の一覧にあるかどうかで決まるので、ここでは長さだけを見る）。
 */
const MAX_OPEN_FILE_PATH_LENGTH = 1_000

export const hostContract = {
  /**
   * レポートに書かれたパス（inline code・フェンスのファイル名・相対リンクの3か所。
   * `docs/display.md` 4.2「各表示物」）を Orca のエディタで開く。**`path` は cwd 相対で、
   * git 管理下の一覧にあるものだけを渡す**——ブラウザ側（`repository-link.tsx`）が
   * 描くときに一覧と照合して押せる部品にするが、**サーバ側でも同じ一覧と照合してから
   * `orca file open` を呼ぶ**（任意の文字列を外部コマンドへ渡さない。`src/session-start.ts`）。
   * **行番号は運ばない**（Orca に口が無い。表示の `:12` は残るが、開くのは裸のパスだけ）。
   */
  openFile: commandBase.input(z.object({ path: z.string().min(1).max(MAX_OPEN_FILE_PATH_LENGTH) })),
}
