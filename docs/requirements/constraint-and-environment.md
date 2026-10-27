# tsukumo 要件定義: 技術制約と実行環境

ステータス: **ドラフト**。入口は `docs/requirements.md`（要件定義の全体）。

責務: 3. 技術制約（TUI を使わず SDK で動かす理由）、5. 実行環境・非機能要件。
読む時: 設計を疑う前と、実行時の依存・非機能要件を知りたいとき。
直す時: 技術制約か、実行時の依存・非機能要件を変えたとき。

## 3. 技術制約

**事実**: Claude Code のTUIは自分で全画面を描画する。ここから次が決まる。

- `claude | cowsay` のようにパイプを噛ませる方式は**不可**
- hook の stdout はエスケープされてテキスト扱いになるため、そこから ANSI エスケープや
  画像プロトコルを流し込む方式も**不可**
- **TUI の中にキャラクターを出す方法は無い**

**だから TUI を使わない。** Agent SDK（`@anthropic-ai/claude-agent-sdk`）で Claude Code を動かし、
会話・ツール実行・許可・質問を構造化イベントとして受け取る。描くべきものは全部こちらに届くので、
**割り込む必要がそもそも無くなる**（TUI をそのまま使っていた頃の形と、そこから転換した経緯は
`docs/architecture/adr/0008-sdk-instead-of-tui.md`）。

**SDK で使えることは一次情報で確認済み**（code.claude.com/docs の agent-sdk 各ページ）:
構造化イベント、`canUseTool`（許可と `AskUserQuestion` の両方が届く）、ストリーミング入力モードでの
追加入力と中断、スキルと `.claude/commands`、hook、MCP、Bun サポート。**スラッシュコマンドは
`/<name>` を入力文字列に書けば送れ**、使えるものは `system` の `init` イベントの `slash_commands` に
並ぶ（対話端末が要る `/theme` `/terminal-setup` などは使えない）。

**headless CLI（`claude -p --input-format stream-json`）は採らない。採るなら SDK 一択**
（理由と、PTY で TUI を包む案は `docs/architecture/adr/0008-sdk-instead-of-tui.md` が正典）。

## 5. 実行環境・非機能要件

実装スタック: **Node + TypeScript**（Bun から移した。
理由は `docs/architecture/adr/0002-render-migration-tech-choice.md`）。チェックコマンドは
`pnpm run check`。

実行時の依存は次のとおり:

- **`@anthropic-ai/claude-agent-sdk`**（npm パッケージ）— Claude Code を動かす。
  これが唯一の本質的な実行時依存で、`claude`（Claude Code）は SDK が子プロセスとして起こす
- **`orca` コマンド**— 使うのは **`orca tab list` / `orca goto` / `orca tab create --url`（ページをホストの中に開く・開いているタブを貼り直す）だけ**。
  1つのアダプタに閉じ込め、**無ければその機能を諦めて動作を続ける**（`orca` に何ができるかの
  一覧は `docs/history/decision.md`「requirements.md 5. 実行環境・非機能要件 / Orca の使える機能」）
- **`python3` コマンド**— 同梱した見直しのスキルが使用量の記録を集計するのに使う（4.12。承認済み）。tsukumo 本体からは起こさず、見直しの問い合わせの中でスキルが走らせる。無ければ見直しが集計できないと
  断るだけで、ほかの機能は動く
- **本体（立ち絵・吹き出し・レポートの整形）は外部コマンドに依存しない**
- **ブラウザ描画への移行で足す npm の依存（React・`ws`・unified 一式）は承認済み**（一覧は
  `docs/architecture/build.md`）。外部**コマンド**は増えない
- これ以外の実行時依存を増やすときは、ユーザーの承認を得る

開発する環境は **macOS + Orca**（Orca と既定のブラウザが並ぶ環境は 2.3）。**バージョンや導入済みコマンドの一覧は
正典に持たない**（時間が経つと変わるので、前提にする前に**その場で確認する**。
過去の実測は `docs/history/environment-2026-09-09.md`）。

**ただし「入っていないもの」は残す** — 外部コマンドを増やす提案を止める材料になるため。
実測の時点で**未導入**だったのは `tmux`, `chafa`, `viu`, `timg`, `img2sixel`, `cowsay`,
`deno`, `cargo`。これらに依存する案は、入れてよいかの承認から始まる。

Node の下限は `package.json` の `engines.node`（`>=26`）。`engines` は宣言で、`pnpm install`・
`pnpm run` は止めない。止めるのは `bin/tsukumo` で、古い node ならメッセージを出して 1 で終える
（起動時の前提不足に当たる）。`node src/cli.ts` や `pnpm run start` を直に打つ開発用の入口は覆わない。
`.ts` を直に実行するので、古い node ではファイルの中に案内を書く場所が無い。

非機能要件:

- **常駐プロセスは、描画1回の失敗で落ちない。** 未知のイベントが来ても、画像が読めなくても、
  `orca` コマンドが失敗しても、次の更新で復帰する。**SDK のセッションが終わったり落ちたりしても
  プロセスは生き、画面はその事実を出す**（黙って止まらない）
- **会話は tsukumo のプロセスの外へ出さない。** SDK のイベント（本文・ツールの入出力・`speak` の
  引数）にはユーザーの生の会話が入る。外部へ送らない、別の場所に複製しない、ログに丸ごと
  出さない（`docs/coding-standards.md`「会話内容の扱い」が正典）。**ビューの HTML は
  ファイルに書き出さない。** 本文はプロセスのメモリにだけ持ち、`127.0.0.1` にだけバインドした
  サーバから配る（4.2）
- 画面への反映は体感で気にならない程度（目安1秒以内）。厳密な数値目標は置かない
