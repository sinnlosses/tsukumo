# deny-sed-in-place の python の書き込み判定が、作業ツリーの外（スクラッチ）への書き込みまで止めないようにする（振り返り: GH-116）

- 札: 黄 道具（5回目）
- 根拠: 2026-09-30 の `/loop /next-task` で委譲した5件（GH-127・GH-126・GH-125・GH-136・GH-116）のうち4件の friction log に「`python3` の heredoc での書き込みが `deny-sed-in-place` に止められ、Write ツールへ切り替えた」がある。GH-116 は依頼文で「書き換えは Edit / Write で」と念押ししていても、`tw edit` に渡す本文の下書き（作業ツリーの外）で止められた。念押しでは減っていない
- 出し先: `scripts/deny-sed-in-place.ts` の `PYTHON_WRITE_CALL` の判定。書き込み先が作業ツリーの外（スクラッチ・`/tmp`）と読めるときは通すか、拒否の理由の文に「本文の下書きは Write ツールで」と具体の代わりを出す。どちらにするかは検査を足す側で決め、`test/scripts/deny-sed-in-place.test.ts` で守る
