# 画面のデザイン

最終更新: 2026-09-23（当時の設計書の13章をこのファイルへ移した日。本文は移す前のまま）
ステータス: **正典**。

責務: 見た目（色・書体・レイアウトの計画とトークン、誰が差せるか、雑談モードの画面、背景、
画面のナビの帯、成果の画面、タスクのモーダル）を持つ。層・共有層・部品・キャラクターパックは
`docs/architecture.md`。
読む時: 見た目に触るとき。
直す時: 見た目の決まりを変えたとき。

## このドキュメントの読み方

### このファイルは通読しない

節を1つ特定して、その節だけを次の形で読む:

```bash
sed -n '/^### 13\.7 /,/^### /p' docs/architecture/screen-design.md
```

**節の番号は設計書の13章だったときのまま**（`13.1`〜`13.9`。`13.10` からは移したあとに続きの番号で足した）。コード・テスト・
`docs/history/` から素の「13.x」で指している箇所が多く、番号を識別子として保つため詰めない。

### 節の索引

**索引の行は本文の `### 13.<番号>` の節と1対1**（`####` の小節は載せない。節を足したり消したり
したら、ここも同じ数だけ動かす）。

| 節                                 | 中身                                                                                                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ### 13.1 Principles                | 5つの原則。**色はキャラクターの持ち物、静けさは画面の持ち物**。**最初にここ**                                                                                                                                                              |
| ### 13.2 Color                     | 差せるつまみ4つとトークン、導出する色・固定する色                                                                                                                                                                                          |
| ### 13.3 Type                      | 書体2本、文字の段、行間と行長                                                                                                                                                                                                              |
| ### 13.4 Layout                    | 上の2枠は読む場所、下は居る場所。領域の並び                                                                                                                                                                                                |
| ### 13.5 差せるものの受け渡し      | パック・使う人がそれぞれ何を差し、どこから渡るか                                                                                                                                                                                           |
| ### 13.6 設定の置き場所            | 帯・サイドバー・キャラクター画面の割り振り。キャラクターの切り替えは第3の扱い。リポジトリごとの設定は持たない                                                                                                                              |
| ### 13.7 雑談モードの画面          | 立ち絵と会話のログ、雑談のときのサイドバー、時刻と日の区切り、遡り                                                                                                                                                                         |
| ### 13.8 背景                      | 枠を持たない領域にだけ敷く背景画像。覆いの下限、差し替え                                                                                                                                                                                   |
| ### 13.9 画面のナビゲーション      | 全画面の最上部の帯。いまの作業・設定の歯車・顔・部屋の名前・切り替え画面・狭い画面                                                                                                                                                         |
| ### 13.10 成果の画面               | 成果を1日ぶん見て日記を書く「つくもの日記帳」。5つの場面・灯りの暦・見開き                                                                                                                                                                 |
| ### 13.12 タスクのモーダル         | 「一覧を見る」で開く、左に一覧・右に Markdown の詳細のモーダルの寸法・色・狭い画面。サイドバーのタスクの行とそこから開くのぞき窓                                                                                                           |
| ### 13.13 会話の画面の局面         | 局面ごとのメインビューの中身・遷移・札を移るキーと送るキーの案内・進み具合の帯・脇の話の欄・お伺い・始め方の一覧・おすすめの札の中身・知らせの行・進行の計測値の記録・失敗の塊・レポートの頭（合図の行）・ファイルの塊・レポートの塊のあき |
| ### 13.14 トークン消費の見直し区画 | 「減らし方を見てもらう」区画の文言・配置・押せない条件・経過時間の書式、結果の場面の決め事（色は 13.2）                                                                                                                                    |

本文は 30 の子のファイル（`docs/architecture/screen-design/`）に分けてある。節の見出しはここに残し、中身は移し先を引く。

- `docs/architecture/screen-design/principle-and-type.md`: `## 13. 画面のデザイン` の前置き、13.1 Principles、13.3 Type
- `docs/architecture/screen-design/color.md`: 13.2 Color の前半（つまみ4つ・導出・固定・地の段・印・note・コードの色）
- `docs/architecture/screen-design/color-report-and-usage.md`: 13.2 Color の後半（結論部の色・字の色・流れの丸・見出しの線・コンテキストの内訳とトークン消費の色）
- `docs/architecture/screen-design/layout.md`: 13.4 Layout、13.5 差せるものの受け渡し
- `docs/architecture/screen-design/setting-place.md`: 13.6 の前半（帯・サイドバー・歯車の割り振り、新しいセッションの既定、演出の速さ、動き方、キャラクターの切り替えの覚え方）
- `docs/architecture/screen-design/character-screen.md`: 13.6 の中ほど（キャラクター画面の中身）
- `docs/architecture/screen-design/character-accent-and-create.md`: 13.6 の後半（画面の差し色を編集する口の形、作るダイアログ、採らなかった案）
- `docs/architecture/screen-design/chat-mode-screen.md`: 13.7 の本文、切り替えのときの立ち絵
- `docs/architecture/screen-design/chat-mode-sidebar-and-speech.md`: 雑談のときのサイドバー、セリフは全文で現れ、吹き出しは2秒空ける、時刻と日の区切り
- `docs/architecture/screen-design/chat-mode-history.md`: 返事を待つ間の「...」、会話を遡る、モードの操作子はどこに置くか
- `docs/architecture/screen-design/background.md`: 13.8 背景
- `docs/architecture/screen-design/nav-strip.md`: 13.9 の本文、帯に何を置くか、13.9 の採らなかった案
- `docs/architecture/screen-design/nav-mode-control.md`: 動き方の操作子
- `docs/architecture/screen-design/nav-current-work.md`: いまの作業の前半（札・答え待ち・レポートを書いている途中）
- `docs/architecture/screen-design/nav-work-plan-and-background-task.md`: いまの作業の後半（ワークプランから: 依頼の手順の一覧・範囲・前の依頼の失敗）、バックグラウンドタスク
- `docs/architecture/screen-design/nav-gear-and-face.md`: 設定の歯車、顔、キャラクターの選び口
- `docs/architecture/screen-design/nav-room-and-switch.md`: 部屋の名前、セッションの札、切り替え画面、会話の画面の帯とサイドバーの下端の帯
- `docs/architecture/screen-design/nav-usage.md`: 使用量の行、プラン使用量の札、何を外すか、帯が奪う面積（実測）
- `docs/architecture/screen-design/narrow-screen.md`: 狭い画面の前半（全体・色・部品の行き先・頭）
- `docs/architecture/screen-design/narrow-screen-region.md`: 狭い画面の後半（本文・板・顔と吹き出し・答え待ちの札・入力欄・引き出し・キーボード・見本に無い場面）、画面が5枚以上になったら
- `docs/architecture/screen-design/diary.md`: 13.10 の本文、並べるもの、灯りの暦、空の日・数えられないとき
- `docs/architecture/screen-design/diary-spread.md`: ボタンを押せないとき・押したあと、書き終わりの知らせ、日記帳の見開き、見本、仮に決めたこと
- `docs/architecture/screen-design/task-modal.md`: 13.12 タスクのモーダル、サイドバーのタスクののぞき窓
- `docs/architecture/screen-design/conversation-phase.md`: 13.13 の本文、局面と判定、遷移、札を移るキーと送るキーの案内、脇の話の欄
- `docs/architecture/screen-design/work-strip.md`: 進み具合の帯
- `docs/architecture/screen-design/inquiry.md`: お伺い、始め方の一覧、おすすめの札の中身
- `docs/architecture/screen-design/notice-and-failure.md`: 知らせの行、読み上げとフォーカス、進行の計測値の記録、失敗の塊
- `docs/architecture/screen-design/report-head.md`: レポートの頭（合図の行）、ファイルの塊、レポートの塊のあき
- `docs/architecture/screen-design/scene-behavior.md`: 場面ごとのキャラクターの振る舞い、13.13 の採らなかった案
- `docs/architecture/screen-design/token-usage-review.md`: 13.14 トークン消費の見直し区画

## 13. 画面のデザイン

本文は `docs/architecture/screen-design/principle-and-type.md`。

### 13.1 Principles

本文は `docs/architecture/screen-design/principle-and-type.md`。

### 13.2 Color

本文は `docs/architecture/screen-design/color.md`（前半）と `docs/architecture/screen-design/color-report-and-usage.md`（後半）。

### 13.3 Type

本文は `docs/architecture/screen-design/principle-and-type.md`。

### 13.4 Layout

本文は `docs/architecture/screen-design/layout.md`。

### 13.5 差せるものの受け渡し

本文は `docs/architecture/screen-design/layout.md`。

### 13.6 設定の置き場所

本文は `docs/architecture/screen-design/setting-place.md`（前半）と `docs/architecture/screen-design/character-screen.md`（中ほど）と `docs/architecture/screen-design/character-accent-and-create.md`（後半）。

### 13.7 雑談モードの画面

本文は `docs/architecture/screen-design/chat-mode-screen.md`。

#### 切り替えのときの立ち絵

本文は `docs/architecture/screen-design/chat-mode-screen.md`。

#### 雑談のときのサイドバー

本文は `docs/architecture/screen-design/chat-mode-sidebar-and-speech.md`。

#### セリフは全文で現れ、吹き出しは2秒空ける

本文は `docs/architecture/screen-design/chat-mode-sidebar-and-speech.md`。

#### 時刻と日の区切り

本文は `docs/architecture/screen-design/chat-mode-sidebar-and-speech.md`。

#### 返事を待つ間の「...」

本文は `docs/architecture/screen-design/chat-mode-history.md`。

#### 会話を遡る

本文は `docs/architecture/screen-design/chat-mode-history.md`。

#### モードの操作子はどこに置くか

本文は `docs/architecture/screen-design/chat-mode-history.md`。

### 13.8 背景

本文は `docs/architecture/screen-design/background.md`。

#### 何を持つか

本文は `docs/architecture/screen-design/background.md`。

#### 読めることをどう守るか（覆いの下限）

本文は `docs/architecture/screen-design/background.md`。

#### どう敷くか

本文は `docs/architecture/screen-design/background.md`。

#### 画面からの差し替え

本文は `docs/architecture/screen-design/background.md`。

#### 採らなかった案

本文は `docs/architecture/screen-design/background.md`。

### 13.9 画面のナビゲーション

本文は `docs/architecture/screen-design/nav-strip.md`。

#### 帯に何を置くか

本文は `docs/architecture/screen-design/nav-strip.md`。

#### 動き方の操作子

本文は `docs/architecture/screen-design/nav-mode-control.md`。

#### いまの作業

本文は `docs/architecture/screen-design/nav-current-work.md`（前半）と `docs/architecture/screen-design/nav-work-plan-and-background-task.md`（後半）。

#### バックグラウンドタスク

本文は `docs/architecture/screen-design/nav-work-plan-and-background-task.md`。

#### 設定の歯車

本文は `docs/architecture/screen-design/nav-gear-and-face.md`。

#### 顔

本文は `docs/architecture/screen-design/nav-gear-and-face.md`。

#### キャラクターの選び口

本文は `docs/architecture/screen-design/nav-gear-and-face.md`。

#### 部屋の名前

本文は `docs/architecture/screen-design/nav-room-and-switch.md`。

#### セッションの札

本文は `docs/architecture/screen-design/nav-room-and-switch.md`。

#### 切り替え画面

本文は `docs/architecture/screen-design/nav-room-and-switch.md`。

#### 会話の画面の帯とサイドバーの下端の帯

本文は `docs/architecture/screen-design/nav-room-and-switch.md`。

#### 使用量の行

本文は `docs/architecture/screen-design/nav-usage.md`。

#### プラン使用量の札

本文は `docs/architecture/screen-design/nav-usage.md`。

#### 何を外すか

本文は `docs/architecture/screen-design/nav-usage.md`。

#### 帯が奪う面積（実測）

本文は `docs/architecture/screen-design/nav-usage.md`。

#### 狭い画面（760px 以下）

本文は `docs/architecture/screen-design/narrow-screen.md`（前半）と `docs/architecture/screen-design/narrow-screen-region.md`（後半）。

#### 画面が5枚以上になったら

本文は `docs/architecture/screen-design/narrow-screen-region.md`。

#### 採らなかった案

本文は `docs/architecture/screen-design/nav-strip.md`。

### 13.10 成果の画面

本文は `docs/architecture/screen-design/diary.md`。

#### 並べるもの

本文は `docs/architecture/screen-design/diary.md`。

#### 灯りの暦

本文は `docs/architecture/screen-design/diary.md`。

#### 空の日・数えられないとき

本文は `docs/architecture/screen-design/diary.md`。

#### ボタンを押せないとき・押したあと

本文は `docs/architecture/screen-design/diary-spread.md`。

#### 書き終わりの知らせ

本文は `docs/architecture/screen-design/diary-spread.md`。

#### 日記帳の見開き

本文は `docs/architecture/screen-design/diary-spread.md`。

#### 見本

本文は `docs/architecture/screen-design/diary-spread.md`。

#### 仮に決めたこと

本文は `docs/architecture/screen-design/diary-spread.md`。

### 13.12 タスクのモーダル

本文は `docs/architecture/screen-design/task-modal.md`。

#### サイドバーのタスクののぞき窓

本文は `docs/architecture/screen-design/task-modal.md`。

### 13.13 会話の画面の局面

本文は `docs/architecture/screen-design/conversation-phase.md`。

#### 局面と判定

本文は `docs/architecture/screen-design/conversation-phase.md`。

#### 遷移

本文は `docs/architecture/screen-design/conversation-phase.md`。

#### 札を移るキーと送るキーの案内

本文は `docs/architecture/screen-design/conversation-phase.md`。

#### 進み具合の帯

本文は `docs/architecture/screen-design/work-strip.md`。

#### 脇の話の欄

本文は `docs/architecture/screen-design/conversation-phase.md`。

#### お伺い

本文は `docs/architecture/screen-design/inquiry.md`。

#### 始め方の一覧

本文は `docs/architecture/screen-design/inquiry.md`。

#### おすすめの札の中身

本文は `docs/architecture/screen-design/inquiry.md`。

#### 知らせの行

本文は `docs/architecture/screen-design/notice-and-failure.md`。

#### 読み上げとフォーカス

本文は `docs/architecture/screen-design/notice-and-failure.md`。

#### 進行の計測値の記録

本文は `docs/architecture/screen-design/notice-and-failure.md`。

#### 失敗の塊

本文は `docs/architecture/screen-design/notice-and-failure.md`。

#### レポートの頭（合図の行）

本文は `docs/architecture/screen-design/report-head.md`。

#### ファイルの塊

本文は `docs/architecture/screen-design/report-head.md`。

#### レポートの塊のあき

本文は `docs/architecture/screen-design/report-head.md`。

#### 場面ごとのキャラクターの振る舞い

本文は `docs/architecture/screen-design/scene-behavior.md`。

#### 採らなかった案

本文は `docs/architecture/screen-design/scene-behavior.md`。

### 13.14 トークン消費の見直し区画

本文は `docs/architecture/screen-design/token-usage-review.md`。
