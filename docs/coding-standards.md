# コーディング規約の詳細

コードの書き方のルールの一覧は `.claude/rules/`（`typescript.md`・`comments.md`・`react.md`）にある。**ここにはその理由と例外**
だけを書く（ルール本体は `.claude/rules/` 側が正典で、二重に書かない。ただし lint やテストが検査する
ルール——`Date` を使わない・層と依存の向き——は `.claude/rules/` に一覧の行を置かず、ここだけに書く）。`/code-review` のStandards軸は
この2つを合わせて評価軸にする。

配置・分割の規約は `docs/architecture.md` が正典。

実装スタックは **Node + TypeScript**。チェックコマンドは `pnpm run check`
（`tsc --noEmit`・`oxlint`・`oxfmt --check`・token-limit・単体テスト・E2E を全部同時に起こす。段の選び方は `scripts/dev/check.ts` の冒頭。E2E の段は `docs/architecture/testing.md`
「E2E の走らせ方」）。

責務: 規約の理由と例外を持つ（規約そのものは `.claude/rules/` が正典で二重に書かない）。
読む時: 規約の理由と例外（`Date` を使わない・層の辺など）を確かめたいとき。
直す時: 規約の理由・例外を変えたとき、lint やテストが検査する規則を追加・変更したとき。

## このファイルの読み方

下の目次で子を1つ特定し、その子のファイル（`docs/coding-standards/`）を丸ごと読む。

## 目次

この表は `pnpm run format` が子のファイルの責務の行から書き直すので、手で直さない。

| ファイル                                                               | 説明                                                                                                                                                                                                  |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/coding-standards/choice-criterion.md`                            | 複数の案から1つを選ぶときの物差し（コードの把握のしやすさ）と、仕組みをヒューリスティックより優先する順を持つ。                                                                                       |
| `docs/coding-standards/comment-reference-and-style.md`                 | コメントの後半。                                                                                                                                                                                      |
| `docs/coding-standards/comment.md`                                     | コメントの前半。                                                                                                                                                                                      |
| `docs/coding-standards/conversation-content-read-back-and-boundary.md` | 会話内容の扱いの後半。                                                                                                                                                                                |
| `docs/coding-standards/conversation-content.md`                        | 会話内容の扱いの前半。                                                                                                                                                                                |
| `docs/coding-standards/error-input-and-absent-value.md`                | エラーハンドリング・外部の入力を読む場所・`\| undefined` と `null` の書いてよい場所の、理由と例外を持つ。                                                                                             |
| `docs/coding-standards/external-send.md`                               | 承認が要る外部への操作の一覧と、hook が見分ける形を持つ。                                                                                                                                             |
| `docs/coding-standards/format-and-always-on-text.md`                   | oxfmt にかけないディレクトリとその理由、毎ターン載る常設の文章（`AGENTS.md`・`.claude/rules/`・systemPrompt の規約・`task-writing.md`・`implementer-brief.md`）の字数の上限と足すなら削る梯子を持つ。 |
| `docs/coding-standards/hook-rollout.md`                                | ツールの呼び出しを拒む新しい hook を log-only から入れて block に上げる手順を持つ。                                                                                                                   |
| `docs/coding-standards/layer-and-dependency.md`                        | 層と依存の向きのうち、`docs/architecture.md` の表だけでは読み取れない決まり（配線・`core` と `browser`・`import type`・`browser` の箱）と、ファイル名・ディレクトリ名・barrel file の規約を持つ。     |
| `docs/coding-standards/react.md`                                       | React の部品とフックの書き方（`useEffect` の4類型と代わりに使うもの、ref・時計、部品の定義の形、メモ化、条件付きの描画、zustand の store、TanStack Query）の理由と例外を持つ。                        |
| `docs/coding-standards/test.md`                                        | テストの置き場所とモック、カバレッジ、消す/足すの判断、流れ・出し分け・見た目の守り分け、E2E の差分をレビューするとき見ることの理由と例外を持つ。                                                     |
| `docs/coding-standards/typescript-writing.md`                          | 関数の並び順・イミュータブル・キャスト・remeda・clsx・`satisfies`・`Date` を使わない・識別子と用語集の、理由と例外を持つ。                                                                            |
