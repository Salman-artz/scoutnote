#!/usr/bin/env bash
set -euo pipefail

echo "=== ScoutNote Environment Check ==="

echo "--- Versi Tooling ---"

# Node.js
if command -v node >/dev/null 2>&1; then
  echo "Node.js  : $(node -v)"
else
  echo "Node.js  : tidak ditemukan"
fi

# npm
if command -v npm >/dev/null 2>&1; then
  echo "npm      : v$(npm -v)"
else
  echo "npm      : tidak ditemukan"
fi

# Git
if command -v git >/dev/null 2>&1; then
  echo "Git      : $(git --version)"
else
  echo "Git      : tidak ditemukan"
fi

# Docker (jika ada)
if command -v docker >/dev/null 2>&1; then
  echo "Docker   : $(docker --version)"
else
  echo "Docker   : tidak ditemukan"
fi

# Python
PY_BIN=""
if command -v python >/dev/null 2>&1 && python -c "import sys" >/dev/null 2>&1; then
  PY_BIN="python"
elif [ -n "${USERPROFILE:-}" ] && [ -f "$USERPROFILE/anaconda3/python.exe" ]; then
  PY_BIN="$USERPROFILE/anaconda3/python.exe"
elif [ -f "/c/Users/${USER:-}/anaconda3/python.exe" ]; then
  PY_BIN="/c/Users/${USER:-}/anaconda3/python.exe"
elif command -v python3 >/dev/null 2>&1 && python3 -c "import sys" >/dev/null 2>&1; then
  PY_BIN="python3"
elif command -v py >/dev/null 2>&1 && py -c "import sys" >/dev/null 2>&1; then
  PY_BIN="py"
fi

if [ -n "$PY_BIN" ]; then
  echo "Python   : $("$PY_BIN" --version 2>&1)"
else
  echo "Python   : tidak ditemukan"
fi

# OpenCode
if command -v opencode >/dev/null 2>&1; then
  echo "OpenCode : $(opencode --version 2>&1)"
else
  echo "OpenCode : tidak ditemukan"
fi

echo ""
echo "--- Status .env ---"
if [ ! -f ".env" ]; then
  echo "Status .env: File .env tidak ditemukan."
  if [ -f ".env.example" ]; then
    echo "Variabel yang dibutuhkan (dari .env.example):"
    grep -E '^[A-Za-z0-9_]+=' .env.example | cut -d= -f1 | while read -r var_name; do
      echo "  - $var_name"
    done
  fi
else
  echo "Status .env: File .env ditemukan."
  empty_vars=()
  while IFS= read -r line || [ -n "$line" ]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      var_name="${BASH_REMATCH[1]}"
      var_val="${BASH_REMATCH[2]}"
      trimmed_val="$(echo "$var_val" | sed -e 's/^[[:space:]"'\''"]*//' -e 's/[[:space:]"'\''"]*$//')"
      if [ -z "$trimmed_val" ]; then
        empty_vars+=("$var_name")
      fi
    fi
  done < ".env"

  missing_vars=()
  if [ -f ".env.example" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      [[ "$line" =~ ^[[:space:]]*# ]] && continue
      [[ "$line" =~ ^[[:space:]]*$ ]] && continue
      if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)= ]]; then
        req_var="${BASH_REMATCH[1]}"
        if ! grep -E "^[[:space:]]*$req_var=" .env >/dev/null 2>&1; then
          missing_vars+=("$req_var")
        fi
      fi
    done < ".env.example"
  fi

  if [ ${#empty_vars[@]} -eq 0 ] && [ ${#missing_vars[@]} -eq 0 ]; then
    echo "Semua variabel telah terisi."
  else
    if [ ${#empty_vars[@]} -gt 0 ]; then
      echo "Variabel dengan nilai kosong:"
      for v in "${empty_vars[@]}"; do
        echo "  - $v"
      done
    fi
    if [ ${#missing_vars[@]} -gt 0 ]; then
      echo "Variabel belum didefinisikan (dari .env.example):"
      for v in "${missing_vars[@]}"; do
        echo "  - $v"
      done
    fi
  fi
fi
