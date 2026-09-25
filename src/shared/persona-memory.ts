// 覚えたこと（`persona.md` の `## 覚えたこと`。`docs/design.md` 7.1）に関わる、両側が見る値。
//
// **1行の長さの上限だけをここに置く。** 節の見出し・持てる行数・書き込みそのものは
// `src/server/chat/adapter/persona-memory.ts` の仕事（外の世界＝ファイルに触るので shared には置けない）。
// ここに置くのは、画面から1行を消すコマンド（`src/shared/command.ts` の `chat.forgetRememberedLine`）の
// 検証と、書き込み側の上限が同じ数を指すようにするため（`docs/coding-standards.md`
// 「定数・テーブル・設定の定義」）。

/** 覚えたこと1行の長さの上限（文字数）。書き込み側の上限と同じ値（`docs/design.md` 7.1 の表）。 */
export const MAX_REMEMBERED_LINE_LENGTH = 120
