#!/usr/bin/env bash
set -Eeuo pipefail

KEY="${1:-}"
BASE="${2:-https://scgl.vercel.app}"
[[ -n "$KEY" ]] || { echo 'Missing migration key' >&2; exit 2; }

STAMP="$(date +%Y%m%d-%H%M%S)"
ID="legacy-${STAMP}"
WORK="/root/scgl-migration-${STAMP}"
CURRENT="$(readlink -f /opt/scgl/current 2>/dev/null || true)"
[[ -d "$CURRENT" ]] || { echo 'Cannot resolve /opt/scgl/current' >&2; exit 3; }
mkdir -p "$WORK" && chmod 700 "$WORK"

echo '[1/5] Locating current database and storage...'
python3 - "$CURRENT" "$WORK" <<'PY'
import json, os, sqlite3, sys
from pathlib import Path
cur=Path(sys.argv[1]).resolve(); work=Path(sys.argv[2])

def envfile(p):
    out={}
    try:
        for raw in Path(p).read_text(encoding='utf-8',errors='ignore').splitlines():
            s=raw.strip()
            if not s or s.startswith('#') or '=' not in s: continue
            k,v=s.split('=',1); v=v.strip().strip('"').strip("'"); out[k.strip()]=v
    except FileNotFoundError: pass
    return out

env=envfile('/etc/scgl.env'); data_env=env.get('DATA_DIR'); dburl=env.get('DATABASE_URL','')
cands=[]
def add(p):
    if p:
        p=Path(p).expanduser()
        if p not in cands: cands.append(p)

if dburl.startswith('file:'):
    raw=dburl[5:].split('?',1)[0]; p=Path(raw)
    if p.is_absolute(): add(p)
    else:
        add(cur/p); add(cur/'prisma'/p)
if data_env:
    d=Path(data_env)
    for n in ('custom.db','scgl.db','database.db','app.db'):
        add(d/n); add(d/'db'/n)
for p in (cur/'data/custom.db',cur/'prisma/custom.db',Path('/opt/scgl/shared/data/custom.db'),Path('/opt/scgl/shared/custom.db'),Path('/var/lib/scgl/data/custom.db'),Path('/srv/scgl/data/custom.db'),Path('/data/custom.db')): add(p)

# Bounded search, no historical-release/dependency crawl.
def scan(root,depth=5):
    root=Path(root)
    if not root.exists(): return
    base=len(root.parts); skip={'node_modules','.next','.git','skills','releases','proc','sys','dev'}
    for dp,dn,fn in os.walk(root,followlinks=False):
        p=Path(dp); dep=len(p.parts)-base
        dn[:]=[d for d in dn if d not in skip and dep<depth]
        for f in fn:
            if f.lower().endswith(('.db','.sqlite','.sqlite3')): add(p/f)
scan(cur)
for r in ('/opt/scgl/shared','/var/lib/scgl','/srv/scgl','/data'): scan(r)

def dbinfo(p):
    if not p.is_file(): return None
    try:
        c=sqlite3.connect(f'file:{p}?mode=ro',uri=True)
        tabs={x[0] for x in c.execute("select name from sqlite_master where type='table'")}
        if not ({'Project','Asset'}<=tabs): c.close(); return None
        counts={}
        for t in tabs:
            if not t.startswith('sqlite_'):
                try: counts[t]=int(c.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0])
                except: pass
        c.close(); return {'path':str(p),'size':p.stat().st_size,'mtime':p.stat().st_mtime,'tables':sorted(tabs),'counts':counts}
    except: return None
valid=[x for x in (dbinfo(p) for p in cands) if x]
if not valid: raise SystemExit('Could not locate the live SQLite database')
valid.sort(key=lambda x:(x['mtime'],x['size']),reverse=True); info=valid[0]; db=Path(info['path'])

c=sqlite3.connect(f'file:{db}?mode=ro',uri=True); c.row_factory=sqlite3.Row
assets=list(c.execute('SELECT fileName,fileSize,mimeType FROM "Asset"')); c.close()
names=[r['fileName'] for r in assets]; sample=names[:250]

# Storage may be local, R2, or another object store. Record local matches if present, but never fail when absent.
data_candidates=[]
def addd(p):
    if p:
        p=Path(p)
        if p not in data_candidates: data_candidates.append(p)
if data_env: addd(data_env)
addd(db.parent); addd(db.parent/'data'); addd(cur/'data')
for p in ('/opt/scgl/shared/data','/opt/scgl/data','/var/lib/scgl/data','/srv/scgl/data','/data'): addd(p)
score=[]
for d in data_candidates:
    ad=d/'assets'
    if not ad.is_dir(): continue
    m=sum((ad/n).is_file() for n in sample)
    try: files=[x for x in ad.iterdir() if x.is_file()]
    except: files=[]
    score.append((m,len(files),sum(x.stat().st_size for x in files if x.exists()),d))
score.sort(reverse=True,key=lambda x:(x[0],x[1],x[2]))
if score:
    _,fc,fb,d=score[0]; ad=d/'assets'; td=d/'thumbnails'; present=sum((ad/n).is_file() for n in names)
    try: thumbs=[x for x in td.iterdir() if x.is_file()] if td.is_dir() else []
    except: thumbs=[]
    storage={'mode':'local','dataDir':str(d),'assetDir':str(ad),'thumbnailDir':str(td),'assetDirectoryFileCount':fc,'assetDirectoryBytes':fb,'referencedAssetFilesPresent':present,'referencedAssetFilesMissing':len(names)-present,'thumbnailFileCount':len(thumbs),'thumbnailBytes':sum(x.stat().st_size for x in thumbs if x.exists())}
else:
    storage={'mode':'no-local-match','dataDir':data_env,'assetDir':None,'thumbnailDir':None,'assetDirectoryFileCount':0,'assetDirectoryBytes':0,'referencedAssetFilesPresent':0,'referencedAssetFilesMissing':len(names),'thumbnailFileCount':0,'thumbnailBytes':0}

manifest={'currentRelease':str(cur),'database':info,'databaseAssetRows':len(names),'databaseReferencedBytes':sum(int(r['fileSize'] or 0) for r in assets),'storage':storage,'runtimeEnvKeys':sorted(env.keys())}
(work/'detected.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
(work/'paths.env').write_text('DB_PATH='+json.dumps(str(db))+'\n',encoding='utf-8')
print(json.dumps(manifest,ensure_ascii=False,indent=2))
PY

source "$WORK/paths.env"

echo '[2/5] Creating consistent DB backup and schema/metadata export...'
python3 - "$DB_PATH" "$WORK" <<'PY'
import json,sqlite3,sys
from pathlib import Path
srcp=Path(sys.argv[1]); w=Path(sys.argv[2]); out=w/'legacy.sqlite'
s=sqlite3.connect(f'file:{srcp}?mode=ro',uri=True); d=sqlite3.connect(str(out)); s.backup(d); d.close(); s.close()
c=sqlite3.connect(f'file:{out}?mode=ro',uri=True); c.row_factory=sqlite3.Row
tables=[r[0] for r in c.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name")]
schema=[]; counts={}; export={}
for t in tables:
    row=c.execute("select sql from sqlite_master where type='table' and name=?",(t,)).fetchone(); schema.append({'table':t,'sql':row[0] if row else None}); counts[t]=int(c.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0])
    if t in ('Project','Channel','Asset'): export[t]=[dict(r) for r in c.execute(f'SELECT * FROM "{t}"')]
(w/'schema.json').write_text(json.dumps({'tables':schema,'counts':counts},ensure_ascii=False,indent=2),encoding='utf-8')
(w/'metadata.json').write_text(json.dumps(export,ensure_ascii=False,separators=(',',':')),encoding='utf-8'); c.close()
PY

{
  echo '# systemd service'; systemctl cat scgl 2>/dev/null || true
  echo; echo '# selected runtime environment'
  if [[ -f /etc/scgl.env ]]; then grep -E '^(DATA_DIR|DATABASE_URL|PORT|NODE_ENV|HOSTNAME)=' /etc/scgl.env || true; fi
} > "$WORK/runtime.txt"

echo '[3/5] Packing latest source (runtime data/build caches excluded)...'
tar -czf "$WORK/source-core.tar.gz" \
  --exclude='./node_modules' --exclude='./.next' --exclude='./.git' \
  --exclude='./data' --exclude='./upload' --exclude='./uploads' \
  --exclude='./skills/*/assets' --exclude='*.db' --exclude='*.sqlite' --exclude='*.sqlite3' \
  -C "$CURRENT" .

python3 - "$WORK" <<'PY'
import json,sys
from pathlib import Path
w=Path(sys.argv[1]); m=json.loads((w/'detected.json').read_text(encoding='utf-8'))
m['snapshotFiles']={n:(w/n).stat().st_size for n in ('legacy.sqlite','metadata.json','schema.json','runtime.txt','source-core.tar.gz')}
(w/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
PY

echo '[4/5] Snapshot files:'; du -h "$WORK"/* | sort -h
TOTAL=$(python3 - "$WORK" <<'PY'
import sys
from pathlib import Path
w=Path(sys.argv[1]); print(sum(p.stat().st_size for p in w.iterdir() if p.is_file() and p.name not in ('paths.env','detected.json')))
PY
)
if (( TOTAL > 750*1024*1024 )); then echo "Snapshot >750MiB; left safely at $WORK and stopped before Blob upload." >&2; exit 20; fi

presign(){
  local path="$1" file="$2" ctype="$3" size payload resp
  size=$(stat -c '%s' "$file")
  payload=$(python3 - "$path" "$ctype" "$size" <<'PY'
import json,sys
print(json.dumps({'pathname':sys.argv[1],'operation':'put','contentType':sys.argv[2],'maximumSizeInBytes':int(sys.argv[3])+1024},separators=(',',':')))
PY
)
  resp=$(curl -fsS --retry 4 --retry-delay 2 -X POST "$BASE/api/migration/presign" -H "x-scgl-migration-key: $KEY" -H 'content-type: application/json' --data-binary "$payload")
  python3 - "$resp" <<'PY'
import json,sys
u=json.loads(sys.argv[1]).get('presignedUrl');
if not u: raise SystemExit('presign failed: '+sys.argv[1])
print(u)
PY
}
upload(){ local n="$1" t="$2" p="migration-legacy/$ID/$n" u; u=$(presign "$p" "$WORK/$n" "$t"); curl -fsS --retry 4 --retry-delay 2 -X PUT -H "Content-Type: $t" --upload-file "$WORK/$n" "$u" >/dev/null; echo "  uploaded $p"; }

echo '[5/5] Uploading private diagnostic snapshot...'
upload legacy.sqlite application/octet-stream
upload metadata.json application/json
upload schema.json application/json
upload runtime.txt text/plain
upload source-core.tar.gz application/gzip
upload manifest.json application/json
printf '{"migrationId":"%s","createdAt":"%s"}\n' "$ID" "$(date -Iseconds)" > "$WORK/latest.json"
# Stable pointer so the migration agent can discover the newest snapshot without another user step.
u=$(presign 'migration-legacy/latest.json' "$WORK/latest.json" application/json); curl -fsS --retry 4 -X PUT -H 'Content-Type: application/json' --upload-file "$WORK/latest.json" "$u" >/dev/null

echo "DONE MIGRATION_ID=$ID"
echo "Snapshot remains on legacy host: $WORK"
