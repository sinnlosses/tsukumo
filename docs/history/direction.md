# 指示メモのアーカイブ

`develop/direction.md` に書かれたユーザーからの指示を、タスク化した時点で**当時の記述のまま**
ここへ移す（`docs/workflow.md`「指示メモ」参照）。新しいものを上に足す。**後から書き換えない。**

## 2026-09-09

出典: リポジトリ直下の `work.md`（2026-09-08 の会話を保存したもの）。`develop/direction.md` を
経由せず、リポジトリ初期化時にここへ直接アーカイブした。

生成したタスク:

- 「次の一手」1（立ち絵の素材をどうするか決める） → **T-002**
- 「次の一手」2（サイドカーのPoC: JSONL tail → 吹き出し整形 → 描画） → **T-003**
- 「次の一手」3（Sixel で立ち絵を出す実験） → **T-004**
- 「次の一手」4（hook で状態ファイルを書く） → **T-005**
- 併走させるもの（案B: statusline のマスコット） → **T-006**
- 明示されていないが上記すべての前提になる実装スタックの決定 → **T-001**

タスクにしなかった項目:

- 「調査結果」「技術制約」「採用アーキテクチャ」「環境メモ」は指示ではなく確定した事実・決定なので、
  タスクではなく `docs/requirements.md` と `docs/architecture.md` へ正典として移した
- 「タイプライター表示 ＋ VOICEVOX の口パク同期」は本人が「後回しでよい」としているため、
  タスク化せず `docs/requirements.md` 4.2 に「MVPに含めない」と記録した

---

以下、当時の記述をそのまま。

# chara-terminal — ターミナルにキャラクター立ち絵＋吹き出しを出す

作成: 2026-09-08 / 決定: **案C（サイドカー pane）で行く**

## ゴール

Claude Code との会話を、立ち絵付きの吹き出しでターミナルに表示する。

## 調査結果（2026-09-08 時点）

### 既存でやれること

- **`/buddy`** — Claude Code 本体の companion 機能。バイナリ v2.1.263 に
  `companion_intro` という内部リマインダ種別が実在するのを確認済み。
  入力欄の横に ASCII ペットが住み、10秒おきに吹き出しで喋る。18種、ユーザーID から決定論的生成。
- **claude-code-mascot-statusline** (TeXmeijin) — statusline に半角ブロックのピクセル絵マスコット。
  11個の hook イベントで表情9状態、context 消費で毛色が赤くなる。
  **キャラパックが YAML/JSON で差し替え可能**。
  https://github.com/TeXmeijin/claude-code-mascot-statusline
- **VOICEVOX / ずんだもん hooks** — Stop hook で応答を読み上げ。音声のみ、絵は出ない。

### 空いている穴

「**Claude の発話そのものを、立ち絵＋吹き出しで見せる**」ものは存在しない。

## 技術制約（設計の勘所）

Claude Code の TUI は自分で全画面を描画する。したがって:

- `claude | cowsay` のようなパイプ噛ませは**不可**
- hook の stdout はエスケープされてテキスト扱いになるため、
  そこから ANSI や画像プロトコルを流し込むのは**不可**
- → **本体の描画には割り込まない**設計にする。これが案Cを選ぶ理由。

## 採用アーキテクチャ（案C: サイドカー pane）

別ペインで常駐するプロセスが、セッションの JSONL を tail して立ち絵＋吹き出しを描く。
本体と描画が競合しないので何でもできる。

```
┌─────────────────┬──────────────────┐
│ claude (本体TUI) │ サイドカー        │
│                 │  ┌────────────┐  │
│  通常の会話      │  │  立ち絵     │  │
│                 │  └────────────┘  │
│                 │  ╭────────────╮  │
│                 │  │ 最新の発話  │  │
│                 │  ╰────────────╯  │
└─────────────────┴──────────────────┘
       │                    ▲
       │ 書く                │ tail
       ▼                    │
  ~/.claude/projects/<slug>/<session-id>.jsonl
       ＋ hook が書く状態ファイル（表情・モデル）
```

### データ源（実証済み）

最新の assistant 発話を抜くワンライナー。動作確認済み:

```bash
jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text' \
  ~/.claude/projects/<slug>/<session-id>.jsonl | tail -1
```

- transcript は `~/.claude/projects/<cwd をスラッグ化>/<session-id>.jsonl`
- hook には `transcript_path` が渡るので、SessionStart hook で既知の場所に書いておけば
  サイドカーが追従先を知れる
- JSONL の type 分布（実測）: `assistant` / `user` / `attachment` / `mode` /
  `permission-mode` / `last-prompt` / `ai-title` ほか

### 機能

- **立ち絵**: VS Code ターミナルは `terminal.integrated.enableImages: true` +
  `gpuAcceleration` で Sixel / iTerm inline 画像が通る → ドット絵でなく本物の立ち絵が出せる
- **表情差分**: hook イベントで切替（PreToolUse=作業中 / Stop=どや顔 / エラー=あわあわ）
- **モデル別の衣装**: haiku=軽装 / sonnet=通常装備 / opus=戦闘配置。
  既存の Asuna output style の掛け声分岐と対応させる
- **タイプライター表示** ＋ VOICEVOX の口パク同期（後回しでよい）
- 副産物: ただのログ tailer なので Codex / Gemini CLI にも流用可能

### 併走させるもの（案B）

statusline 側にも小さいマスコットを出す。mascot-statusline をフォークし、
**hook が書く状態ファイルをサイドカーと共有**すれば二重実装にならない。

## 環境メモ（2026-09-08 実測）

- macOS (Darwin 25.6.0), zsh
- ターミナル: **VS Code 統合ターミナル** (`TERM_PROGRAM=vscode`, `TERM=xterm-256color`)
- あり: `node` (nodebrew), `jq`
- なし: `tmux`, `chafa`, `viu`, `timg`, `img2sixel`, `cowsay`, `deno`, `bun`
  → ペイン分割は VS Code の split terminal で代用できるので tmux は急がない
- Claude Code v2.1.263 / outputStyle: `Asuna` / model: `opus`
- 既存の hooks と statusLine は orca (`~/.orca/agent-hooks/`) が専有中。
  **設定を足すときは既存の orca エントリを壊さないこと**

## 次の一手

1. 立ち絵の素材をどうするか決める（ドット絵を描く / 画像を用意する）
2. サイドカーの PoC: JSONL を tail → 吹き出し整形 → 描画（まず文字だけ）
3. Sixel で立ち絵を出す実験（`terminal.integrated.enableImages` の有効化から）
4. hook で状態ファイルを書く（orca の設定を壊さないよう追記）
