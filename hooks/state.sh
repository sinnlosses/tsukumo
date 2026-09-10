#!/bin/sh
# Claude Code の hook から呼ばれ、状態ファイル（表情の元になるイベント種別と実行中のモデル）を
# 書く。SessionStart のときだけ、追加で transcript_path と cwd を既知の場所へ書き出す
# （docs/architecture.md「追従先は自前でスラッグ化せず、hookが書いたパスを読む」）。
# cwd も書くのは、サイドカーが**自分と同じディレクトリで始まったセッションだけ**に乗り換える
# ためで、これが無いと別のリポジトリで claude を起動した瞬間にビューがそちらへ移る。
#
# 書く場所は src/index.ts の TSUKUMO_DIR_NAME / STATE_FILE_NAME / TRANSCRIPT_TARGETS_DIR_NAME と
# 一致させること（変えるときは両方を直す）: ~/.tsukumo/state.json と
# ~/.tsukumo/targets/<cwd のスラッグ>。
#
# hook の stdout はエスケープされてテキスト扱いになるため描画には使えない
# （docs/requirements.md「3. 技術制約」）。ここでの仕事はファイルに書くところまでにする
# （docs/architecture.md「hookは状態ファイルを書くだけにする」）。
#
# PreToolUse は毎回のツール実行で発火する。Bun を起動すると数十msかかるので、この hook は
# 全イベント共通で Bun を起動しない sh のみで完結させる（他のイベントも同じスクリプトに
# 統一しているのは、状態のマージ処理を2つの言語で二重に持たないため）。JSON のパースは
# jq を使わず sed の範囲で済ませ、実行時の外部コマンド依存を増やさない。値にエスケープされた
# `"` が含まれると途中で切れる簡易実装だが、hook の payload に載る値（イベント名・モデル名・
# パス）はふつうその形を取らないので割り切っている。
#
# 複数の Claude セッションが同時に走っていても、状態ファイルは単一の既知の場所を共有する。
# 最後に書き込んだセッションの状態で上書きされ、セッションごとの分離はしない
# （PoC としての割り切り。区別したくなったらセッションIDをファイル名に足す）。
# **追従先だけはセッションの cwd ごとに別ファイルへ書く。** 1つのファイルを共有していた頃は、
# 別のリポジトリで claude を起動しただけで上書きされ、元のディレクトリのサイドカーが起動すら
# できなくなった（2026-09-11 に実際に踏んだ）。ファイル名は cwd の `/` を `-` に置き換えただけの
# もので、**読む側はファイル名を信用せず中身の cwd で判定する**（src/transcript-target.ts）。
#
# hook の出力（stdout）は最初に一度だけ `{}` を書く。以降は何が起きても標準出力に触らない
# ことで、途中で失敗しても常に妥当な hook 出力を返す（この後の処理は落ちても常駐プロセス側の
# 「その回の描画だけ諦める」に相当する: hook 側も1回分の失敗で Claude Code 本体を止めない）。

printf '{}\n'

[ -n "${HOME:-}" ] || exit 0

STATE_DIR="${HOME}/.tsukumo"
STATE_FILE="${STATE_DIR}/state.json"
TRANSCRIPT_TARGETS_DIR="${STATE_DIR}/targets"

payload=$(cat) || exit 0
[ -n "$payload" ] || exit 0

extract_field() {
  # $1: JSON上のキー名。$2: 検索対象の文字列。"key":"value" 形式の value を1つ返す。
  printf '%s\n' "$2" | sed -n 's/.*"'"$1"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' 2>/dev/null | head -n 1
}

json_safe_abs_path() {
  # $1: 検査する値。絶対パスで、`"` と `\` を含まないものだけをそのまま返す。それ以外は
  # 何も返さず 1 で終わる（JSON をエスケープ無しで組み立てるので、壊す値は書かない）。
  case "$1" in
    /*) ;;
    *) return 1 ;;
  esac
  case "$1" in
    *[\"\\]*) return 1 ;;
  esac
  printf '%s' "$1"
}

event=$(extract_field hook_event_name "$payload")
[ -n "$event" ] || exit 0

# 抽出は sed の貪欲一致なので、payload 本文にたまたま `"hook_event_name":"..."` という
# 文字列が含まれると、そちらを拾ってしまう。UserPromptSubmit の payload にはユーザーの入力
# そのものが載るため、それを状態ファイルへ書いてしまう経路になる
# （docs/coding-standards.md「会話内容の扱い」）。登録しているイベント名だけを通すことで、
# 会話の断片が状態ファイルに入らないようにする。未知のイベントは書かずに終わる
# （サイドカー側は状態ファイルが更新されなければ前の表情のままで、落ちはしない）。
case "$event" in
  SessionStart|UserPromptSubmit|PreToolUse|PostToolUse|PostToolUseFailure|Stop|StopFailure) ;;
  *) exit 0 ;;
esac

if [ "$event" = "SessionStart" ]; then
  # model は SessionStart の payload にしか乗らない（実測: 他イベントのスキーマに無い）。
  model=$(extract_field model "$payload")
else
  # 他のイベントには model が無いので、前回 SessionStart が書いた値を引き継ぐ。今回の payload
  # から探すと、tool_input 等の自由記述にたまたま `"model":` が含まれたときに誤抽出しうるため
  # 探さない。
  model=""
  if [ -f "$STATE_FILE" ]; then
    model=$(extract_field model "$(cat "$STATE_FILE" 2>/dev/null)")
  fi
fi

[ -d "$STATE_DIR" ] || mkdir -p "$STATE_DIR" 2>/dev/null || exit 0

# 同一ディレクトリに一時ファイルを書いてから rename する。サイドカーが読むタイミングと
# 書き込みが重なっても、書きかけの内容を見せない（rename は原子的）。$$ を挟むのは、
# 複数セッションの hook が同時に走ったときに一時ファイル名が衝突しないようにするため。
state_tmp="${STATE_FILE}.tmp.$$"
if [ -n "$model" ]; then
  printf '{"event":"%s","model":"%s"}\n' "$event" "$model" >"$state_tmp" 2>/dev/null
else
  printf '{"event":"%s"}\n' "$event" >"$state_tmp" 2>/dev/null
fi
mv "$state_tmp" "$STATE_FILE" 2>/dev/null || rm -f "$state_tmp" 2>/dev/null

if [ "$event" = "SessionStart" ]; then
  transcript_path=$(json_safe_abs_path "$(extract_field transcript_path "$payload")") || transcript_path=""
  session_cwd=$(json_safe_abs_path "$(extract_field cwd "$payload")") || session_cwd=""
  if [ -n "$transcript_path" ] && [ -n "$session_cwd" ]; then
    # ファイル名は cwd の `/` を `-` に置き換えただけ。衝突するのは同じディレクトリの
    # セッション同士だけで、その場合は新しいほうで上書きされてよい。
    slug=$(printf '%s' "$session_cwd" | tr '/' '-')
    target_file="${TRANSCRIPT_TARGETS_DIR}/${slug}"
    [ -d "$TRANSCRIPT_TARGETS_DIR" ] || mkdir -p "$TRANSCRIPT_TARGETS_DIR" 2>/dev/null || exit 0
    target_tmp="${target_file}.tmp.$$"
    printf '{"transcriptPath":"%s","cwd":"%s"}\n' "$transcript_path" "$session_cwd" >"$target_tmp" 2>/dev/null
    mv "$target_tmp" "$target_file" 2>/dev/null || rm -f "$target_tmp" 2>/dev/null
  fi
fi

exit 0
