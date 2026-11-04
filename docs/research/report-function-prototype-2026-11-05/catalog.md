# PROTOTYPE: 触れるレポートの関数のカタログ（書き手に渡す説明）

使い捨ての試作。レポートを部品の平らな一覧（JSON の配列）で書く。根は `id: "root"` の `Report` で、`children` に部品の ID を並べる。

## 部品

| 部品        | props                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `Report`    | `children`: 部品の ID の並び                                                                                          |
| `Heading`   | `text`                                                                                                                |
| `Paragraph` | `text`（値）                                                                                                          |
| `Slider`    | `label`・`min`・`max`・`step`・`value`（`{ "path": "/params/<名>" }` に結ぶ。初期値は `initial`）                     |
| `CheckBox`  | `label`・`value`（`{ "path": "/params/<名>" }`）・`initial`（true / false）                                           |
| `Stats`     | `items`: `[{ "label", "value"（値） }]`（3〜4 個）                                                                    |
| `Chart`     | `chartKind`: `bar` か `line`・`labels`（値。文字の並び）・`series`: `[{ "name", "values"（値。数の並び） }]`・`title` |
| `Table`     | `columns`: 文字の並び・`rows`: 行の並び（セルは値）                                                                   |

## 値

値は次のどれか。

- リテラル（数・文字・数の並び・文字の並び）
- `{ "path": "/params/<名>" }`: `Slider`・`CheckBox` が書いた値を読む
- `{ "call": "<関数>", "args": { … } }`: 関数を呼ぶ。`args` の中も値（入れ子にできる）

## 関数

数の引数には数の並びも渡せる。並びを渡すと要素ごとに計算する（数と並びを混ぜると、数を並びの長さに広げる）。

| 関数                       | args                             | 返すもの                                  |
| -------------------------- | -------------------------------- | ----------------------------------------- |
| `add`・`sub`・`mul`・`div` | `a`・`b`                         | a + b など                                |
| `min`・`max`               | `a`・`b`                         | 小さいほう・大きいほう                    |
| `round`                    | `x`・`digits`（省くと 0）        | 四捨五入                                  |
| `sum`                      | `values`                         | 並びの合計                                |
| `countAbove`               | `values`・`limit`                | `limit` を超える要素の数                  |
| `range`                    | `from`・`to`・`step`（省くと 1） | `from` から `to` までの数の並び           |
| `if`                       | `cond`・`then`・`else`           | cond が真なら then                        |
| `gt`・`lt`                 | `a`・`b`                         | a > b・a < b                              |
| `format`                   | `template`・その他の鍵           | `template` の `{鍵}` を値で埋めた文字     |
| `toText`                   | `values`・`suffix`（省くと空）   | 数の並びを文字の並びにする（`labels` 用） |

## 例

```json
[
  { "id": "root", "component": "Report", "children": ["s", "st"] },
  {
    "id": "s",
    "component": "Slider",
    "label": "上限",
    "min": 30,
    "max": 90,
    "step": 10,
    "initial": 60,
    "value": { "path": "/params/limit" }
  },
  {
    "id": "st",
    "component": "Stats",
    "items": [
      {
        "label": "切れる件数",
        "value": {
          "call": "countAbove",
          "args": { "values": [12, 28, 41, 55, 73, 88], "limit": { "path": "/params/limit" } }
        }
      }
    ]
  }
]
```
