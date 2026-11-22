---
name: astryx-component
description: Astryx の部品の props・既定の振る舞い・使い方の例・実装を名前で引く打ち方。ui/ の包みを足す・直すとき、Astryx の部品の props や既定の振る舞いを知りたいときに使う。node_modules/@astryxdesign/core/src を grep するより先にこれを打つ。
---

# Astryx の部品を名前で引く

Astryx の部品の props・使い方・実装は、devDependency の `@astryxdesign/cli`（bin `astryx`）で引ける。
`node_modules` の `src` を探す前に、まずこの CLI を打つ。読み取りだけで、何も書き換えない。

## 打ち方

部品の名前は `Button`・`CodeBlock` のように大文字で書く。

- 部品の一覧: `pnpm exec astryx component --list`
- props の表（名前・型・既定・説明）: `pnpm exec astryx component <Name> --props --detail brief`
- 使い方の例（showcase）: `pnpm exec astryx component <Name> --showcase`
- 実装（ソース）: `pnpm exec astryx component <Name> --source`

`--list` の出力には各部品の import 先（`@astryxdesign/core/<Name>`）も載る。
`--category Layout` のように群で絞れる（存在しない群を渡すと有効な群の一覧が返る）。
複数の部品を一度に引くなら `Button Badge --props --json` と並べる。`--json` は機械で読むときに使う。

## 使う場面

- `ui/` の包みを足す・直すとき、Astryx の部品の props・既定の振る舞い・必須の欄を確かめる。
- 部品の使い方を例で見たいとき（`--showcase`）。
- 実装の細部まで要るときだけ `--source`。

## 守ること

- `node_modules/@astryxdesign/core/src` を grep する前に、この CLI で引けないかを試す。
- `features/` からは Astryx の部品を直接 import せず、`ui/` の包みを通す（`docs/architecture/adr/0080-report-parts-through-astryx.md`）。
- CLI が引けない部品や、出力に欲しい情報が無い場面は、その旨を報告に書く。そのときだけ `src` を読む。
