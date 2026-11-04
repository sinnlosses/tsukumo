# PROTOTYPE: 触れるレポートのカタログ 第2版（書き手に渡す説明）

使い捨ての試作。レポートを部品の平らな一覧（JSON の配列）で書く。根は `id: "root"` の `Report` で、`children` に部品の ID を並べる。

計算は**式**（下の「式の書き方」）で書く。同じ計算を2か所以上で使うなら、`Report.defs` に名前を付けて一度だけ書き、ほかの式からその名前で読む。

## 部品

| 部品        | props                                                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Report`    | `children`: 部品の ID の並び・`defs`: 名前 → 式（文字列）の対応（省いてよい）                                                                                                   |
| `Heading`   | `text`（値）                                                                                                                                                                    |
| `Paragraph` | `text`（値）                                                                                                                                                                    |
| `Slider`    | `name`（式から読む名前）・`label`・`min`・`max`・`step`・`initial`                                                                                                              |
| `CheckBox`  | `name`・`label`・`initial`（true / false）                                                                                                                                      |
| `Stats`     | `items`: `[{ "label", "value"（値） }]`（3〜4 個）                                                                                                                              |
| `Chart`     | `chartKind`: `line` か `bar`・`labels`（値。文字の並び）・`series`: `[{ "name", "values"（値。数の並び） }]`・`title`・`emphasis`（値。強調する点の位置。0 始まり。省いてよい） |
| `Table`     | `columns`: 文字の並び・`rows`（値。行の並び）・`emphasis`（値。強調する行の位置。0 始まり。省いてよい）                                                                         |

## 値

値は次のどれか。

- リテラル（数・文字・真偽・並び）
- `{ "call": "expr", "args": { "source": "<式>" } }`: 式の結果
- `{ "call": "format", "args": { "template": "…${<式>}…" } }`: 文字の中の `${…}` を式の結果で埋める（数は小数1桁まで）

## 式の書き方

- 名前: `Slider`・`CheckBox` の `name` と、`defs` の名前
- 数・`"文字"`・`true`・`false`・並び `[1, 2, 3]`
- 演算子: `+ - * / %`、比べる `< <= > >= == !=`、`&& || !`、`条件 ? A : B`
- 演算子の片方か両方が並びなら、要素ごとに計算する（数は並びの長さに広げる）

| 関数                           | 返すもの                                                     |
| ------------------------------ | ------------------------------------------------------------ |
| `range(from, to)`              | from から to までの整数の並び                                |
| `min(a, b)`・`max(a, b)`       | 小さいほう・大きいほう（要素ごと）                           |
| `round(x, digits)`             | 四捨五入（digits は省くと 0）                                |
| `sum(list)`・`len(list)`       | 合計・長さ                                                   |
| `minOf(list)`・`maxOf(list)`   | 並びの最小・最大                                             |
| `argmin(list)`・`argmax(list)` | 最小・最大の位置（0 始まり）                                 |
| `at(list, i)`                  | i 番目の要素                                                 |
| `zip(list1, list2, …)`         | 同じ位置の要素を並べた行の並び（`Table.rows` 用）            |
| `text(list, suffix)`           | 数の並びを文字の並びにする（`labels` 用。suffix は省くと空） |

## 例

```json
[
  {
    "id": "root",
    "component": "Report",
    "children": ["s", "st"],
    "defs": { "cut": "len(values) - sum(values <= limit)", "values": "[12, 28, 41, 55, 73, 88]" }
  },
  {
    "id": "s",
    "component": "Slider",
    "name": "limit",
    "label": "上限",
    "min": 30,
    "max": 90,
    "step": 10,
    "initial": 60
  },
  {
    "id": "st",
    "component": "Stats",
    "items": [{ "label": "切れる件数", "value": { "call": "expr", "args": { "source": "cut" } } }]
  }
]
```
