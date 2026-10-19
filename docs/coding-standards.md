# コーディング規約の詳細

コードの書き方のルールの一覧は `.claude/rules/`（`typescript.md`・`comments.md`・`react.md`）にある。**ここにはその理由と例外**
だけを書く（ルール本体は `.claude/rules/` 側が正典で、二重に書かない。ただし lint やテストが検査する
ルール——`Date` を使わない・層と依存の向き——は `.claude/rules/` に一覧の行を置かず、ここだけに書く）。`/code-review` のStandards軸は
この2つを合わせて評価軸にする。

配置・分割の規約は `docs/architecture.md` が正典。

実装スタックは **Node + TypeScript**。チェックコマンドは `pnpm run check`
（`tsc --noEmit` → `oxlint` → `oxfmt --check` → 単体テスト → E2E。E2E の段は `docs/architecture/testing.md`
「E2E の走らせ方」）。

責務: 規約の理由と例外を持つ（規約そのものは `.claude/rules/` が正典で二重に書かない）。
読む時: 規約の理由と例外（`Date` を使わない・層の辺など）を確かめたいとき。
直す時: 規約の理由・例外を変えたとき、lint やテストが検査する規則を追加・変更したとき。

## このファイルの読み方

現時点では小さいので通読してよい。**30KBを超えたら**、下の索引で節を1つ特定して、
その節だけを次の形で読む運用に切り替える:

```bash
# `##` の節を丸ごと（配下の `###` も含めて）読む
sed -n '/^## テスト/,/^## /p' docs/coding-standards/test.md

# `###` の小節だけを読む
sed -n '/^### 消すかどうか/,/^#\{2,4\} /p' docs/coding-standards/test.md
```

### 節の索引

| 節                                              | 子のファイル                                                                                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| ## 関数の並び順                                 | `docs/coding-standards/typescript-writing.md`                                                                                           |
| ### テストのためだけに公開しない                | `docs/coding-standards/typescript-writing.md`                                                                                           |
| ## 変数は基本イミュータブル                     | `docs/coding-standards/typescript-writing.md`                                                                                           |
| ## 型を迂回するキャストを使わない               | `docs/coding-standards/typescript-writing.md`                                                                                           |
| ### テストの DOM 要素のキャスト                 | `docs/coding-standards/typescript-writing.md`                                                                                           |
| ## 可読性が良くなる場合は remeda を優先する     | `docs/coding-standards/typescript-writing.md`                                                                                           |
| ## class 名は clsx で組む                       | `docs/coding-standards/typescript-writing.md`                                                                                           |
| ## 型注釈より `satisfies`                       | `docs/coding-standards/typescript-writing.md`                                                                                           |
| ## エラーハンドリング                           | `docs/coding-standards/error-input-and-absent-value.md`                                                                                 |
| ## 外部の入力を読む場所を1つにする              | `docs/coding-standards/error-input-and-absent-value.md`                                                                                 |
| ## コメント                                     | `docs/coding-standards/comment.md`（前半）・`docs/coding-standards/comment-reference-and-style.md`（後半）                              |
| ## 「無いかもしれない」値                       | `docs/coding-standards/error-input-and-absent-value.md`                                                                                 |
| ### 複数の「無い」が1つの状態                   | `docs/coding-standards/error-input-and-absent-value.md`                                                                                 |
| ### 「無い」を層をまたいで運ばない              | `docs/coding-standards/error-input-and-absent-value.md`                                                                                 |
| ### null は自前の型に出さない                   | `docs/coding-standards/error-input-and-absent-value.md`                                                                                 |
| ## 会話内容の扱い                               | `docs/coding-standards/conversation-content.md`（前半）・`docs/coding-standards/conversation-content-read-back-and-boundary.md`（後半） |
| ## 層と依存の向き                               | `docs/coding-standards/layer-and-dependency.md`                                                                                         |
| ## React                                        | `docs/coding-standards/react.md`                                                                                                        |
| ## テスト                                       | `docs/coding-standards/test.md`                                                                                                         |
| ## `Date` を使わない                            | `docs/coding-standards/typescript-writing.md`                                                                                           |
| ## 整形の対象外                                 | `docs/coding-standards/format-and-always-on-text.md`                                                                                    |
| ## タスク番号を書かない                         | `docs/coding-standards/comment-reference-and-style.md`                                                                                  |
| ## 案を選ぶときの指標（コードの把握のしやすさ） | `docs/coding-standards/choice-criterion.md`                                                                                             |
| ## 仕組みをヒューリスティックより優先する       | `docs/coding-standards/choice-criterion.md`                                                                                             |
| ## 識別子は用語集に合わせる                     | `docs/coding-standards/typescript-writing.md`                                                                                           |
| ## 常設の文章の字数                             | `docs/coding-standards/format-and-always-on-text.md`                                                                                    |

本文は 11 の子のファイル（`docs/coding-standards/`）に分けてある。節の見出しはここに残し、中身は移し先を引く。各節の中身の要約は、子のファイルの「節の索引」にある。

- `docs/coding-standards/typescript-writing.md`: 関数の並び順・イミュータブル・キャスト・remeda・clsx・`satisfies`・`Date` を使わない・識別子は用語集に合わせる
- `docs/coding-standards/error-input-and-absent-value.md`: エラーハンドリング・外部の入力を読む場所・「無いかもしれない」値
- `docs/coding-standards/choice-criterion.md`: 案を選ぶときの指標・仕組みをヒューリスティックより優先する
- `docs/coding-standards/comment.md`: コメントの前半（基準・判定の1問・種類別の判断表）
- `docs/coding-standards/comment-reference-and-style.md`: コメントの後半（経路上に書き写さない・別の場所を指すとき・書き方・正典の対応表）、タスク番号を書かない
- `docs/coding-standards/conversation-content.md`: 会話内容の扱いの前半（最優先の条・書き出す例外の表・スクリーンショットの別枠）
- `docs/coding-standards/conversation-content-read-back-and-boundary.md`: 会話内容の扱いの後半（claude へ渡す例外の表・広げていないこと・プロセスの外へ出さない・ブラウザ側の状態）
- `docs/coding-standards/layer-and-dependency.md`: 層と依存の向き
- `docs/coding-standards/react.md`: React
- `docs/coding-standards/test.md`: テスト
- `docs/coding-standards/format-and-always-on-text.md`: 整形の対象外・常設の文章の字数

## 関数の並び順

本文は `docs/coding-standards/typescript-writing.md`。

### テストのためだけに公開しない

本文は `docs/coding-standards/typescript-writing.md`。

## 変数は基本イミュータブル

本文は `docs/coding-standards/typescript-writing.md`。

## 型を迂回するキャストを使わない

本文は `docs/coding-standards/typescript-writing.md`。

### テストの DOM 要素のキャスト

本文は `docs/coding-standards/typescript-writing.md`。

## 可読性が良くなる場合は remeda を優先する

本文は `docs/coding-standards/typescript-writing.md`。

## class 名は clsx で組む

本文は `docs/coding-standards/typescript-writing.md`。

## 型注釈より `satisfies`

本文は `docs/coding-standards/typescript-writing.md`。

## エラーハンドリング

本文は `docs/coding-standards/error-input-and-absent-value.md`。

## 外部の入力を読む場所を1つにする

本文は `docs/coding-standards/error-input-and-absent-value.md`。

## コメント

本文は `docs/coding-standards/comment.md`（前半）と `docs/coding-standards/comment-reference-and-style.md`（後半）。

## 「無いかもしれない」値

本文は `docs/coding-standards/error-input-and-absent-value.md`。

### 複数の「無い」が1つの状態

本文は `docs/coding-standards/error-input-and-absent-value.md`。

### 「無い」を層をまたいで運ばない

本文は `docs/coding-standards/error-input-and-absent-value.md`。

### null は自前の型に出さない

本文は `docs/coding-standards/error-input-and-absent-value.md`。

## 会話内容の扱い

本文は `docs/coding-standards/conversation-content.md`（前半）と `docs/coding-standards/conversation-content-read-back-and-boundary.md`（後半）。

## 層と依存の向き

本文は `docs/coding-standards/layer-and-dependency.md`。

## React

本文は `docs/coding-standards/react.md`。

### useEffect は4類型だけ

本文は `docs/coding-standards/react.md`。

### useEffect の代わりに使うもの

本文は `docs/coding-standards/react.md`。

### 依存配列を手で間引かない

本文は `docs/coding-standards/react.md`。

### レンダー中に ref を読み書きしない

本文は `docs/coding-standards/react.md`。

### 描画中に時計を読まない

本文は `docs/coding-standards/react.md`。

### 部品は `function` で書く

本文は `docs/coding-standards/react.md`。

### 手でメモ化しない

本文は `docs/coding-standards/react.md`。

### 部品の中で部品を定義しない

本文は `docs/coding-standards/react.md`。

### 入力の種類で分けるときはブラウザの判定に任せる

本文は `docs/coding-standards/react.md`。

### 条件付きの描画は `&&` で書く

本文は `docs/coding-standards/react.md`。

### zustand の store

本文は `docs/coding-standards/react.md`。

### TanStack Query と queryOptions

本文は `docs/coding-standards/react.md`。

## テスト

本文は `docs/coding-standards/test.md`。

### 置き場所とモック

本文は `docs/coding-standards/test.md`。

### カバレッジに閾値を設けない

本文は `docs/coding-standards/test.md`。

### 消すかどうか

本文は `docs/coding-standards/test.md`。

### 足すかどうか

本文は `docs/coding-standards/test.md`。

### 流れは E2E、出し分けは単体、見た目は目視

本文は `docs/coding-standards/test.md`。

### E2E の差分をレビューするとき

本文は `docs/coding-standards/test.md`。

## `Date` を使わない

本文は `docs/coding-standards/typescript-writing.md`。

## 整形の対象外

本文は `docs/coding-standards/format-and-always-on-text.md`。

## タスク番号を書かない

本文は `docs/coding-standards/comment-reference-and-style.md`。

## 案を選ぶときの指標（コードの把握のしやすさ）

本文は `docs/coding-standards/choice-criterion.md`。

## 仕組みをヒューリスティックより優先する

本文は `docs/coding-standards/choice-criterion.md`。

## 識別子は用語集に合わせる

本文は `docs/coding-standards/typescript-writing.md`。

## 常設の文章の字数

本文は `docs/coding-standards/format-and-always-on-text.md`。
