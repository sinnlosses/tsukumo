# 現在の状態

最終更新: 2026-09-09（**リポジトリの立ち上げと実装スタックの決定**。2026-09-08 の検討メモ
（`work.md`）を `docs/` の正典と初期タスク6件に起こし、**T-001 を完了**した）

スタックは **Bun + TypeScript**、チェックコマンドは **`bun run check`**。
コードは CLI の入口とテスト1ファイルだけで、追従も描画もまだ無い。次は T-002 か T-003。

## 完了したこと（このセッション）

### 2026-09-09 AI向けドキュメントの構築

helm-yadokari の `.claude/` / `docs/` / `CLAUDE.md` / `develop/` の構成を、このリポジトリ向けに
移植した。

- `.claude/skills/` に14スキルを配置。`codebase-design` / `domain-modeling` / `diagnosing-bugs` /
  `grilling` / `research` / `resolving-merge-conflicts` / `tdd` は汎用なのでそのまま、
  `next-task` / `plan-tasks` / `implement` / `code-review` は tsukumo 向けに書き換えた
  （`pnpm check` 固定だった箇所を「チェックコマンド」に一般化し、issue/spec の出典を
  `docs/requirements.md` と `develop/tasks.json` に差し替えた）
- `docs/requirements.md` / `docs/architecture.md` / `docs/glossary.md` を `work.md` の
  調査結果・技術制約・採用アーキテクチャから新規に起こした
- `docs/coding-standards.md` は実装スタック未決のため**言語非依存の原則**として書き、
  末尾に「スタック決定後に埋めること」のチェックリストを置いた
- `docs/workflow.md` は helm-yadokari のものをほぼそのまま移植し、`pnpm check` への参照と
  難易度の例だけを差し替えた
- `work.md` の内容は当時のまま `docs/history/direction.md` へアーカイブした

### 2026-09-09 実装スタックの決定（T-001）

**T-001 完了。** Bun + TypeScript に決定し、雛形とチェックコマンドを整備した。
`bun run check` は `tsc --noEmit` → `oxlint` → `oxfmt --check` → `bun test` の順で走り、
2 pass / 0 fail で通っている。`docs/coding-standards.md` の「スタック決定後に埋めること」は
全項目を消化して節ごと削除し、`Bun固有APIに寄せない`（`node:` の標準APIに寄せる）と
`整形の対象外`（上流由来の `.claude/` は oxfmt にかけない）の2節を足した。

**判断の記録**: 画像デコード・量子化のライブラリは要らないと分かった（iTerm2 inline images は
PNG を base64 するだけで、リサイズも端末側がやる）。そのうえで**当面は外部コマンドにも依存
しない**方針にした（使われない分岐をアダプタに先置きしないため）。
`docs/architecture.md`「画像処理に外部コマンドを使わない（当面）」に残した。

**副産物の実測**: 画像プロトコルのプローブを VS Code 統合ターミナルと Orca で実行したが、
iTerm inline も Sixel も**どちらの端末でも表示されなかった**。T-004 の背景と
`docs/requirements.md`「7. 未決事項」に反映済み。

## 次にやること

依存の無い順に:

- **T-002**: 立ち絵の素材方針の決定とサンプル1体（`opus` / **ユーザーとの合意が必要**）
- **T-003**: サイドカーの PoC（transcript 追従 → 吹き出し。文字だけ）— 依存は解決済み。
  **委譲できる最初のタスク**
- T-004: 画像プロトコルで立ち絵を表示、使えない環境はテキストへ — T-002・T-003 の後
- T-005: hook で状態ファイルを書き、表情・衣装を切り替える — T-003 の後
- T-006: statusline 併走（案B）— T-005 の後。優先度は低い

**T-002 はユーザーとの合意を含むので `/loop /next-task` の自動進行に載せない。**

## 未解決

- **どの端末でも画像プロトコルが1つも通っていない**（2026-09-09 実測）。iTerm inline も Sixel も
  VS Code 統合ターミナル・Orca の両方で表示されなかった。VS Code は
  `terminal.integrated.enableImages` が未設定（既定 `false`）だったのが原因の可能性が高いので、
  **有効化して再確認するのが T-004 の最初の一歩**。ここが通らないと「立ち絵付き」という
  企画の前提が変わる（吹き出しだけのツールになる）
- **立ち絵の素材をどう調達するかが決まっていない。** 権利の扱いを含むのでユーザー判断（T-002）

## 注意

次のセッションで踏み外しやすい点:

- **`~/.claude/settings.json` の hooks と statusLine は orca（`~/.orca/agent-hooks/`）が
  専有している。** 設定を足すときは既存エントリを壊さず追記すること。上書きすると orca が
  黙って動かなくなる
- **`tmux` は未導入で、要件にもしない。** ペイン分割は VS Code の split terminal で代用する。
  同様に `chafa` / `viu` / `timg` / `img2sixel` / `deno` / `cargo` も未導入（2026-09-09 実測）。
  **`bun` は導入済み**（2026-09-08 の記録では未導入だった）
- **transcript はユーザーの生の会話ログ。** 複製しない・外部に送らない・全文をログに出さない
  （`docs/coding-standards.md`「会話内容の扱い」）
- **`oxfmt` は Markdown も整形する。** `.claude/` は `.prettierignore` で除外してあるが、
  `docs/` は対象。表の桁が全角幅で揃うので歓迎してよい変化だが、**整形前提で書く**こと
  （手で桁を合わせても上書きされる）
- **環境の実測値は1日で変わった。** 2026-09-08 に「未導入」だった `bun` が入り、
  ターミナルも `vscode` から `Orca` に変わっていた。`docs/requirements.md`
  「5. 実行環境・非機能要件」の値も**前提にする前にその場で確認する**
