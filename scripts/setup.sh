#!/usr/bin/env bash
# Prep — set up a clean Mac, build the app and install it into /Applications.
#
#   ./scripts/setup.sh            interactive: asks before installing Homebrew or Node
#   ./scripts/setup.sh --yes      non-interactive: installs whatever is missing
#   ./scripts/setup.sh --no-install   build only; leave /Applications alone
#   ./scripts/setup.sh --open     launch Prep when done
#
# Idempotent: every step checks before it acts, so re-running is safe.
set -euo pipefail

YES=0
INSTALL=1
OPEN=0
for arg in "$@"; do
  case "$arg" in
    --yes | -y) YES=1 ;;
    --no-install) INSTALL=0 ;;
    --open) OPEN=1 ;;
    -h | --help)
      sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown option: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_MIN_MAJOR=22
NODE_MIN_MINOR=12
MACOS_MIN_MAJOR=13 # Electron 44 runs on macOS 13 Ventura or newer

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
ok() { printf '    ok   %s\n' "$*"; }
note() { printf '    note %s\n' "$*"; }
fail() {
  printf '\n\033[31merror:\033[0m %s\n' "$*" >&2
  exit 1
}
confirm() {
  # confirm "question" — true when --yes was given or the user answers y
  if [ "$YES" = 1 ]; then return 0; fi
  if [ ! -t 0 ]; then
    fail "$1 — re-run with --yes to allow this in a non-interactive shell"
  fi
  read -r -p "    $1 [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

# ---------------------------------------------------------------------------
step "Checking the machine"
[ "$(uname -s)" = "Darwin" ] || fail "Prep is a Mac app; this script only runs on macOS."
macos="$(sw_vers -productVersion)"
if [ "${macos%%.*}" -lt "$MACOS_MIN_MAJOR" ]; then
  fail "macOS $macos found; Electron 44 needs macOS $MACOS_MIN_MAJOR or newer."
fi
ok "macOS $macos ($(uname -m))"

# Xcode Command Line Tools: provide git, and Homebrew needs them.
if ! xcode-select -p >/dev/null 2>&1; then
  note "Xcode Command Line Tools are missing. Requesting the install (a system dialog opens)…"
  xcode-select --install 2>/dev/null || true
  fail "Finish the Command Line Tools install in the dialog, then re-run this script."
fi
ok "Xcode Command Line Tools at $(xcode-select -p)"

# ---------------------------------------------------------------------------
step "Homebrew"
# Homebrew is only used to install Node when it is missing or too old.
brew_shellenv() {
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [ -x "$b" ]; then
      eval "$("$b" shellenv)"
      return 0
    fi
  done
  return 1
}
if ! command -v brew >/dev/null 2>&1; then brew_shellenv || true; fi
if command -v brew >/dev/null 2>&1; then
  ok "$(brew --version | head -1)"
else
  note "Homebrew is not installed. It is only needed to install Node."
  note 'Installer: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  if confirm "Install Homebrew now?"; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    brew_shellenv || fail "Homebrew installed but not found on PATH; open a new terminal and re-run."
    ok "$(brew --version | head -1)"
  else
    note "Skipping Homebrew. Node must then already be installed (>= $NODE_MIN_MAJOR.$NODE_MIN_MINOR)."
  fi
fi

# ---------------------------------------------------------------------------
step "Node.js (>= $NODE_MIN_MAJOR.$NODE_MIN_MINOR)"
node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local v major minor
  v="$(node --version)"
  v="${v#v}"
  major="${v%%.*}"
  minor="${v#*.}"
  minor="${minor%%.*}"
  [ "$major" -gt "$NODE_MIN_MAJOR" ] || { [ "$major" -eq "$NODE_MIN_MAJOR" ] && [ "$minor" -ge "$NODE_MIN_MINOR" ]; }
}
if node_ok; then
  ok "node $(node --version), npm $(npm --version)"
else
  if command -v node >/dev/null 2>&1; then
    note "node $(node --version) is too old."
  else
    note "node is not installed."
  fi
  command -v brew >/dev/null 2>&1 || fail "Install Node >= $NODE_MIN_MAJOR.$NODE_MIN_MINOR (https://nodejs.org) and re-run."
  if confirm "Install Node with Homebrew (brew install node)?"; then
    brew install node
    brew_shellenv || true
    node_ok || fail "Node installed but 'node' on PATH is still $(node --version 2>/dev/null || echo missing); open a new terminal and re-run."
    ok "node $(node --version), npm $(npm --version)"
  else
    fail "Node >= $NODE_MIN_MAJOR.$NODE_MIN_MINOR is required."
  fi
fi

# ---------------------------------------------------------------------------
step "Dependencies (npm ci — downloads Electron and Pyodide, ~200 MB on first run)"
cd "$ROOT"
npm ci
ok "node_modules ready"

# ---------------------------------------------------------------------------
step "Building Prep.app"
npm run package
APP="$ROOT/out/Prep-darwin-$(node -p process.arch)/Prep.app"
[ -d "$APP" ] || fail "packaging finished but $APP is missing"
ok "$APP"

# ---------------------------------------------------------------------------
if [ "$INSTALL" = 1 ]; then
  step "Installing into /Applications"
  npm run install-app
  ok "/Applications/Prep.app"
fi

# ---------------------------------------------------------------------------
step "Assistant (optional)"
if command -v agy >/dev/null 2>&1 || [ -x "$HOME/.local/bin/agy" ]; then
  ok "agy CLI found — the ⌘J assistant will work"
else
  note "agy CLI not found. Everything works except the ⌘J assistant; see README › The assistant."
fi

# ---------------------------------------------------------------------------
printf '\n\033[1mDone.\033[0m\n'
if [ "$INSTALL" = 1 ]; then
  echo "  Launch:   open -a Prep        (or Spotlight / Launchpad → Prep)"
  echo "  Data:     ~/Library/Application Support/Prep"
  echo "  Rebuild:  ./scripts/setup.sh   (quit Prep first; re-running replaces the installed app)"
  if [ "$OPEN" = 1 ]; then open -a Prep; fi
else
  echo "  Run it:   open \"$APP\""
  echo "  Install:  npm run install-app"
fi
