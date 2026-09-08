# 現在の状態

最終更新: 2026-09-09（**リポジトリの立ち上げ**。2026-09-08 の検討メモ（`work.md`）を
`docs/` の正典と `develop/tasks.json` の初期タスク6件に起こした。コードはまだ1行も無い）

実装スタックが未決のため、**チェックコマンドはまだ存在しない**。最初に着手すべきは T-001。

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

## 次にやること

依存の無い順に:

- **T-001**: 実装スタックの決定と雛形・チェックコマンドの整備（`opus` / ユーザーとの合意が必要）
- **T-002**: 立ち絵の素材方針の決定とサンプル1体（`opus` / ユーザーとの合意が必要）
- T-003: サイドカーの PoC（transcript 追従 → 吹き出し。文字だけ）— T-001 の後
- T-004: 画像プロトコルで立ち絵を表示、使えない環境はテキストへ — T-002・T-003 の後
- T-005: hook で状態ファイルを書き、表情・衣装を切り替える — T-003 の後
- T-006: statusline 併走（案B）— T-005 の後。優先度は低い

**T-001 と T-002 はどちらもユーザーとの合意を含むので `/loop /next-task` の自動進行に載せない。**
最初のセッションは、この2件を人がいる場で片付けるところから始める。

## 未解決

- **実装スタックが決まっていない。** 決まるまで `CLAUDE.md`「よく使うコマンド」は空欄で、
  `docs/coding-standards.md` にも言語固有の規約が書けない（T-001）
- **立ち絵の素材をどう調達するかが決まっていない。** 権利の扱いを含むのでユーザー判断（T-002）
- **VS Code 統合ターミナルで画像プロトコルが本当に通るかは未確認。** 通らなければ
  「立ち絵付き」という企画の前提が変わる。T-004 の手順1で最初に確かめる

## 注意

次のセッションで踏み外しやすい点:

- **`~/.claude/settings.json` の hooks と statusLine は orca（`~/.orca/agent-hooks/`）が
  専有している。** 設定を足すときは既存エントリを壊さず追記すること。上書きすると orca が
  黙って動かなくなる
- **`tmux` は未導入で、要件にもしない。** ペイン分割は VS Code の split terminal で代用する。
  同様に `chafa` / `viu` / `timg` / `img2sixel` / `deno` / `bun` も未導入（2026-09-08 実測）
- **transcript はユーザーの生の会話ログ。** 複製しない・外部に送らない・全文をログに出さない
  （`docs/coding-standards.md`「会話内容の扱い」）
- **リポジトリ直下の `work.md` は git 管理外のまま残っている。** 内容は
  `docs/history/direction.md` にアーカイブ済みなので、正典としては扱わない。消してよいかは
  ユーザーに確認する
- 環境の実測値（2026-09-08 時点）は `docs/requirements.md`「5. 実行環境・非機能要件」にある。
  **時間が経つと変わる**ので、前提にする前にその場で確認する
