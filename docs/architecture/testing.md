# テスト

ステータス: **正典**。

責務: 対象ごとのテストの方法、E2E（走らせ方・成果物・シナリオ）、手で確かめる手順を持つ。
読む時: テストを足す・E2E を直す・目視で確かめるとき。
直す時: テストの段取り・E2E の足場・目視の手順を変えたとき。

## このファイルの読み方

節の本文は子のファイル（`docs/architecture/testing/`）にある。下の目次で子を1つ特定し、その子のファイルを丸ごと読む。

## 目次

この表は `pnpm run format` が子のファイルの責務の行から書き直すので、手で直さない。

| ファイル                                                          | 説明                                                                                                                                                                                           |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/architecture/testing/check-stage-priority.md`               | `pnpm run check` の段の子を効率コアへ寄せる方式（`taskpolicy -c utility`）と、その選んだ根拠の測定。                                                                                           |
| `docs/architecture/testing/e2e-artifact-and-expectation.md`       | E2E が判定に使う2つの成果物（DOM の構造・WebSocket のメッセージの列）の形、時計の固定、期待値の置き場所と比べ方、写す部分木の範囲、比べる成果物の選び方。                                      |
| `docs/architecture/testing/e2e-flake-free-writing.md`             | 過去の揺れと「揺れずに間違った期待値」から取り出した、E2E を書くときの10の条。                                                                                                                 |
| `docs/architecture/testing/e2e-run.md`                            | E2E のランナーとブラウザ、置き場所、`pnpm run check` の段と選び方、起こし方と後始末、場面の流し方、負荷の抑え方。                                                                              |
| `docs/architecture/testing/e2e-scenario-conversation-layout.md`   | E2E のシナリオの一覧のうち、お伺い・進み具合の帯・バックグラウンドタスク・委譲中の脇の話・会話の画面の段と局面のシナリオの行。                                                                 |
| `docs/architecture/testing/e2e-scenario-conversation-state.md`    | E2E のシナリオの一覧のうち、押す的と字・始め方の一覧・失敗の塊・会話が終わったあとの入力欄・読み上げとフォーカス・トークンの画面の見直し・タスクの作業のレポートの結論部のシナリオの行。       |
| `docs/architecture/testing/e2e-scenario-task-chat-and-setting.md` | E2E のシナリオの一覧のうち、タスクの一覧とモーダル・雑談・覚えていること・セッションの切り替え・操作子・歯車の設定・途中のちらつきのシナリオの行と、まだ無いシナリオ。                         |
| `docs/architecture/testing/e2e-scenario-turn-and-input.md`        | E2E のシナリオの一覧の前置き（1本目と2本目の条件・表の読み方）と、ターン・入力欄・吹き出し・反応・レポート・狭い画面のシナリオの行。                                                           |
| `docs/architecture/testing/harness-replay.md`                     | ハーネス（CLAUDE.md・rules・スキル・hook・モデルの割り当て）を変えたとき前後を比べる、凍結したタスク10件の置き場・形・選び方・会話の実物を入れない規則と、タスクの再試の走らせ方・費用を持つ。 |
| `docs/architecture/testing/method-and-fixture.md`                 | 対象ごとのテストの方法と置き場所、E2E と単体と目視の分担、フィクスチャの作法、E2E に任せず単体テストに残すもの。                                                                               |
| `docs/architecture/testing/visual-check-interaction.md`           | 手で確かめることの中ほど。                                                                                                                                                                     |
| `docs/architecture/testing/visual-check-revision-and-scene.md`    | 手で確かめることの後半。                                                                                                                                                                       |
| `docs/architecture/testing/visual-check.md`                       | 手で確かめることの前半。                                                                                                                                                                       |
