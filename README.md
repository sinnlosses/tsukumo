# tsukumo

**キャラクターと一緒に楽しく仕事をするためのターミナル環境。**
実現の手段はサイドカー方式で、Claude Code 本体のTUIには**一切割り込まず**、別ペインで常駐する
プロセスがセッションの transcript（JSONL）を追従して描画する。

設計判断・要件・用語の正典は `docs/` にある。**このREADMEはセットアップ手順だけを持つ**
（詳細は `CLAUDE.md` と `docs/architecture.md` を参照）。

## セットアップ

- Bun 1.3 以上が必要
- `bun install` で依存関係をインストール

## 使い方

```bash
bun run start <transcript.jsonl>
```

引数を省略すると、後述の SessionStart hook が書き出す `~/.tsukumo/transcript-path` を
追従先にする（**引数を渡した場合はそちらを優先する**）。Orca の split terminal で `claude` と
別のペインに常駐させて使う（画面レイアウトは `docs/requirements.md` 4.7）。

## hook を登録する（表情・衣装の切り替えと transcript パスの自動解決）

tsukumo は次の2つを hook から受け取る:

- **状態ファイル**（`~/.tsukumo/state.json`）: hook イベント種別と実行中のモデル名。
  表情・衣装の切り替えに使う
- **transcript パス**（`~/.tsukumo/transcript-path`）: SessionStart hook が書き出す。
  引数を省略したときの追従先になる

どちらも `hooks/state.sh` が書く。**この hook は `~/.claude/settings.json` に登録して**
初めて動く。

### 前提: `~/.claude/settings.json` は上書きせず追記する

**`hooks/state.sh` は自動では登録されない。** `~/.claude/settings.json` はユーザーの
グローバル設定なので、**登録は承認を得たうえで手動で行う**。編集する前にバックアップを取ること。

登録するときは次を守ること:

- **`~/.claude/settings.json` の `hooks` は、各イベント名をキーにした配列**
  （`{ "matcher"?: string, "hooks": [{ "type": "command", "command": "..." }] }` の配列）。
  **既存の配列を上書きせず、新しい要素を1つ追記する。** 環境によっては `SessionStart` /
  `PreToolUse` / `Stop` / `StopFailure` / `PostToolUseFailure` などが既に他のツール
  （このリポジトリの検討時点では orca）に占有されていることがある。
  上書きすると、そちらが黙って動かなくなる
- 編集後は JSON として妥当か確認してから保存する（`python3 -m json.tool
~/.claude/settings.json > /dev/null` などで検証できる）

### 登録する内容

`hooks/state.sh` を絶対パスで指すコマンドを、次の5イベントに追記する。**マッチャーは
イベントによって有無が違う**ので、既存エントリの形に合わせる（`PreToolUse` /
`PostToolUseFailure` は `"matcher": "*"` を付け、他は付けない）。

```jsonc
// ~/.claude/settings.json の "hooks" の中。<tsukumoのパス> は実際のクローン先に置き換える。
// 既存の配列がある場合は、その配列に次の要素を1つ追記する（配列ごと置き換えない）。
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "<tsukumoのパス>/hooks/state.sh" }] },
    ],
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [{ "type": "command", "command": "<tsukumoのパス>/hooks/state.sh" }],
      },
    ],
    "Stop": [{ "hooks": [{ "type": "command", "command": "<tsukumoのパス>/hooks/state.sh" }] }],
    "StopFailure": [
      { "hooks": [{ "type": "command", "command": "<tsukumoのパス>/hooks/state.sh" }] },
    ],
    "PostToolUseFailure": [
      {
        "matcher": "*",
        "hooks": [{ "type": "command", "command": "<tsukumoのパス>/hooks/state.sh" }],
      },
    ],
  },
}
```

具体例（`SessionStart` に既存の要素が1つあるとき、末尾に追記する）:

```jsonc
// 変更前（他のツールが1つ登録している状態の例）
"SessionStart": [
  { "hooks": [ { "type": "command", "command": "（既存のコマンド）" } ] }
]

// 変更後（既存の要素はそのまま、末尾に tsukumo の要素を1つ足す）
"SessionStart": [
  { "hooks": [ { "type": "command", "command": "（既存のコマンド）" } ] },
  { "hooks": [ { "type": "command", "command": "<tsukumoのパス>/hooks/state.sh" } ] }
]
```

`<tsukumoのパス>` はこのリポジトリのクローン先の絶対パス（`hooks/state.sh` に
実行権限が付いていること。`chmod +x hooks/state.sh` 済みならそのままでよい）。

登録後、**新しく `claude` を起動したセッションから**有効になる（`SessionStart` hook は
セッション開始時にしか発火しないため、起動中のセッションには反映されない）。

### 状態ファイルの仕様（statusline 併走などで参照する場合）

- 場所: `~/.tsukumo/state.json`（JSON1オブジェクト）。`event`（hook イベント名の文字列）と
  `model`（実行中のモデル名。無いこともある）を持つ
- 書き込みは同一ディレクトリへの一時ファイル書き込み＋ `rename` による原子的差し替え
- **単一の既知の場所を前提にしている。** 複数の Claude セッションが同時に走っていても
  分離しない（最後に書き込んだセッションの状態で上書きされる、PoCとしての割り切り）
- 状態ファイルが無い・壊れている・未知のイベント種別のときは、tsukumo 側は既定の表情・
  衣装にフォールバックする（落ちない）

## 開発

```bash
bun run check                 # typecheck + lint + format:check + test
bun test                      # テストのみ
```

規約・アーキテクチャの詳細は `CLAUDE.md` から辿れる（`docs/architecture.md` /
`docs/coding-standards.md` / `docs/requirements.md` / `docs/glossary.md`）。
