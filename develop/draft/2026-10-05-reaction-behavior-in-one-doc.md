# 反応の吹き出しが何を出すかは display.md 4.2 だけに書き、ほかの文書は節の名前で指す（振り返り: GH-387）

- 札: 黄 文書の重さ（2回目）
- 根: reaction-behavior-restated
- 根拠: GH-387 は「反応の行の源をパックから問い合わせへ移す」1つの決定で文書7ファイル（111行の追加・111行の削除）を直した。そのうち `docs/requirements.md` 4.3（3か所）・`docs/glossary.md`（反応・迎えの挨拶・待ちの一言）・`docs/architecture/screen-design.md`（迎える口2か所と 13.13）・`characters/README.md` の4ファイルは、`docs/architecture/display.md` 4.2「機械の出来事への反応」が決める「どの出来事で何の行を出すか」を言い直した写しだった。写しが残っていても検査は落ちない
- 出し先: 正典。文書の書き方の正典に「表示物の振る舞い（何を出すか・無ければどうするか）は `docs/architecture/display.md` の該当節だけに書き、要件・用語集・画面設計・パックの README は節の名前で指す」を足し、上の4ファイルの写しを節の名前への参照に畳む。次に反応の源を変えるとき、直す文書が7ファイルから2ファイル（display.md と character-pack.md）に減る
