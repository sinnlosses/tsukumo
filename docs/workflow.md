# タスク運用：このリポジトリでの上乗せ

**運用の正典は `~/.claude/skills/task-workflow/` の `WORKFLOW.md`**（複数のプロジェクトで
共通。フィールド定義・`summary` の書き方・`difficulty` の基準・evidence の粒度・
コミットメッセージ・指示メモ・アーカイブのトリガーと手順は、すべてそちらにある）。
プロジェクト固有の値は `develop/workflow.json` が持つ（このリポジトリでは
`checkCommand` = `bun run check`、`formatCommand` = `bun run format`）。

**2026-09-12 に、共通版と重複していた節をこの文書から落とした**（正典が二重になり、片方だけ
直して気づかない事故を避けるため）。ここに残すのは、**共通版が知らないこのリポジトリの事情**だけ。

## タスクを書くとき・受け入れるとき

**`plan-tasks` と `next-task` は、共通版の手順に加えて次を守る。**

- **目視でしか確かめられないものは、何をどう見れば合格なのかまで書く。** 「適切に」
  「きれいに」のような読み手で結論が変わる語を使わない。**合成データの使い捨てサーバ＋`curl`＋
  Chrome DevTools Protocol で数値として読めることが多い**（2026-09-12 に T-070 / T-082 で
  実証。`claude` を起こさないので API も使わない）。その形にできるなら `/loop` に載せてよく、
  人の目でしか判断できないこと（色・間合い・好み）が出たらそこで止めて報告する
- **`~/.claude/settings.json` を触るタスクには、既存の hooks / statusLine を壊さないことを
  必ず書く**（orca が専有している。`CLAUDE.md` の IMPORTANT と `develop/progress.md`「注意」）
- **環境側の前提はその場で確かめる。** ターミナルの画像プロトコル対応、外部コマンドの有無、
  常駐プロセスの生死は時間とともに変わる。`develop/progress.md`「注意」を鵜呑みにしない
- **spec の出典**は `docs/requirements.md` と `develop/tasks.json` の各タスク本文
  （issueトラッカーは未設定）。**standards の出典**は `CLAUDE.md` ＋
  `docs/coding-standards.md` ＋ `docs/architecture.md` の3つ。`code-review` スキルが
  「リポジトリ内から探す」と言うのはこれらのこと
- **作業ブランチは切らず `main` に直接コミットする**（`CLAUDE.md`「Git運用」）
- **会話の内容をログ・`evidence`・テストのフィクスチャに写さない**
  （`docs/coding-standards.md`「会話内容の扱い」。他のどの規約よりも優先する）

## `summary` の長さ

共通版は「1行に収める」とだけ言う。**このリポジトリでは全角40文字以内**を目安にする
（サイドバーのタスク一覧が2列の行で出すため。`src/presentation/view.ts` の `taskItemHtml`）。

## 関連

- 手順そのもの: `CLAUDE.md`「進捗管理とHandoff」
- 運用の正典: `~/.claude/skills/task-workflow/WORKFLOW.md`
- 完了タスク・過去セッションの記録: `docs/history/tasks-archive.md` /
  `docs/history/progress-archive.md` / `docs/history/direction.md`
