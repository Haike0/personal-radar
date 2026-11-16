#!/bin/sh
# Installs the git hooks: the privacy check (pre-commit) and the short-English commit message check (commit-msg).
cd "$(git rev-parse --show-toplevel)" || exit 1
printf '#!/bin/sh\nexec sh scripts/check-privacy.sh --staged\n' > .git/hooks/pre-commit
printf '#!/bin/sh\nexec sh scripts/check-commit-msg.sh "$1"\n' > .git/hooks/commit-msg
chmod +x .git/hooks/pre-commit .git/hooks/commit-msg
echo "git hooks installed: pre-commit privacy check, commit-msg check"
