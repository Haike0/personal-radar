#!/bin/sh
# Installs the privacy check as a git pre-commit hook.
cd "$(git rev-parse --show-toplevel)" || exit 1
printf '#!/bin/sh\nexec sh scripts/check-privacy.sh --staged\n' > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
echo "pre-commit privacy check installed"
