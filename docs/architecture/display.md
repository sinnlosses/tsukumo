# 表示

ステータス: **正典**。ユーザーの発言の引用・変更の経緯・実測の数字は `docs/history/decision.md`「display.md 4.2 …」の節にある。

責務: セリフとレポートの出力分離、レポートの記法の規約、立ち絵・吹き出し・メインビュー・
入力欄・サイドバーなど各表示物の仕様を持つ。それ以外の機能要件は `docs/requirements.md`。
読む時: 表示物・レポートの記法に触るとき。
直す時: 表示の仕様を変えたとき。

## このドキュメントの読み方

### このファイルは目次

下の `#### <見出し>` の小節から子のファイルを1つ特定し、その子のファイルを丸ごと読む。

**節の番号はもとの `4.2`（`### 4.2`）のまま**で、移す前は `docs/requirements.md` にあった。
コード・テスト・`docs/history/` から素の「4.2」で指している箇所が多く、番号を識別子として
保つため詰めない。

**ここには決定と、いまも効いている理由だけを置く。** ユーザーの発言の引用・変更と撤去の経緯・
実測の数字は `docs/history/decision.md` の「display.md 4.2 …」と「requirements.md 4.2 表示 / …」の
節にある。**帯の「いまの作業」の形は `docs/architecture/screen-design.md` 13.9** が正典。

**表示物の振る舞い（何を出すか・無ければどうするか・いつ消すか）はこのファイルの該当節だけに書く。**
`docs/requirements.md`・`docs/glossary.md`・`docs/architecture/screen-design.md`・`characters/README.md` は、
それぞれの役目の分（要件は例外が許される理由、用語集は語の意味、画面設計は見た目、README は書き手が書くもの）
だけを持ち、振る舞いはこのファイルの節の名前で指す。

各節の本文は `docs/architecture/display/` の子のファイルにある。下の `#### <見出し>` の小節に、その節の本文を持つ子のファイルを並べてある。

### 4.2 表示

#### 出力の分離（セリフと詳細）

- `docs/architecture/display/speak-tool.md`: speak と report のツール
- `docs/architecture/display/section-and-block.md`: 本文の節と塊、図の塊
- `docs/architecture/display/block-field.md`: 塊の欄・進み具合・候補とファイル・確度つきの主張（確かめていないことはこの塊に書く）
- `docs/architecture/display/block-table.md`: 表・対応表・見比べ・前後
- `docs/architecture/display/figure-caption.md`: 画像・図と表の題・書き上げる演出・入口の検査
- `docs/architecture/display/speech-convention.md`: セリフの規約と機械の出来事への反応
- `docs/architecture/display/conclusion.md`: /clear・レポートの構造・お願い・振り返り・検証結果の受け取り・結論部
- `docs/architecture/display/check-result.md`: 検証結果の描き方
- `docs/architecture/adr/0031-report-body-as-regions.md`: レポートの本文を欄の構造のまま渡し、欄ごとに描く（演出と目次の区切り）

#### ワークプラン

- `docs/architecture/display/work-plan.md`: 入力・段の進め方・委譲中の段
- `docs/architecture/display/work-plan-closing.md`: 段の閉じ方・閉じていない report の差し戻し・出す場所
- `docs/architecture/display/work-plan-timing.md`: 段ごとの所要時間・段が移ったときの中間レポート・合図の行・状態

#### 脇の話

- `docs/architecture/display/aside.md`

#### レポートの記法は、TUI と tsukumo で出し分ける

- `docs/architecture/display/notation-per-host.md`

#### 読む時間を減らす物差しと線引き（2026-09-13 決定、2026-09-30 改訂）

- `docs/architecture/display/reading-time.md`

#### 塊を足す・外す基準（2026-09-27 決定、2026-09-30 改訂）

- `docs/architecture/display/block-criteria.md`（節「見比べで見つかった穴」: 梯子・穴ドラフトの型・採らない穴）

#### 各表示物

- `docs/architecture/display/portrait-and-balloon.md`: 立ち絵と吹き出し
- `docs/architecture/display/permission-and-question.md`: 許可と質問
- `docs/architecture/display/main-view.md`: メインビュー（局面・最終と中間のレポート・畳み・本文の流し方・1ターン＝1枚の札・やり取りの列・脇の話の欄・失敗の塊）
- `docs/architecture/display/rich-rendering.md`: レポートの見せ方・パスとコード・色・外部ライブラリ・帯のいまの作業
- `docs/architecture/display/sidebar.md`: サイドバー
- `docs/architecture/display/input-box.md`: 入力欄・配り方・フォールバック

#### タスクのモーダル（2026-09-28 決定）

- `docs/architecture/display/task-modal.md`
