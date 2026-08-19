#!/usr/bin/env bash
set -Eeuo pipefail

MIGRATION_KEY="${1:-}"
BASE_URL="${2:-https://scgl.vercel.app}"

if [[ -z "$MIGRATION_KEY" ]]; then
  echo "Missing migration key" >&2
  exit 2
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
MIGRATION_ID="legacy-${STAMP}"
WORK="/root/scgl-migration-${STAMP}"
CURRENT="$(readlink -f /opt/scgl/current 2>/dev/null || true)"

if [[ -z "$CURRENT" || ! -d "$CURRENT" ]]; then
  echo "Cannot resolve /opt/scgl/current" >&2
  exit 3
fi

mkdir -p "$WORK"
chmod 700 "$WORK"

echo "[1/6] Detecting the live database and asset directories..."
python3 - "$CURRENT" "$WORK" <<'PY'
import json, os, sqlite3, sys
from pathlib import Path

current = Path(sys.argv[1]).resolve()
work = Path(sys.argv[2])

def parse_env(path):
    values = {}
    try:
        for raw in Path(path).read_text(encoding='utf-8', errors='ignore').splitlines():
            line = raw.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            k, v = k.strip(), v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
                v = v[1:-1]
            values[k] = v
    except FileNotFoundError:
        pass
    return values

env = parse_env('/etc/scgl.env')
explicit_data = env.get('DATA_DIR')
db_url = env.get('DATABASE_URL', '')

candidates = []
def add_candidate(p):
    if not p:
        return
    p = Path(p).expanduser()
    if p not in candidates:
        candidates.append(p)

if db_url.startswith('file:'):
    raw = db_url[5:].split('?', 1)[0]
    p = Path(raw)
    if p.is_absolute():
        add_candidate(p)
    else:
        add_candidate(current / p)
        add_candidate(current / 'prisma' / p)

if explicit_data:
    d = Path(explicit_data)
    for name in ('custom.db', 'scgl.db', 'database.db', 'app.db'):
        add_candidate(d / name)
        add_candidate(d / 'db' / name)

for p in [
    current / 'data' / 'custom.db',
    current / 'prisma' / 'custom.db',
    Path('/opt/scgl/shared/data/custom.db'),
    Path('/opt/scgl/shared/custom.db'),
    Path('/var/lib/scgl/data/custom.db'),
    Path('/var/lib/scgl/custom.db'),
    Path('/srv/scgl/data/custom.db'),
    Path('/data/custom.db'),
]:
    add_candidate(p)

# A bounded fallback scan. Avoid historical releases and dependency trees.
def bounded_scan(root, max_depth=5):
    root = Path(root)
    if not root.exists():
        return
    base_depth = len(root.parts)
    skip = {'node_modules', '.next', '.git', 'skills', 'releases', 'proc', 'sys', 'dev'}
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        dp = Path(dirpath)
        depth = len(dp.parts) - base_depth
        dirnames[:] = [d for d in dirnames if d not in skip and depth < max_depth]
        for fn in filenames:
            low = fn.lower()
            if low.endswith(('.db', '.sqlite', '.sqlite3')):
                add_candidate(dp / fn)

bounded_scan(current, 5)
for root in ('/opt/scgl/shared', '/var/lib/scgl', '/srv/scgl', '/data'):
    bounded_scan(root, 5)

def inspect_db(path):
    if not path.is_file():
        return None
    try:
        con = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
        tables = {r[0] for r in con.execute("select name from sqlite_master where type='table'")}
        if 'Asset' not in tables or 'Project' not in tables:
            con.close()
            return None
        counts = {}
        for t in sorted(tables):
            if t.startswith('sqlite_'):
                continue
            try:
                counts[t] = int(con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0])
            except Exception:
                pass
        con.close()
        return {'path': str(path), 'size': path.stat().st_size, 'tables': sorted(tables), 'counts': counts}
    except Exception:
        return None

valid = [x for x in (inspect_db(p) for p in candidates) if x]
if not valid:
    raise SystemExit('Could not locate a SQLite database containing Project and Asset tables')

# Prefer an explicitly configured DB, otherwise the newest/largest valid database.
valid.sort(key=lambda x: (Path(x['path']).stat().st_mtime, x['size']), reverse=True)
db_info = valid[0]
db_path = Path(db_info['path'])

con = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
con.row_factory = sqlite3.Row
asset_rows = list(con.execute('SELECT fileName, fileSize, mimeType FROM "Asset"'))
con.close()
asset_names = [r['fileName'] for r in asset_rows]

# Find plausible data directories and score them against actual DB filenames.
data_candidates = []
def add_data_dir(p):
    if not p:
        return
    p = Path(p)
    if p not in data_candidates:
        data_candidates.append(p)

if explicit_data:
    add_data_dir(explicit_data)
add_data_dir(db_path.parent)
add_data_dir(db_path.parent / 'data')
add_data_dir(current / 'data')
for p in ('/opt/scgl/shared/data', '/opt/scgl/data', '/var/lib/scgl/data', '/srv/scgl/data', '/data'):
    add_data_dir(p)

sample = asset_names[: min(len(asset_names), 250)]
scored = []
for d in data_candidates:
    asset_dir = d / 'assets'
    if not asset_dir.is_dir():
        continue
    matches = sum(1 for name in sample if (asset_dir / name).is_file())
    total_files = 0
    total_bytes = 0
    try:
        for entry in asset_dir.iterdir():
            if entry.is_file():
                total_files += 1
                try:
                    total_bytes += entry.stat().st_size
                except OSError:
                    pass
    except OSError:
        pass
    scored.append((matches, total_files, total_bytes, d))

if not scored:
    raise SystemExit(f'Located DB at {db_path}, but could not locate its assets directory')
scored.sort(key=lambda x: (x[0], x[1], x[2]), reverse=True)
_, asset_file_count, asset_bytes, data_dir = scored[0]
asset_dir = data_dir / 'assets'
thumb_dir = data_dir / 'thumbnails'

referenced_existing = sum(1 for name in asset_names if (asset_dir / name).is_file())
missing_referenced = [name for name in asset_names if not (asset_dir / name).is_file()]
thumb_count = 0
thumb_bytes = 0
if thumb_dir.is_dir():
    for entry in thumb_dir.iterdir():
        if entry.is_file():
            thumb_count += 1
            try:
                thumb_bytes += entry.stat().st_size
            except OSError:
                pass

manifest = {
    'currentRelease': str(current),
    'database': db_info,
    'dataDir': str(data_dir),
    'assetDir': str(asset_dir),
    'thumbnailDir': str(thumb_dir),
    'databaseAssetRows': len(asset_names),
    'referencedAssetFilesPresent': referenced_existing,
    'referencedAssetFilesMissing': len(missing_referenced),
    'missingReferencedSample': missing_referenced[:30],
    'assetDirectoryFileCount': asset_file_count,
    'assetDirectoryBytes': asset_bytes,
    'thumbnailFileCount': thumb_count,
    'thumbnailBytes': thumb_bytes,
    'databaseFileBytes': db_path.stat().st_size,
}
(work / 'detected.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
(work / 'paths.env').write_text(
    'DB_PATH=' + json.dumps(str(db_path)) + '\n' +
    'DATA_DIR=' + json.dumps(str(data_dir)) + '\n' +
    'ASSET_DIR=' + json.dumps(str(asset_dir)) + '\n' +
    'THUMB_DIR=' + json.dumps(str(thumb_dir)) + '\n',
    encoding='utf-8'
)
print(json.dumps(manifest, ensure_ascii=False, indent=2))
PY

# shellcheck disable=SC1090
source "$WORK/paths.env"

echo "[2/6] Creating a consistent SQLite backup and metadata export..."
python3 - "$DB_PATH" "$WORK" <<'PY'
import json, sqlite3, sys
from pathlib import Path

db = Path(sys.argv[1])
work = Path(sys.argv[2])
backup = work / 'legacy.sqlite'

src = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
dst = sqlite3.connect(str(backup))
src.backup(dst)
dst.close()
src.close()

con = sqlite3.connect(f'file:{backup}?mode=ro', uri=True)
con.row_factory = sqlite3.Row

tables = [r[0] for r in con.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name")]
schema = []
counts = {}
for t in tables:
    row = con.execute("select sql from sqlite_master where type='table' and name=?", (t,)).fetchone()
    schema.append({'table': t, 'sql': row[0] if row else None})
    counts[t] = int(con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0])

(work / 'schema.json').write_text(json.dumps({'tables': schema, 'counts': counts}, ensure_ascii=False, indent=2), encoding='utf-8')

# Export the core asset-library data for offline inspection. Keep every column that exists.
export = {}
for t in ('Project', 'Channel', 'Asset'):
    if t in tables:
        export[t] = [dict(r) for r in con.execute(f'SELECT * FROM "{t}"')]
(work / 'metadata.json').write_text(json.dumps(export, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
con.close()
PY

# Preserve only path-oriented runtime configuration; never upload unrelated secrets.
{
  echo "# systemd service"
  systemctl cat scgl 2>/dev/null || true
  echo
  echo "# selected runtime environment"
  if [[ -f /etc/scgl.env ]]; then
    grep -E '^(DATA_DIR|DATABASE_URL|PORT|NODE_ENV|HOSTNAME)=' /etc/scgl.env || true
  fi
} > "$WORK/runtime.txt"

echo "[3/6] Packing the latest deployed source code (excluding runtime data and build/dependency caches)..."
tar -czf "$WORK/source-core.tar.gz" \
  --exclude='./node_modules' \
  --exclude='./.next' \
  --exclude='./.git' \
  --exclude='./data' \
  --exclude='./upload' \
  --exclude='./uploads' \
  --exclude='./skills/*/assets' \
  --exclude='*.db' \
  --exclude='*.sqlite' \
  --exclude='*.sqlite3' \
  -C "$CURRENT" .

python3 - "$WORK" <<'PY'
import json, sys
from pathlib import Path
work = Path(sys.argv[1])
detected = json.loads((work / 'detected.json').read_text(encoding='utf-8'))
files = {}
for name in ('legacy.sqlite', 'metadata.json', 'schema.json', 'runtime.txt', 'source-core.tar.gz'):
    p = work / name
    files[name] = p.stat().st_size if p.exists() else None
detected['snapshotFiles'] = files
(work / 'manifest.json').write_text(json.dumps(detected, ensure_ascii=False, indent=2), encoding='utf-8')
PY

echo "[4/6] Snapshot sizes:"
du -h "$WORK"/* | sort -h

TOTAL_SNAPSHOT_BYTES="$(python3 - "$WORK" <<'PY'
import sys
from pathlib import Path
work=Path(sys.argv[1])
print(sum(p.stat().st_size for p in work.iterdir() if p.is_file() and p.name not in ('paths.env','detected.json')))
PY
)"

# Keep the diagnostic snapshot well below the Hobby 1GB Blob allowance.
if (( TOTAL_SNAPSHOT_BYTES > 750 * 1024 * 1024 )); then
  echo "Diagnostic snapshot is larger than 750 MiB; refusing to upload it automatically." >&2
  echo "Snapshot remains safely at: $WORK" >&2
  exit 20
fi

presign_put() {
  local pathname="$1"
  local local_file="$2"
  local content_type="$3"
  local size payload response
  size="$(stat -c '%s' "$local_file")"
  payload="$(python3 - "$pathname" "$content_type" "$size" <<'PY'
import json, sys
print(json.dumps({
  'pathname': sys.argv[1],
  'operation': 'put',
  'contentType': sys.argv[2],
  'maximumSizeInBytes': int(sys.argv[3]) + 1024,
}, separators=(',', ':')))
PY
)"
  response="$(curl -fsS --retry 4 --retry-delay 2 \
    -X POST "$BASE_URL/api/migration/presign" \
    -H "x-scgl-migration-key: $MIGRATION_KEY" \
    -H 'content-type: application/json' \
    --data-binary "$payload")"
  python3 - "$response" <<'PY'
import json, sys
obj=json.loads(sys.argv[1])
url=obj.get('presignedUrl')
if not url:
    raise SystemExit('No presignedUrl returned: '+sys.argv[1])
print(url)
PY
}

upload_one() {
  local name="$1"
  local ctype="$2"
  local local_file="$WORK/$name"
  local pathname="migration-legacy/$MIGRATION_ID/$name"
  local url
  url="$(presign_put "$pathname" "$local_file" "$ctype")"
  curl -fsS --retry 4 --retry-delay 2 -X PUT \
    -H "Content-Type: $ctype" \
    --upload-file "$local_file" \
    "$url" >/dev/null
  echo "  uploaded $pathname"
}

echo "[5/6] Uploading the diagnostic snapshot to the private Vercel Blob store..."
upload_one 'legacy.sqlite' 'application/octet-stream'
upload_one 'metadata.json' 'application/json'
upload_one 'schema.json' 'application/json'
upload_one 'runtime.txt' 'text/plain'
upload_one 'source-core.tar.gz' 'application/gzip'
upload_one 'manifest.json' 'application/json'

echo "[6/6] Snapshot complete."
echo "MIGRATION_ID=$MIGRATION_ID"
echo "SNAPSHOT_DIR=$WORK"
echo "Do not delete this directory or the legacy server until the migration is fully verified."
