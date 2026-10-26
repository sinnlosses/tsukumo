# docs の索引

通読せず、下の表から知りたいことを1つ特定して、その文書の節だけを読む。

| こういうとき                                                                                    | 読むもの                                                                      | 防ぐ失敗               |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------- |
| 要件・やらないこと・技術制約・未決事項を知りたい                                                | `docs/requirements.md`                                                        | 本文と差分のずれ       |
| 3層・共有層・部品・置き場所を決める                                                             | `docs/architecture.md`（置き場所は「全体構成」）                              | 同じファイルの直し直し |
| 色・書体・レイアウト                                                                            | `docs/architecture/screen-design.md`                                          | 受け入れでの直し       |
| セリフとレポートの分離・レポートの記法・各表示物の仕様                                          | `docs/architecture/display.md`                                                | 受け入れでの直し       |
| ワークフローの契約（`work_plan`・`report` の口、Beads の欄）・独自のワークフローを当てる        | `docs/architecture/workflow-contract.md`                                      | 本文と差分のずれ       |
| 雑談モード                                                                                      | `docs/architecture/chat-mode.md`                                              | 本文と差分のずれ       |
| なぜ今の形なのか                                                                                | `docs/architecture.md`「設計判断」（各判断の本文は `docs/architecture/adr/`） | 同じファイルの直し直し |
| ブラウザ側の状態・Markdown・立ち絵の動き・CSS・`components/ui/` の部品の作法                    | `docs/architecture/browser.md`                                                | 同じファイルの直し直し |
| キャラクターパックの形・探索順・画面から書くときの境界                                          | `docs/architecture/character-pack.md`                                         | 本文と差分のずれ       |
| テストの方法・E2E・目視の手順                                                                   | `docs/architecture/testing.md`                                                | 検証の打ち直し         |
| 組み立て・開発サーバ・足す依存                                                                  | `docs/architecture/build.md`                                                  | ツールのエラー         |
| 規約の理由と例外（`Date` を使わない・層の辺など lint とテストが守るものも）                     | `docs/coding-standards.md`                                                    | 受け入れでの直し       |
| 用語と識別子                                                                                    | `docs/glossary.md`                                                            | 付いてきた文書の変更   |
| タスクを書く・受け入れる・作業ツリーを並行させる・tsukumo を起こす                              | `docs/workflow.md`                                                            | 段の所要時間           |
| コマンドの全体・環境変数・構成                                                                  | `README.md`                                                                   | ツールのエラー         |
| スキル（`~/.claude/skills/`。共通なのでこのリポジトリの事情はここと `docs/workflow.md` が補う） | 毎セッションのスキル案内                                                      | 本文と差分のずれ       |
| シェルでの書き換え・`git add -A` などを拒まれた                                                 | hook（`tw commit-guard`）の文面に従う。`docs/workflow.md`                     | hook の拒否            |
| 過去の判断の経緯（通読しない。`grep` で節を当てる）                                             | `docs/history/decision.md` / `tw show <ID>`                                   | 同じファイルの直し直し |

機械が検査している規則（lint・`test/architecture/`・hook）はこの表に載せず、規約の理由と例外の行から `docs/coding-standards.md` を引く。
