#!/bin/sh
# Commit messages are public: one short English line saying what changed. Runs as a git commit-msg hook (scripts/install-hooks.sh).
MSG="$1"
SUBJECT=$(grep -v '^#' "$MSG" | sed '/^[[:space:]]*$/d' | head -n 1)
[ -z "$SUBJECT" ] && exit 0
case "$SUBJECT" in Merge*|Revert*|fixup!*|squash!*) exit 0 ;; esac
if grep -v '^#' "$MSG" | perl -CSD -ne 'exit 1 if /[\p{Han}\p{Hiragana}\p{Katakana}\x{3000}-\x{303F}\x{FF00}-\x{FFEF}]/'; then :; else
  echo "✗ Commit message must be in English (it is public on GitHub). 提交说明请用简短英文。"
  exit 1
fi
if [ "$(printf '%s' "$SUBJECT" | wc -m | tr -d ' ')" -gt 72 ]; then
  echo "✗ First line is over 72 characters: keep it to one short line, e.g. \"Fix desktop app writing page cache into the bundle\". 第一行请控制在 72 个字符内。"
  exit 1
fi
exit 0
