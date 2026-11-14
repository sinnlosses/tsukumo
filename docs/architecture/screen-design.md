# 画面のデザイン

ステータス: **正典**。

責務: 見た目（色・書体・レイアウトの計画とトークン、誰が差せるか、雑談モードの画面、背景、
舞台と紙の器・部屋の頭と探す、成果の画面）を持つ。層・共有層・部品・キャラクターパックは
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

| ファイル                                                             | 説明                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/architecture/screen-design/background.md`                      | 舞台の全面に敷く背景画像。                                                                                                                                                                                                             |
| `docs/architecture/screen-design/character-accent-and-create.md`     | 13.6 設定の置き場所の後半。                                                                                                                                                                                                            |
| `docs/architecture/screen-design/character-screen.md`                | 13.6 設定の置き場所の中ほど。                                                                                                                                                                                                          |
| `docs/architecture/screen-design/chat-mode-history.md`               | 13.7 雑談モードの画面のうち、返事を待つ間の「...」、会話を遡る、モードの操作子の置き場所。                                                                                                                                             |
| `docs/architecture/screen-design/chat-mode-screen.md`                | 13.7 雑談モードの画面の本文。                                                                                                                                                                                                          |
| `docs/architecture/screen-design/chat-mode-sidebar-and-speech.md`    | 13.7 雑談モードの画面のうち、雑談のときの欄外（覚えていること・最近の話題）、セリフを全文で出して吹き出しを2秒空ける決まり、時刻と日の区切り。                                                                                         |
| `docs/architecture/screen-design/color.md`                           | 13.2 Color。                                                                                                                                                                                                                           |
| `docs/architecture/screen-design/conversation-phase.md`              | 会話の画面のメインビューの中身を局面で入れ替える約束、局面の判定、遷移、カードを移るキーと送るキー、補足メッセージの欄。                                                                                                               |
| `docs/architecture/screen-design/design-token.md`                    | デザイントークンの段と値と使い分け、新しい器「舞台と紙」の値と夜・昼のテーマ、旧いトークンとの対応、tsukumo と Astryx の向き、直書きの許す範囲、`ui/` の箱の部品（`Surface`・`Badge`・`Divider`）、見本帳（`#design`）の置き場を持つ。 |
| `docs/architecture/screen-design/diary-spread.md`                    | 成果の画面の振り返りのボタンの扱い、書き終わりの知らせ、日記帳の見開き、見本、仮に決めたこと。                                                                                                                                         |
| `docs/architecture/screen-design/diary.md`                           | 成果の画面（つくもの日記帳）の並び、日記の区画、しおり、小さな驚き、色、灯りの暦、空の日の見え方。                                                                                                                                     |
| `docs/architecture/screen-design/inquiry.md`                         | 許可要求と質問のカード（お伺い）、迎える局面の始め方の一覧、おすすめのカードの中身の作り方。                                                                                                                                           |
| `docs/architecture/screen-design/layout.md`                          | 「舞台と紙」の器（舞台・紙・サイドバー・浮く入力欄・重ねる紙の並びと、姿勢ごとの形）、揃え・図の高さ・欄外注の列・部品の横並びと、パック・使う人が差すものの受け渡し。                                                                 |
| `docs/architecture/screen-design/narrow-screen.md`                   | 760px 以下のビューポートの縦1列の並び、1行の頭と「≡」から開く探す、全面の紙、顔と吹き出し、答え待ちのカード、入力欄、キーボード、見本に無い場面。                                                                                      |
| `docs/architecture/screen-design/notice-and-failure.md`              | 会話の画面の知らせの行、読み上げとフォーカス、進行の計測値の記録、失敗の表示。                                                                                                                                                         |
| `docs/architecture/screen-design/principle-and-type.md`              | 画面のデザインの前置き、5つの原則、書体・文字の段・行間と幅。                                                                                                                                                                          |
| `docs/architecture/screen-design/report-head.md`                     | 紙の頭の判定の行と確かさの台帳、働くあいだの紙の計画、離れていたあいだのまとめ、レポートの頭のタスクの見出しの行、フェーズごとの時間、ファイルの部品、レポートの部品のあき。                                                           |
| `docs/architecture/screen-design/room-head-and-search.md`            | 新しい器「舞台と紙」の入口。                                                                                                                                                                                                           |
| `docs/architecture/screen-design/scene-behavior.md`                  | 場面ごとの舞台の吹き出し・表情・動きの早見表、舞台の「手元」の行、バックグラウンドタスクの出し方と、13.13 の採らなかった案。                                                                                                           |
| `docs/architecture/screen-design/setting-place.md`                   | 13.6 設定の置き場所の前半。                                                                                                                                                                                                            |
| `docs/architecture/screen-design/stage-and-paper-yardstick-extra.md` | レポートとプログレスと舞台の作り直しを数で比べるための、紙・進み具合・舞台・書き手の物差しと測り方・目標と、作り直す前の値。                                                                                                           |
| `docs/architecture/screen-design/stage-and-paper-yardstick.md`       | 「舞台と紙」（案A）に作り直す画面の6場面（迎える・頼む・待つ・答える・読む・戻る）ごとの合格の画・数の物差しと目標・手本の製品と、作り直す前と後の画面の値。                                                                           |
| `docs/architecture/screen-design/token-usage-review.md`              | トークン消費の画面の「減らし方を見てもらう」区画の文言・配置・押せない条件・経過時間の書式と、結果の場面。                                                                                                                             |
