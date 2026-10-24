# 画面のデザイン

ステータス: **正典**。

責務: 見た目（色・書体・レイアウトの計画とトークン、誰が差せるか、雑談モードの画面、背景、
画面のナビの帯、成果の画面、タスクのモーダル）を持つ。層・共有層・部品・キャラクターパックは
`docs/architecture.md`。
読む時: 見た目に触るとき。
直す時: 見た目の決まりを変えたとき。

## このドキュメントの読み方

### このファイルは通読しない

節の本文は子のファイル（`docs/architecture/screen-design/`）にある。下の索引で節を1つ特定し、その子のファイルの節だけを次の形で読む:

```bash
sed -n '/^### 13\.7 /,/^### /p' docs/architecture/screen-design/chat-mode-screen.md
```

**節の番号は設計書の13章だったときのまま**（`13.1`〜`13.9`。`13.10` からは移したあとに続きの番号で足した）。コード・テスト・
`docs/history/` から素の「13.x」で指している箇所が多く、番号を識別子として保つため詰めない。

## 節の索引

この表は `pnpm run format` が子のファイルの題と見出しから書き直すので、手で直さない。

| ファイル                                                               | 題                                                               | 節                                                                                                                                     |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/architecture/screen-design/background.md`                        | 画面のデザイン: 背景                                             | 13. 画面のデザイン / 13.8 背景                                                                                                         |
| `docs/architecture/screen-design/character-accent-and-create.md`       | 画面のデザイン: 差し色の口と作るダイアログ                       | 13. 画面のデザイン / 13.6 設定の置き場所                                                                                               |
| `docs/architecture/screen-design/character-screen.md`                  | 画面のデザイン: キャラクター画面                                 | 13. 画面のデザイン / 13.6 設定の置き場所                                                                                               |
| `docs/architecture/screen-design/chat-mode-history.md`                 | 画面のデザイン: 雑談の待ち・遡り・モードの操作子                 | 13. 画面のデザイン / 13.7 雑談モードの画面 / 返事を待つ間の「...」 / 会話を遡る / モードの操作子はどこに置くか                         |
| `docs/architecture/screen-design/chat-mode-screen.md`                  | 画面のデザイン: 雑談モードの画面                                 | 13. 画面のデザイン / 13.7 雑談モードの画面 / 切り替えのときの立ち絵                                                                    |
| `docs/architecture/screen-design/chat-mode-sidebar-and-speech.md`      | 画面のデザイン: 雑談のサイドバーとセリフの出し方                 | 13. 画面のデザイン / 13.7 雑談モードの画面 / 雑談のときのサイドバー / セリフは全文で現れ、吹き出しは2秒空ける / 時刻と日の区切り       |
| `docs/architecture/screen-design/color-report-and-usage.md`            | 画面のデザイン: レポートとトークン消費の色                       | 13. 画面のデザイン / 13.2 Color                                                                                                        |
| `docs/architecture/screen-design/color.md`                             | 画面のデザイン: 色のつまみと地の段                               | 13. 画面のデザイン / 13.2 Color                                                                                                        |
| `docs/architecture/screen-design/conversation-phase.md`                | 画面のデザイン: 会話の画面の局面                                 | 13. 画面のデザイン / 13.13 会話の画面の局面 / 局面と判定 / 遷移 / 札を移るキーと送るキーの案内 / 脇の話の欄                            |
| `docs/architecture/screen-design/diary-spread.md`                      | 画面のデザイン: 振り返りと日記帳の見開き                         | 13. 画面のデザイン / 13.10 成果の画面 / ボタンを押せないとき・押したあと / 書き終わりの知らせ / 日記帳の見開き / 見本 / 仮に決めたこと |
| `docs/architecture/screen-design/diary.md`                             | 画面のデザイン: 成果の画面                                       | 13. 画面のデザイン / 13.10 成果の画面 / 並べるもの / 灯りの暦 / 空の日・数えられないとき                                               |
| `docs/architecture/screen-design/inquiry.md`                           | 画面のデザイン: お伺いと始め方の一覧                             | 13. 画面のデザイン / 13.13 会話の画面の局面 / お伺い / 始め方の一覧 / おすすめの札の中身                                               |
| `docs/architecture/screen-design/layout.md`                            | 画面のデザイン: レイアウトと差せるもの                           | 13. 画面のデザイン / 13.4 Layout / 13.5 差せるものの受け渡し                                                                           |
| `docs/architecture/screen-design/narrow-screen-region.md`              | 画面のデザイン: 狭い画面の区画                                   | 13. 画面のデザイン / 13.9 画面のナビゲーション / 狭い画面（760px 以下） / 画面が5枚以上になったら                                      |
| `docs/architecture/screen-design/narrow-screen.md`                     | 画面のデザイン: 狭い画面                                         | 13. 画面のデザイン / 13.9 画面のナビゲーション / 狭い画面（760px 以下）                                                                |
| `docs/architecture/screen-design/nav-current-work.md`                  | 画面のデザイン: いまの作業の札                                   | 13. 画面のデザイン / 13.9 画面のナビゲーション / いまの作業                                                                            |
| `docs/architecture/screen-design/nav-gear-and-face.md`                 | 画面のデザイン: 設定の歯車と顔                                   | 13. 画面のデザイン / 13.9 画面のナビゲーション / 設定の歯車 / 顔 / キャラクターの選び口                                                |
| `docs/architecture/screen-design/nav-mode-control.md`                  | 画面のデザイン: 動き方の操作子                                   | 13. 画面のデザイン / 13.9 画面のナビゲーション / 動き方の操作子                                                                        |
| `docs/architecture/screen-design/nav-room-and-switch.md`               | 画面のデザイン: 部屋の名前とセッションの切り替え                 | 13. 画面のデザイン / 13.9 画面のナビゲーション / 部屋の名前 / セッションの札 / 切り替え画面 / 会話の画面の帯とサイドバーの下端の帯     |
| `docs/architecture/screen-design/nav-strip.md`                         | 画面のデザイン: 画面のナビゲーションの帯                         | 13. 画面のデザイン / 13.9 画面のナビゲーション / 帯に何を置くか / 採らなかった案                                                       |
| `docs/architecture/screen-design/nav-usage.md`                         | 画面のデザイン: 使用量の行と帯が外すもの                         | 13. 画面のデザイン / 13.9 画面のナビゲーション / 使用量の行 / プラン使用量の札 / 何を外すか / 帯が奪う面積（実測）                     |
| `docs/architecture/screen-design/nav-work-plan-and-background-task.md` | 画面のデザイン: いまの作業のワークプランとバックグラウンドタスク | 13. 画面のデザイン / 13.9 画面のナビゲーション / いまの作業 / バックグラウンドタスク                                                   |
| `docs/architecture/screen-design/notice-and-failure.md`                | 画面のデザイン: 知らせの行・読み上げ・失敗の塊                   | 13. 画面のデザイン / 13.13 会話の画面の局面 / 知らせの行 / 読み上げとフォーカス / 進行の計測値の記録 / 失敗の塊                        |
| `docs/architecture/screen-design/principle-and-type.md`                | 画面のデザイン: 原則と書体                                       | 13. 画面のデザイン / 13.1 Principles / 13.3 Type                                                                                       |
| `docs/architecture/screen-design/report-head.md`                       | 画面のデザイン: レポートの頭とファイルの塊                       | 13. 画面のデザイン / 13.13 会話の画面の局面 / レポートの頭（合図の行） / ファイルの塊 / レポートの塊のあき                             |
| `docs/architecture/screen-design/scene-behavior.md`                    | 画面のデザイン: 場面ごとのキャラクターの振る舞い                 | 13. 画面のデザイン / 13.13 会話の画面の局面 / 場面ごとのキャラクターの振る舞い / 採らなかった案                                        |
| `docs/architecture/screen-design/setting-place.md`                     | 画面のデザイン: 設定の置き場所                                   | 13. 画面のデザイン / 13.6 設定の置き場所                                                                                               |
| `docs/architecture/screen-design/task-modal.md`                        | 画面のデザイン: タスクのモーダル                                 | 13. 画面のデザイン / 13.12 タスクのモーダル                                                                                            |
| `docs/architecture/screen-design/token-usage-review.md`                | 画面のデザイン: トークン消費の見直し区画                         | 13. 画面のデザイン / 13.14 トークン消費の見直し区画                                                                                    |
| `docs/architecture/screen-design/work-strip.md`                        | 画面のデザイン: 進み具合の帯                                     | 13. 画面のデザイン / 13.13 会話の画面の局面 / 進み具合の帯                                                                             |
