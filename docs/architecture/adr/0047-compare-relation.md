# 見比べの部品を `Compare` 1つにまとめ、側の中身と `relation` で対等と前後を描き分ける（2026-11-03）

ステータス: 採用

**`Compare` の側は今の `BeforeAfter` の側と同じ中身（`image`・`code`・`points`・`mermaid`・`svg`）を、`kind` を側に平らに置く形で持つ。前後の関係は `relation`（`versus` が既定、`before-after`）で選ぶ。旧い `BeforeAfter`（a2ui の部品と、`components` 以前の `beforeAfter` の塊）は受け口で `Compare` の `before-after` に写し、受け口より後ろの検査・画像の棚・使われ方の記録・描画は `Compare` だけを見る。**
部品を `Compare` 1つにまとめることと、`relation` の2値、`versus` の見た目（見出しが札・矢印なし・両側画像の口は並べる・切り替えだけ）は 2026-11-03 の会話で利用者が決めた。この ADR が決めるのは、側の形・`before-after` の見出しの扱い・図の部品に入れるか・写す場所の4つ。

## 何が困っていたか

- 2026-11-03 の HTML 版との見比べのレポートで、tsukumo 版と HTML 版の撮影を `BeforeAfter` で並べたところ、「前が tsukumo、後が HTML」と時間の前後に読めた。`BeforeAfter` の描画は側の札を「前」「後」に決め打ちし、間に矢印を描く
- 対等な2つ（案A と案B）を並べる `Compare` の側は `heading` と `points`（箇条）だけで、画像・コード・図を載せられない
- 画像やコードを並べられる部品は `BeforeAfter` だけで、対等な2つを並べたい書き手はそれを使うしかない

## 決めたこと

### 1. 側の形: `kind` を側に平らに置く

- 側は `{ heading, kind, …その種類の欄 }`。種類ごとの欄は `BeforeAfter` の側と同じ（`image` は `path` と `region`、`code` は `language` と `source`、`points` は `points`、`mermaid` は `source`、`svg` は `width`・`height`・`shapes`・`legend`）
- `points` の側だけは `kind` を省ける。省いた側は `points` として読むので、旧い `{ heading, points }` の側はそのまま通る
- 入れ子（`{ heading, content: { kind, … } }`）にしなかったのは、書き手が1段深い入れ物を書き忘れる・`points` を外と中のどちらに書くか迷う形を作らないため。平らな形なら旧い側は `kind` を省いた `points` の側そのもので、書き方が1つで済む

- 側の schema は `BeforeAfterSide` の定義に `heading` を重ねた形にし、`kind` の無い側は読む前に `points` を補う。種類ごとの欄を `Compare` の側に書き写すと、`report` の引数の schema が上限（`REPORT_INPUT_SCHEMA_MAX_CHARS`）を超えるため。`relation` の欄の分だけ上限を 25,600 字から 25,700 字に上げる
- 書き手に見せる入力の形では `kind` は必ず書く欄に見える。省けるのは旧い記録を読むときのため

### 2. `before-after` の見出し: 札は「前」「後」のまま、見出しは札に添える

- `before-after` の側の札は「前」「後」。`heading` を書いたら札の後ろに括弧で添える（「前（旧い棚）」）
- `heading` は省ける欄にする。写した旧い `BeforeAfter` の側は `heading` が空で、札は今の「前」「後」と同じになる
- `versus` では `heading` が札になる。空なら札を出さない（書き手には `versus` で見出しを書くよう `describe` で言う）

### 3. 図の部品: `Compare` は `Report.figure` に置ける

- `reportFigureSchema` に `compareBlockSchema` を入れ、`FIGURE_COMPONENTS` に `Compare` が入る。入れないと、写したあとの旧い `BeforeAfter` の図（`Report.figure`）が構造の検査で図の部品でないと見られる
- `points` だけの `Compare` も置ける。今の `BeforeAfter` も両側が `points` の形で置けていて、図の部品かどうかは部品の名前（`kind`）で決める仕組みのまま、中身で分けない
- 図の申告の種類（`reportFigureOf`）と使われ方の記録の塊の種類では、`Compare` は `relation` にかかわらず `compare` と数える（後始末で改めた。下の「後始末」）

### 4. 写す場所: 受け口

- `a2uiReportInput`（a2ui の部品の一覧）と `legacyReportComponents`（`sections`・`body` の旧い引数）で写す。続きから復元した再生と疑似セッションも `reportEvents` を通るので、同じ所で写る
- 部品が閉じるたびの草稿（`draftComponentIntake`）も同じ写しを通す
- 写しは `src/server/report/core/body/legacy-before-after.ts` に置く。ブラウザの葉は写さない（後始末で外した。下の「後始末」）
- 描く側だけで写す案は採らない。サーバの検査（図の規則・`region` の規則）・画像の棚・使われ方の記録が `BeforeAfter` と `Compare` の両方を見続けることになる
- 構造の検査（`a2uiStructureFaults`）は写す前の生の一覧を見る。`BeforeAfter` は図の部品のままなので、写す前と同じに通る

- 書き手の目録（`report` ツールの入力の形）から `BeforeAfter` を外した後は、ツール経由で新しく書いた `BeforeAfter` は入力の検査で差し戻す。写すのは受け口（旧い transcript の読み戻し・疑似セッション・続きから復元した再生）だけで、ツールの入口は写さない。この分担を `sdk-report-tool-a2ui.test.ts` が固定する

## 採らなかった案

| 案                                            | 採らなかった理由                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| 対等な2つの専用の部品を足す                   | 部品を増やさず `Compare` 1つにまとめると利用者が決めた                                 |
| 側に `content` を入れ子で持たせる             | 決めたこと 1 のとおり、旧い側と書き方が2つに分かれ、書き手が入れ物を書き違えやすい     |
| `before-after` で見出しを札に替える           | 「前」「後」の札が消えると、前後の向きが矢印だけになる。見出しは札に添えれば両方読める |
| 両側が画像でない `Compare` を図の部品から外す | 図の部品かは部品の名前で決めていて、中身で分けると構造の検査に別の判定が要る           |
| 描く側だけで写す                              | 決めたこと 4 のとおり、サーバの検査・棚・記録が両方の部品を見続ける                    |

## 残すこと

- 書き手の目録から `BeforeAfter` を外すこと、記法の条・ツールの説明・`docs/architecture/display/` の文書を `Compare` の書き方に揃えることは、この判断のあとに別に行う。それまで書き手は `BeforeAfter` と `Compare` の両方を書ける
- `BeforeAfter` の型・葉・CSS の名前・規則の分岐を消すのも別に行う（後始末で済んだ）

## 後始末

- 旧い `BeforeAfter` を読む部分は受け口（`src/server/report/core/body/` の `legacy-before-after.ts`）に閉じた。`shared` と `browser` は `Compare` だけを見る。旧い形は届いた生の値の段階で `Compare` の `before-after` に書き換えてから parse に渡す
- `BeforeAfter` の名前の型・描画・CSS の class 名・ファイル名を `Compare` の名前に置き換えた。端末ごとの並べ方の好みの鍵も改めたので、好みは 1 回だけ既定に戻る
- 使われ方の記録は、前後の `Compare` も `compare`・`Compare` と数える（決めたこと 3 の第 3 項の「今までの `beforeAfter` と数える」を改めた。写す前の名前を数え続けると `shared` に旧い名前が残るため）。欄の名前は `hasComparisonOrImage`・`compareRegion` に変え、記録の版を上げた。過去の行の `beforeAfter` 系の名前は書き換えず、集計が別の行として数える
