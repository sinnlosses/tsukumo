# 会話の基本の流れ

ステータス: **図解**（正典は各図の直後の表に名指す文書。規則を言い直さない）。入口は `docs/guide.md`。

責務: 起動・依頼1件・許可と質問・`report` の差し戻しの4本の流れをシーケンス図で持つ。
読む時: 依頼1件がどう流れて画面に出るかを1本の流れとして掴みたいとき。
直す時: 起動・依頼・答え待ち・`report` の差し戻しの順序が変わったとき。

## 1. 起動

`tsukumo` を打ってから、タブが開くまで。順序の正典は `docs/architecture/runtime-flow.md`「起動」。

```mermaid
sequenceDiagram
  actor user as 利用者
  participant cli as cli
  participant main as main
  participant server as ビューサーバ
  participant manager as セッション管理
  participant tab as ブラウザのタブ
  user->>cli: tsukumo を打つ
  cli->>main: run(config, launch)
  main->>main: 前提の確認（ポート・成果物・プラグイン）
  main->>main: 初期のパックを決める
  main->>server: 起動トークンを作って listen
  main->>manager: セッションを1つ作る（SDK か fake driver）
  main->>server: セッションを /ws に繋ぐ
  main->>tab: URL（?t=トークン）を開く
```

箱と実物

| 箱             | 実物                                                                                      | 正典の文書                                  |
| -------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------- |
| cli            | `src/cli.ts`                                                                              | `docs/architecture/runtime-flow.md`「起動」 |
| main           | `src/main.ts`、`src/startup-order.ts`、`src/current-character.ts`、`src/session-start.ts` | `docs/architecture/runtime-flow.md`「起動」 |
| ビューサーバ   | `src/view-delivery.ts`、`src/server/view-server/adapter/server.ts`                        | `docs/architecture/runtime-flow.md`「起動」 |
| セッション管理 | `src/server/session/core/session-manager.ts`、`src/server/session/core/session-launch.ts` | `docs/architecture/runtime-flow.md`「起動」 |
| ブラウザのタブ | `src/browser/`                                                                            | `docs/architecture/runtime-flow.md`「接続」 |

## 2. 依頼1件

入力欄から送った依頼が、セリフとレポートになって画面に出るまで。正典は `docs/architecture/runtime-flow.md`「接続」「依頼」、`docs/architecture/display/speak-tool.md`、`docs/architecture/display/main-view.md`。

```mermaid
sequenceDiagram
  actor user as 利用者
  participant input as 入力欄
  participant server as ビューサーバ
  participant driver as セッションドライバ
  participant claude as Claude Code
  participant view as 吹き出しとメインビュー
  user->>input: 依頼を書いて送る
  input->>server: session.prompt（oRPC）
  server->>driver: prompt(text)
  driver->>claude: 依頼を入力のストリームへ渡す
  driver-->>view: request イベント（events フレーム）
  claude->>driver: speak の呼び出し
  driver-->>view: 吹き出しにセリフを出す
  claude->>driver: ツールの進行
  claude->>driver: report の呼び出し（検査を通る）
  driver-->>view: メインビューにレポートを描く
```

箱と実物

| 箱                     | 実物                                                                                                                                                                          | 正典の文書                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 入力欄                 | `src/browser/components/page/conversation/components/dispatch/`                                                                                                               | `docs/architecture/runtime-flow.md`「依頼」         |
| ビューサーバ           | `src/server/view-server/adapter/rpc/frame-procedure.ts`、`src/server/session/adapter/session-procedure.ts`                                                                    | `docs/architecture/runtime-flow.md`「接続」「依頼」 |
| セッションドライバ     | `src/server/session-driver/adapter/sdk/sdk-driver.ts`、`src/server/session-driver/adapter/sdk/sdk-speech-tool.ts`、`src/server/session-driver/adapter/sdk/sdk-report-tool.ts` | `docs/architecture/display/speak-tool.md`           |
| Claude Code            | SDK が起こす子プロセス（実物のコードは無い）                                                                                                                                  | `docs/architecture/overview-and-layer.md`           |
| 吹き出しとメインビュー | `src/browser/components/page/conversation/components/character-view/`、`src/browser/components/page/conversation/components/main-view/`                                       | `docs/architecture/display/main-view.md`            |

## 3. 許可プロンプトと質問

ツールの許可と `AskUserQuestion` が入力欄に出て、答えが Claude Code へ戻るまで。正典は `docs/architecture/runtime-flow.md`「答え待ち」と `docs/architecture/display/permission-and-question.md`。

```mermaid
sequenceDiagram
  actor user as 利用者
  participant claude as Claude Code
  participant driver as セッションドライバ
  participant card as お伺いのカード
  participant server as ビューサーバ
  claude->>driver: question_brief（質問の添え書き。質問のときだけ）
  claude->>driver: canUseTool（許可要求か AskUserQuestion）
  driver->>driver: pending の列に積む
  driver-->>card: pending-changed（状態の pending に載る）
  card->>user: 許可・質問のカードを出す
  user->>card: ボタンか入力欄で答える
  card->>server: session.answer（id と answer）
  server->>driver: 列の待ちを解決する
  driver->>claude: canUseTool の戻り値として返す
  driver-->>card: pending-changed（カードが消える）
```

箱と実物

| 箱                 | 実物                                                                                                                                                    | 正典の文書                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Claude Code        | SDK が起こす子プロセス（実物のコードは無い）                                                                                                            | `docs/architecture/overview-and-layer.md`              |
| セッションドライバ | `src/server/session-driver/core/pending-answer.ts`、`src/server/session-driver/adapter/sdk/sdk-driver.ts`、`src/server/question/core/question-brief.ts` | `docs/architecture/runtime-flow.md`「答え待ち」        |
| お伺いのカード     | `src/browser/components/page/conversation/components/inquiry/`、`src/browser/components/page/conversation/components/pending-ask-card/`                 | `docs/architecture/display/permission-and-question.md` |
| ビューサーバ       | `src/server/session/adapter/session-procedure.ts`                                                                                                       | `docs/architecture/runtime-flow.md`「答え待ち」        |

質問の書き方の条は `src/server/question/core/question-notation.ts` が持つ。

## 4. `report` の差し戻し

検査で差し戻された `report` が描かれず、書き直した `report` が通って描かれるまで。差し戻した草稿は「保留」にならない。イベントは判定の結果まで預かられ、`isError` で返ると捨てられる。正典は `docs/architecture/display/speak-tool.md` の `report` の節。

```mermaid
sequenceDiagram
  participant claude as Claude Code
  participant tool as report のツール
  participant review as 検査
  participant view as メインビュー
  claude->>tool: report（1回目）
  tool->>review: 判定を頼む
  review-->>tool: 差し戻し（直し方だけ）
  tool->>claude: isError で返す（ターンは閉じない）
  Note over view: 1回目は描かれない
  claude->>tool: report（直す欄だけ渡す）
  tool->>review: 判定を頼む
  review-->>tool: 通る
  tool->>claude: 結論の1文目を返す（ターンを閉じる）
  tool-->>view: レポートを描く
```

箱と実物

| 箱              | 実物                                                             | 正典の文書                                |
| --------------- | ---------------------------------------------------------------- | ----------------------------------------- |
| Claude Code     | SDK が起こす子プロセス（実物のコードは無い）                     | `docs/architecture/overview-and-layer.md` |
| report のツール | `src/server/session-driver/adapter/sdk/sdk-report-tool.ts`       | `docs/architecture/display/speak-tool.md` |
| 検査            | `src/server/report/core/review/report-review.ts`                 | `docs/architecture/display/speak-tool.md` |
| メインビュー    | `src/browser/components/page/conversation/components/main-view/` | `docs/architecture/display/main-view.md`  |
