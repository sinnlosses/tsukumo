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

通読せず、下の索引で節を1つ特定して、その子のファイル（`docs/coding-standards/`）の節だけを次の形で読む:

```bash
# `##` の節を丸ごと（配下の `###` も含めて）読む
sed -n '/^## テスト/,/^## /p' docs/coding-standards/test.md

# `###` の小節だけを読む
sed -n '/^### 消すかどうか/,/^#\{2,4\} /p' docs/coding-standards/test.md
```

## 節の索引

この表は `pnpm run format` が子のファイルの題と見出しから書き直すので、手で直さない。

| ファイル                                                               | 題                                                       | 節                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/coding-standards/choice-criterion.md`                            | コーディング規約: 案を選ぶ物差し                         | 案を選ぶときの指標（コードの把握のしやすさ） / 仕組みをヒューリスティックより優先する                                                                                                                                                                                                                                                                               |
| `docs/coding-standards/comment-reference-and-style.md`                 | コーディング規約: コメント（指し方と書き方）・タスク番号 | コメント / タスク番号を書かない                                                                                                                                                                                                                                                                                                                                     |
| `docs/coding-standards/comment.md`                                     | コーディング規約: コメント（基準と種類）                 | コメント                                                                                                                                                                                                                                                                                                                                                            |
| `docs/coding-standards/conversation-content-read-back-and-boundary.md` | コーディング規約: 会話内容の扱い（読み戻しと境界）       | 会話内容の扱い                                                                                                                                                                                                                                                                                                                                                      |
| `docs/coding-standards/conversation-content.md`                        | コーディング規約: 会話内容の扱い（書き出す例外）         | 会話内容の扱い                                                                                                                                                                                                                                                                                                                                                      |
| `docs/coding-standards/error-input-and-absent-value.md`                | コーディング規約: エラー・外部の入力・「無い」値         | エラーハンドリング / 外部の入力を読む場所を1つにする / 「無いかもしれない」値 / 複数の「無い」が1つの状態 / 「無い」を層をまたいで運ばない / null は自前の型に出さない                                                                                                                                                                                              |
| `docs/coding-standards/format-and-always-on-text.md`                   | コーディング規約: 整形の対象外と常設の文章               | 整形の対象外 / 常設の文章の字数                                                                                                                                                                                                                                                                                                                                     |
| `docs/coding-standards/layer-and-dependency.md`                        | コーディング規約: 層と依存の向き                         | 層と依存の向き                                                                                                                                                                                                                                                                                                                                                      |
| `docs/coding-standards/react.md`                                       | コーディング規約: React                                  | React / useEffect は4類型だけ / useEffect の代わりに使うもの / 依存配列を手で間引かない / レンダー中に ref を読み書きしない / 描画中に時計を読まない / 部品は `function` で書く / 手でメモ化しない / 部品の中で部品を定義しない / 入力の種類で分けるときはブラウザの判定に任せる / 条件付きの描画は `&&` で書く / zustand の store / TanStack Query と queryOptions |
| `docs/coding-standards/test.md`                                        | コーディング規約: テスト                                 | テスト / 置き場所とモック / カバレッジに閾値を設けない / 消すかどうか / 足すかどうか / 流れは E2E、出し分けは単体、見た目は目視 / E2E の差分をレビューするとき                                                                                                                                                                                                      |
| `docs/coding-standards/typescript-writing.md`                          | コーディング規約: TypeScript の書き方                    | 関数の並び順 / テストのためだけに公開しない / 変数は基本イミュータブル / 型を迂回するキャストを使わない / テストの DOM 要素のキャスト / 可読性が良くなる場合は remeda を優先する / class 名は clsx で組む / 型注釈より `satisfies` / `Date` を使わない / 識別子は用語集に合わせる                                                                                   |
