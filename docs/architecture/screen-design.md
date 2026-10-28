# 画面のデザイン

ステータス: **正典**。

責務: 見た目（色・書体・レイアウトの計画とトークン、誰が差せるか、雑談モードの画面、背景、
画面のナビの帯、成果の画面）を持つ。層・共有層・部品・キャラクターパックは
`docs/architecture.md`。
読む時: 見た目に触るとき。
直す時: 見た目の決まりを変えたとき。

## このドキュメントの読み方

### このファイルは目次

節の本文は子のファイル（`docs/architecture/screen-design/`）にある。下の目次で子を1つ特定し、その子のファイルを丸ごと読む。

**節の番号は設計書の13章だったときのまま**（`13.1`〜`13.9`。`13.10` からは移したあとに続きの番号で足した）。コード・テスト・
`docs/history/` から素の「13.x」で指している箇所が多く、番号を識別子として保つため詰めない。

13.12 タスクのモーダルは `docs/architecture/display/task-modal.md` にある（この目次の子には無い）。

## 目次

この表は `pnpm run format` が子のファイルの責務の行から書き直すので、手で直さない。

| ファイル                                                               | 説明                                                                                                                                                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/architecture/screen-design/background.md`                        | 枠を持たない領域にだけ敷く背景画像。                                                                                                                                                |
| `docs/architecture/screen-design/character-accent-and-create.md`       | 13.6 設定の置き場所の後半。                                                                                                                                                         |
| `docs/architecture/screen-design/character-screen.md`                  | 13.6 設定の置き場所の中ほど。                                                                                                                                                       |
| `docs/architecture/screen-design/chat-mode-history.md`                 | 13.7 雑談モードの画面のうち、返事を待つ間の「...」、会話を遡る、モードの操作子の置き場所。                                                                                          |
| `docs/architecture/screen-design/chat-mode-screen.md`                  | 13.7 雑談モードの画面の本文。                                                                                                                                                       |
| `docs/architecture/screen-design/chat-mode-sidebar-and-speech.md`      | 13.7 雑談モードの画面のうち、雑談のときのサイドバー、セリフを全文で出して吹き出しを2秒空ける決まり、時刻と日の区切り。                                                              |
| `docs/architecture/screen-design/color.md`                             | 13.2 Color。                                                                                                                                                                        |
| `docs/architecture/screen-design/conversation-phase.md`                | 会話の画面のメインビューの中身を局面で入れ替える約束、局面の判定、遷移、札を移るキーと送るキー、脇の話の欄。                                                                        |
| `docs/architecture/screen-design/design-token.md`                      | 余白・角丸・影・動きのデザイントークンの段と値、使い分け、直書きの許す範囲、`ui/` の箱の部品（`Surface`・`Badge`・`Divider`）、見本帳（`#design`）の置き場を持つ。                  |
| `docs/architecture/screen-design/diary-spread.md`                      | 成果の画面の振り返りのボタンの扱い、書き終わりの知らせ、日記帳の見開き、見本、仮に決めたこと。                                                                                      |
| `docs/architecture/screen-design/diary.md`                             | 成果の画面（つくもの日記帳）の並び、日記の区画、しおり、小さな驚き、色、灯りの暦、空の日の見え方。                                                                                  |
| `docs/architecture/screen-design/inquiry.md`                           | 許可要求と質問の札（お伺い）、迎える局面の始め方の一覧、おすすめの札の中身の作り方。                                                                                                |
| `docs/architecture/screen-design/layout.md`                            | 領域の並び・揃え・図の高さ・余白の柱・やり取りの列・中くらいの窓幅と、パック・使う人が差すものの受け渡し。                                                                          |
| `docs/architecture/screen-design/narrow-screen.md`                     | 760px 以下の窓の縦1列の配置、色と書体の宛て先、部品の行き先、頭の形、本文・板・顔と吹き出し・答え待ちの札・入力欄・引き出し、キーボード、見本に無い場面、画面が増えたときの畳み方。 |
| `docs/architecture/screen-design/nav-current-work.md`                  | 帯のいまの作業の前半。                                                                                                                                                              |
| `docs/architecture/screen-design/nav-gear-and-face.md`                 | 帯の設定の歯車（設定のダイアログの5つの面）、帯の顔、キャラクターの選び口。                                                                                                         |
| `docs/architecture/screen-design/nav-mode-control.md`                  | 帯から変える動き方の操作子。                                                                                                                                                        |
| `docs/architecture/screen-design/nav-room-and-switch.md`               | 帯の部屋の名前、セッションの札、切り替え画面、会話の画面の帯とサイドバーの下端の帯。                                                                                                |
| `docs/architecture/screen-design/nav-strip.md`                         | 13.9 画面のナビゲーションの本文。                                                                                                                                                   |
| `docs/architecture/screen-design/nav-usage.md`                         | サイドバーの使用量の行、プラン使用量の札、帯ができて外したもの、帯が奪う面積の実測。                                                                                                |
| `docs/architecture/screen-design/nav-work-plan-and-background-task.md` | 帯のいまの作業の後半（ワークプラン・依頼の手順の一覧・範囲・前の依頼の失敗）と、バックグラウンドタスク。                                                                            |
| `docs/architecture/screen-design/notice-and-failure.md`                | 会話の画面の知らせの行、読み上げとフォーカス、進行の計測値の記録、失敗の塊。                                                                                                        |
| `docs/architecture/screen-design/principle-and-type.md`                | 画面のデザインの前置き、5つの原則、書体・文字の段・行間と幅。                                                                                                                       |
| `docs/architecture/screen-design/report-head.md`                       | レポートの頭の合図の行（検証結果・段ごとの時間）、ファイルの塊、レポートの塊のあき。                                                                                                |
| `docs/architecture/screen-design/scene-behavior.md`                    | 場面ごとのキャラビューの吹き出し・表情・動きの早見表と、13.13 の採らなかった案。                                                                                                    |
| `docs/architecture/screen-design/setting-place.md`                     | 13.6 設定の置き場所の前半。                                                                                                                                                         |
| `docs/architecture/screen-design/token-usage-review.md`                | トークン消費の画面の「減らし方を見てもらう」区画の文言・配置・押せない条件・経過時間の書式と、結果の場面。                                                                          |
| `docs/architecture/screen-design/work-strip.md`                        | 会話の画面のメインビューの札の頭に固定する進み具合の帯（状態のチップ・段の丸・段の吹き出し・走っている手順・手順の口）。                                                            |
