# テスト

ステータス: **正典**。

責務: 対象ごとのテストの方法、E2E（走らせ方・成果物・シナリオ）、手で確かめる手順を持つ。
読む時: テストを足す・E2E を直す・目視で確かめるとき。
直す時: テストの段取り・E2E の足場・目視の手順を変えたとき。

## このファイルの読み方

節の本文は子のファイル（`docs/architecture/testing/`）にある。下の索引で節を1つ特定し、その子のファイルだけを開いて読む。

## 節の索引

この表は `pnpm run format` が子のファイルの題と見出しから書き直すので、手で直さない。

| ファイル                                                          | 題                                                           | 節                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| `docs/architecture/testing/e2e-artifact-and-expectation.md`       | テスト: E2E の成果物と期待値                                 | テスト / E2E の成果物と再現 / E2E の期待値の範囲         |
| `docs/architecture/testing/e2e-flake-free-writing.md`             | テスト: E2E の揺れを生まない書き方                           | テスト / E2E の揺れを生まない書き方                      |
| `docs/architecture/testing/e2e-run.md`                            | テスト: E2E の走らせ方                                       | テスト / E2E の走らせ方                                  |
| `docs/architecture/testing/e2e-scenario-conversation-layout.md`   | テスト: E2E のシナリオ（会話の画面の配置）                   | テスト / E2E のシナリオの一覧                            |
| `docs/architecture/testing/e2e-scenario-conversation-state.md`    | テスト: E2E のシナリオ（会話の画面の状態）                   | テスト / E2E のシナリオの一覧                            |
| `docs/architecture/testing/e2e-scenario-task-chat-and-setting.md` | テスト: E2E のシナリオ（タスク・雑談・設定）                 | テスト / E2E のシナリオの一覧                            |
| `docs/architecture/testing/e2e-scenario-turn-and-input.md`        | テスト: E2E のシナリオ（ターンと入力）                       | テスト / E2E のシナリオの一覧                            |
| `docs/architecture/testing/method-and-fixture.md`                 | テスト: 対象ごとの方法とフィクスチャ                         | テスト / フィクスチャ / E2E に任せず単体テストに残すもの |
| `docs/architecture/testing/visual-check-interaction.md`           | テスト: 手で確かめること（手を動かす状態と部品）             | 手で確かめること                                         |
| `docs/architecture/testing/visual-check-revision-and-scene.md`    | テスト: 手で確かめること（変更前との比べと場面ごとの確かめ） | 手で確かめること                                         |
| `docs/architecture/testing/visual-check.md`                       | テスト: 手で確かめること（撮り方と待ち）                     | 手で確かめること                                         |
