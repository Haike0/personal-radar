#!/bin/sh
# Refuses to let personal data into the repo. Runs as a git pre-commit hook (scripts/install-hooks.sh) and via `npm run check:privacy`.
#  - generic patterns below (WeChat ids, API keys, private keys, home-directory paths, Tailscale hostnames)
#  - plus every line of .private-words (gitignored, never committed): names of real people, your own ids, etc.
cd "$(dirname "$0")/.." || exit 1
if [ "$1" = "--staged" ]; then
  FILES=$(git diff --cached --name-only --diff-filter=ACM)
else
  FILES=$(git ls-files 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null)
fi
FILES=$(printf '%s\n' "$FILES" | grep -v -E '^(package-lock\.json|scripts/check-privacy\.sh)$' | grep -v '^$')
[ -z "$FILES" ] && exit 0
PATTERN='wxid_[a-z0-9]{6,}|sk-[A-Za-z0-9]{20,}|BEGIN [A-Z ]*PRIVATE KEY|/Users/[A-Za-z0-9._-]+/|/home/[A-Za-z0-9._-]+/|[a-z0-9-]+\.tail[0-9a-f]+\.ts\.net|wechat-local-vault'
FOUND=0
printf '%s\n' "$FILES" | while IFS= read -r f; do [ -f "$f" ] && grep -I -n -E "$PATTERN" "$f" /dev/null; done > .privacy-hits 2>/dev/null
if [ -f .private-words ]; then
  grep -v -E '^\s*(#|$)' .private-words > .privacy-words.tmp
  if [ -s .privacy-words.tmp ]; then
    printf '%s\n' "$FILES" | while IFS= read -r f; do [ -f "$f" ] && grep -I -n -F -f .privacy-words.tmp "$f" /dev/null; done >> .privacy-hits 2>/dev/null
  fi
  rm -f .privacy-words.tmp
fi
if [ -s .privacy-hits ]; then
  echo "✗ 发现可能的隐私信息，已拒绝 / possible personal data found:"
  cut -c1-160 .privacy-hits
  FOUND=1
fi
rm -f .privacy-hits
[ $FOUND -eq 0 ] && echo "✓ privacy check passed ($(printf '%s\n' "$FILES" | wc -l | tr -d ' ') files)"
exit $FOUND
