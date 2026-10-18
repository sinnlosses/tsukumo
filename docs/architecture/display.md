# 表示

最終更新: 2026-09-23（`docs/requirements.md` の 4.2 をこのファイルへ移し、ユーザーの発言の引用・
変更の経緯・実測の数字を `docs/history/decision.md`「display.md 4.2 …」の節へ移した）
ステータス: **正典**。

責務: セリフとレポートの出力分離、レポートの記法の規約、立ち絵・吹き出し・メインビュー・
入力欄・サイドバーなど各表示物の仕様を持つ。それ以外の機能要件は `docs/requirements.md`。
読む時: 表示物・レポートの記法に触るとき。
直す時: 表示の仕様を変えたとき。

## このドキュメントの読み方

### このファイルは通読しない

節を1つ特定して、その節だけを次の形で読む:

```bash
sed -n '/^#### 各表示物/,/^#\{2,4\} /p' docs/architecture/display.md
```

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

### 節の索引

**索引の行は本文の `#### <見出し>` の小節と1対1**（小節を足したり消したりしたら、ここも
同じ数だけ動かす）。

| 節                                                 | 中身                                                                                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #### 出力の分離（セリフと詳細）                    | `speak` とレポートへの分離、行頭マーカー撤去、セリフの規約の3分割、お願いの扱い、機械の出来事への反応                                                    |
| #### ワークプラン                                  | `work_plan` ツール、呼ぶ条件、段のまとめ、委譲の返却で進める段と委譲ゲート、段の閉じ方と閉じていない `report`、`speak` と `report` との並べ方、出す4か所 |
| #### 脇の話                                        | 委譲中に送った言葉を親のやり取りに吊るす判定と送り方、`aside` の記録、包みと組み直し、`speak` で受ける答え、差し戻し、欄とやり取りの列                   |
| #### レポートの記法は、TUI と tsukumo で出し分ける | `systemPrompt` の append、`asuna.md` は TUI 向けのまま、レポートは日本語で書かせる                                                                       |
| #### 読む時間を減らす物差しと線引き                | 規則の置き場、分かるまでの時間という物差し、見せ方と再構成の線引き、画像を描く条件、足さないもの                                                         |
| #### 塊を足す・外す基準                            | 使われ方の記録・集計スクリプト、足すきっかけ（3%）と外す基準（0回）                                                                                      |
| #### 各表示物                                      | 立ち絵・吹き出し・お伺い（許可と質問）・局面ごとのメインビュー・入力欄・サイドバーなど各領域の仕様                                                       |
| #### タスクのモーダル                              | 左に一覧・右に Markdown の詳細、本文の出どころ、絞り込み・検索、ID のつながり                                                                            |

各節の本文は `docs/architecture/display/` の子のファイルにある。下の `#### <見出し>` の小節に、その節の本文を持つ子のファイルを並べてある。

### 4.2 表示

#### 出力の分離（セリフと詳細）

- `docs/architecture/display/speak-tool.md`: speak と report のツール
- `docs/architecture/display/section-and-block.md`: 本文の節と塊、図の塊
- `docs/architecture/display/block-field.md`: 塊の欄・進み具合・候補とファイル・表・対応表・見比べ・前後
- `docs/architecture/display/figure-caption.md`: 寸法図・画像・図と表の題・書き上げる演出・入口の検査
- `docs/architecture/display/speech-convention.md`: セリフの規約と機械の出来事への反応
- `docs/architecture/display/conclusion.md`: /clear・レポートの構造・お願い・振り返り・検証結果の受け取り・結論部
- `docs/architecture/display/check-result.md`: 検証結果の描き方

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

- `docs/architecture/display/block-criteria.md`

#### 各表示物

- `docs/architecture/display/portrait-and-balloon.md`: 立ち絵と吹き出し
- `docs/architecture/display/permission-and-question.md`: 許可と質問
- `docs/architecture/display/main-view.md`: メインビュー（局面・最終と中間のレポート・畳み）
- `docs/architecture/display/main-view-turn-card.md`: メインビュー（本文の流し方・1ターン＝1枚の札・やり取りの列・脇の話の欄・失敗の塊）
- `docs/architecture/display/rich-rendering.md`: レポートの見せ方・パスとコード・色・外部ライブラリ・帯のいまの作業
- `docs/architecture/display/sidebar.md`: サイドバー
- `docs/architecture/display/input-box.md`: 入力欄・配り方・フォールバック

#### タスクのモーダル（2026-09-28 決定）

- `docs/architecture/display/task-modal.md`
