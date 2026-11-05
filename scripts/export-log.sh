#!/usr/bin/env bash
set -euo pipefail

# Validasi parameter
if [ $# -lt 2 ]; then
  echo "Penggunaan: $0 <session-id> <nama-file>"
  echo "Contoh: $0 ses_abc123 setup-monorepo"
  exit 1
fi

SESSION_ID="$1"
NAMA_FILE="$2"
NAMA_FILE="${NAMA_FILE%.json}"

DOCS_DIR="docs/agent-logs"
mkdir -p "$DOCS_DIR"
OUT_FILE="$DOCS_DIR/$NAMA_FILE.json"
TEMP_FILE="$(mktemp)"

cleanup() {
  rm -f "$TEMP_FILE"
}
trap cleanup EXIT

echo "Mengekspor session $SESSION_ID..."

# Jalankan opencode export atau opencode session export
if opencode export "$SESSION_ID" > "$TEMP_FILE" 2>/dev/null; then
  :
elif opencode session export "$SESSION_ID" > "$TEMP_FILE" 2>/dev/null; then
  :
else
  echo "Gagal: opencode export gagal untuk session $SESSION_ID" >&2
  exit 1
fi

# Tentukan interpreter Python (prioritas python, kompatibel Git Bash/WSL)
if command -v python >/dev/null 2>&1 && python -c "import sys" >/dev/null 2>&1; then
  PYTHON_CMD="python"
elif [ -n "${USERPROFILE:-}" ] && [ -f "$USERPROFILE/anaconda3/python.exe" ]; then
  PYTHON_CMD="$USERPROFILE/anaconda3/python.exe"
elif [ -f "/c/Users/${USER:-}/anaconda3/python.exe" ]; then
  PYTHON_CMD="/c/Users/${USER:-}/anaconda3/python.exe"
elif command -v python3 >/dev/null 2>&1 && python3 -c "import sys" >/dev/null 2>&1; then
  PYTHON_CMD="python3"
elif command -v py >/dev/null 2>&1 && py -c "import sys" >/dev/null 2>&1; then
  PYTHON_CMD="py"
else
  PYTHON_CMD="python"
fi

# Sensor secret dan validasi JSON
"$PYTHON_CMD" - "$TEMP_FILE" "$OUT_FILE" << 'PYEOF'
import json
import re
import sys

src_path = sys.argv[1]
dst_path = sys.argv[2]

try:
    with open(src_path, "r", encoding="utf-8") as f:
        content = f.read()
except Exception as e:
    sys.stderr.write(f"Error membaca file log sementara: {e}\n")
    sys.exit(1)

# Sensor URL PostgreSQL
content = re.sub(r'postgres(ql)?://[^\s"\'`<>]+', '[REDACTED]', content)

# Sensor Bearer tokens
content = re.sub(r'Bearer\s+[A-Za-z0-9_\-\.]+', 'Bearer [REDACTED]', content)

# Sensor kunci sk-...
content = re.sub(r'sk-[A-Za-z0-9_\-]{8,}', '[REDACTED]', content)

# Validasi JSON
try:
    parsed = json.loads(content)
except Exception as e:
    sys.stderr.write(f"Error: Format JSON hasil ekspor tidak valid: {e}\n")
    sys.exit(1)

formatted = json.dumps(parsed, indent=2, ensure_ascii=False)

# Periksa apakah masih ada pola secret umum atau API key
violations = []
if re.search(r'sk-[A-Za-z0-9_\-]{8,}', formatted):
    violations.append("Pola API key sk-... masih ditemukan.")
if re.search(r'Bearer\s+(?!\[REDACTED\])[A-Za-z0-9_\-\.]+', formatted):
    violations.append("Pola Bearer token belum tersensor.")
if re.search(r'postgres(ql)?://', formatted):
    violations.append("URL PostgreSQL belum tersensor.")

if violations:
    sys.stderr.write("Peringatan: Proses dibatalkan karena pola rahasia masih terdeteksi:\n")
    for v in violations:
        sys.stderr.write(f" - {v}\n")
    sys.exit(1)

with open(dst_path, "w", encoding="utf-8") as f:
    f.write(formatted + "\n")

print(f"Log berhasil disensor dan divalidasi: {dst_path}")
PYEOF

git add "$OUT_FILE"
git commit -m "docs: agent log $NAMA_FILE"
echo "Commit berhasil dibuat: docs: agent log $NAMA_FILE"
