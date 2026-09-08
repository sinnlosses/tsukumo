# 現在の状態

最終更新: 2026-09-09（**リポジトリの立ち上げと実装スタックの決定**。2026-09-08 の検討メモ
（`work.md`）を `docs/` の正典と初期タスク6件に起こし、**T-001 を完了**した）

スタックは **Bun + TypeScript**、チェックコマンドは **`bun run check`**。
**transcript の追従と吹き出しの描画までが動いている**（立ち絵はまだ無い）。次は T-002。

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

### 2026-09-09 サイドカーの PoC（T-003）

**T-003 完了。** 「読む」`src/transcript.ts` /「決める」`src/balloon.ts` /「描く」`src/draw.ts` に
分け、`src/index.ts` が配線とポーリング（500ms間隔、mtime/size の変化を見る）を持つ形にした。
実装は sonnet のサブエージェントに委譲し、受け入れはメインで実施。`bun run check` は
19 pass / 0 fail。

**受け入れで足したもの**: `thinking` を吹き出しに出さないことがコードでは効いていたが
テストで固定されていなかったので、2件足した（実測で assistant 行の `content[]` の
半分近くが `thinking` だったため、事故ると内部の思考が画面に出る）。

**実測で分かったこと**（`docs/requirements.md` 4.1 に反映済み）:

- 行の `type` は 2026-09-08 の記録から**5種類増えていた**（`bridge-session` / `atis-latch` /
  `system` / `file-history-snapshot` / `file-history-delta`）。「未知の type で落ちない」は
  空論ではなく実際に必要
- assistant 行の `content[]` は `tool_use` 84 / `thinking` 58 / `text` 30。**出してよいのは
  `text` だけ**
- 同じディレクトリに `<session-id>/subagents/*.jsonl` ができる。`*.jsonl` を再帰的に拾うと
  サブエージェントの発話が混ざる

**検証**: 本物の transcript（907行）に対して起動し、SIGTERM まで生存・枠付きで最新発話を描画・
追記の反映は 153ms。会話の中身は出さず、構造とテキスト一致だけで確かめた。

## 次にやること

依存の無い順に:

- **T-002**: 立ち絵の素材方針の決定とサンプル1体（`opus` / **ユーザーとの合意が必要**）
- **T-005**: hook で状態ファイルを書き、表情・衣装を切り替える — 依存は解決済み。委譲できる
- T-004: 画像プロトコルで立ち絵を表示、使えない環境はテキストへ — T-002 の後
- T-006: statusline 併走（案B）— T-005 の後。優先度は低い

**T-002 はユーザーとの合意を含むので `/loop /next-task` の自動進行に載せない。**

## 未解決

- **吹き出しに禁則処理が無い。** 幅で単純に切っているので、`！` や `。` が1文字だけ行頭に
  落ちることがある（幅60で実際に確認）。PoCの範囲としては許容したが、直すならタスクに切る
- **発話が空文字のとき、プレースホルダーではなく空の吹き出しになる。** assistant の発話が
  1件も無い（`undefined`）ときは「（まだ発話がありません）」が出るが、`text: ""` の発話が
  来ると素通りする。実際に起きるかは未確認のレアケース
- **T-003 は未完（`doing` に戻した）。実端末で折り返し時に表示が崩れる。** 実発話に
  East Asian Ambiguous 文字（`—` 25回 / `→` 12回 / `①②③` 17回 / `…` 2回）が含まれ、
  `src/balloon.ts` の `charWidth()` がこれらを幅1と数えているのが原因の候補。ただし同じ
  Ambiguous の枠線 `─` は綺麗に出ているため、**グリフごとのフォントフォールバックで
  advance が変わっている**可能性がある。推測で直さず、DSR（カーソル位置問い合わせ）で
  端末の実測幅を測るプローブの結果を待つ
- **全角（ひらがな・漢字）の桁は揃って見えている**（ユーザー確認済み）ので、Wide の判定自体は
  効いている
- **端末での目視確認の残り**: `bun run start <transcript.jsonl>` を別ペインで動かして、
  吹き出しが追従することと、ペイン幅を変えても折り返しが崩れないことをユーザーに見てもらう
  （`docs/architecture.md`「手で確かめること」の手順1〜2、5）
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
