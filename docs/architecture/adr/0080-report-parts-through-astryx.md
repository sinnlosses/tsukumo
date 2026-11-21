# レポートの部品と Markdown の経路も `ui/` を通して Astryx で描く（2026-11-21）

ステータス: 採用

**Astryx を読む場所は今のまま `src/browser/components/ui/` の1か所にし、レポートの内容部品（`features/report/leaf/`）と Markdown の経路（`features/report/renderer/`）も、並び・名前と値・流れ・コード・折り畳み・キーの印を `ui/` の部品で描く。見た目は ADR 0053 のとおり Astryx の既定のまま使い、包みが決めるのは tsukumo 共通の約束（ラベルの折り返し・本文の行の高さ・字の段）だけにする。**

方向と3つの論点は、2026-11-21 の会話で利用者が決めた。前後の比較は `docs/history/mockup/astryx-unify-2026-11-21/compare.html` にあり、言葉と画が食い違ったら画が勝つ。この ADR は ADR 0053 の「`ui/` の部品は Astryx の見た目のまま」を `ui/` の外へ広げるもので、0053 と ADR 0052 の境界の検査（Astryx を import できるのは `ui/` だけ）と、ADR 0042 の「内容部品は React で直に描く」は変えない。

## 何が困っていたか

- 描き方が3通りある。`ui/` の31の部品のうち Astryx を読まないものが5つ（`disclosure`・`expand-button`・`first-note-list`・`round-button`・`typing-dot-list`）、`leaf/` の40の `.tsx` のうち `ui/` を読むのは13、Markdown の経路は react-markdown の要素の割り当て（`markdown-renderer.tsx` の `REPORT_COMPONENTS`）と `renderer/` の CSS 23ファイルで描く（2026-11-21 に `ls` と `grep` で数えた）
- 同じ「並び」でも、`ui/` の画面・`ItemList`・Markdown の箇条書きで余白・印・字の段が別々に決まる。チェックの印は `rehypeTaskCheck`（`renderer/task-check.ts`）が作る span に CSS で丸を描いていた
- 利用者の狙いは、寄せられるものを Astryx に寄せて統一感を出すこと

## 決めたこと

### 論点 1: 3層の構成

| 層                                      | 持つもの                                                                                                   | 持たないもの                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `components/ui/`                        | Astryx の包み。List・MetadataList・Stepper・Collapsible・CodeBlock・Kbd・TabList・Slider・Switch を足す    | レポートの語（部品の名前・欄）     |
| `features/report/leaf/`                 | 内容部品の欄を `ui/` の部品の props へ写すこと。CSS は並べ方（`display`・`grid`・`gap`・幅）だけ           | 色・枠・角丸・字の段・印の形の宣言 |
| `features/report/renderer/`（Markdown） | `REPORT_COMPONENTS` で `ul`・`ol`・`li` を List、`pre` を CodeBlock、`details` を Collapsible へ割り当てる | 割り当てた要素の見た目の CSS       |

- 図の本体（Graph・Chart・ChartGrid・Mermaid・Timeline・Plot・Matrix・Compare・Svg）は Astryx に部品が無いので対象にしない。表と脚注と地の文の中の字飾りも CSS のまま残す
- `ui/` の包みは ADR 0053 と同じく Astryx の見た目を作り直さない。包みが決めてよいのは次の3つだけ
  - 文字列のラベル・説明は要素で包んで渡し、1行で切らずに折り返す（Astryx の ListItem は文字列を渡すと1行で切る）
  - 説明・本文の行の高さに `--line-height-reading` を当てる
  - Collapsible の開く側の字を本文の段にそろえる（既定のままだと見出しの大きさになる）
- `rehypeTaskCheck` は `- [x]`・`- [ ]` を span の印に書き替えるのをやめ、済み・未了の情報だけを li に残す。印は li の割り当てが List と Icon で描く

### 論点 2: コードの長い行は横にスクロールする（利用者決定）

**採る: CodeBlock の既定のとおり折り返さず、横にスクロールする。行番号・言語名・コピーのボタンも既定のまま出す。** 今の `Code` の部品と Markdown のフェンスは折り返しているので、見た目が変わる。

### 論点 3: 流れは差し色で描く（利用者決定）

**採る: `ItemList` の `flow` は Stepper の縦向きで描き、差し色の縦棒と番号の丸は既定のまま使う。** 差し色はパックの accent なので、パックごとに流れの色が変わる。

### 論点 4: チェックの印は Astryx の Icon に寄せる（利用者決定）

**採る: 済みは CircleCheck、未了は Circle を `ui/` の Icon で描く。線の丸で、色は済みが成功の色、未了が控えめな色。** 2026-11-21 に入れた塗った丸の CSS（`renderer/report-notation-list.css` の `.report-task-check` の規則）は、Markdown の経路を移す段で消す。Trace の成否の印も同じ Icon（CircleCheck・CircleX・CircleDashed）にそろえる。

### 論点 5: 外への広がりを規約テストで止める

**採る: すべての移行を終えた段で、`leaf/` と `renderer/` の CSS が `color`・`background`・`border`・`border-radius`・`font-size` を宣言する数をファイルごとの上限の表で持ち、減る向きにだけ動かす（`test/architecture/design-token-margin.test.ts` と同じ形）。** 上限は図・表・脚注の分だけを残す。

## 後段

| 段                     | すること                                                                                                                                                    | 依存               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `ui/` の包み           | List・MetadataList・Stepper・Collapsible・CodeBlock・Kbd の包みを足し、見本帳（`#design`）に並べる                                                          | なし               |
| 自前の `ui/` の部品    | Astryx を読まない5つを Astryx の部品へ置き換える。置き換えられないものは理由をこの ADR に書き足す                                                           | `ui/` の包み       |
| 並びの内容部品         | `ItemList` の `bullet`・`check`・`ordered`・名前つき・`flow` を List と Stepper で描く                                                                      | `ui/` の包み       |
| 名前と値・コード・成否 | `DescriptionList` を MetadataList、`Code` を CodeBlock、`Trace` を List・Icon・Collapsible で描く                                                           | `ui/` の包み       |
| Markdown の経路        | `REPORT_COMPONENTS` の `ul`・`ol`・`li` に List、`details` に Collapsible を割り当て、`rehypeTaskCheck` を縮め、印の CSS を消す（`pre` はコードの段が移す） | 並びの内容部品     |
| 画面の残り             | 画面の `kbd`（5ファイル）を Kbd、やり取りの列の `role="tab"` を TabList、`parameter-knob` を Slider・Switch へ                                              | `ui/` の包み       |
| 規約テスト             | 論点 5 の上限の表を足す                                                                                                                                     | 上の段がすべて済む |

各段は見本帳と E2E の写しを撮り直し、前後の画をレポートに載せる。
