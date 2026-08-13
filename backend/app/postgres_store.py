from __future__ import annotations
import base64,json
from dataclasses import dataclass
from datetime import datetime
import psycopg
from bson import Binary,ObjectId

def _enc(v):
    if isinstance(v,ObjectId): return {"$oid":str(v)}
    if isinstance(v,datetime): return {"$date":v.isoformat()}
    if isinstance(v,(bytes,bytearray,Binary)): return {"$binary":base64.b64encode(bytes(v)).decode()}
    if isinstance(v,dict): return {k:_enc(x) for k,x in v.items()}
    if isinstance(v,(list,tuple)): return [_enc(x) for x in v]
    return v
def _dec(v):
    if isinstance(v,dict):
        if set(v)=={"$oid"}: return ObjectId(v["$oid"])
        if set(v)=={"$date"}: return datetime.fromisoformat(v["$date"])
        if set(v)=={"$binary"}: return Binary(base64.b64decode(v["$binary"]))
        return {k:_dec(x) for k,x in v.items()}
    if isinstance(v,list): return [_dec(x) for x in v]
    return v
def _match(d,q):
    if not q:return True
    for k,e in q.items():
        if k=="$or":
            if not any(_match(d,x) for x in e):return False
            continue
        a=d.get(k)
        if isinstance(e,dict) and any(str(x).startswith('$') for x in e):
            for op,v in e.items():
                if op=='$in' and not (a in v or isinstance(a,list) and any(x in v for x in a)):return False
                if op=='$ne' and a==v:return False
                if op=='$exists' and ((k in d)!=bool(v)):return False
        elif isinstance(a,list):
            if e not in a:return False
        elif a!=e:return False
    return True
def _project(d,p):
    if not p:return dict(d)
    inc={k for k,v in p.items() if v}; exc={k for k,v in p.items() if not v}
    if inc:
        r={k:d[k] for k in inc if k in d}
        if p.get('_id',1) and '_id' in d:r['_id']=d['_id']
        return r
    return {k:v for k,v in d.items() if k not in exc}
class Cursor:
    def __init__(self,docs):self.docs=list(docs)
    def sort(self,key,direction):self.docs.sort(key=lambda x:(x.get(key) is None,x.get(key)),reverse=direction<0);return self
    def limit(self,n):self.docs=self.docs[:n];return self
    def __iter__(self):return iter(self.docs)
@dataclass
class InsertResult:inserted_id:object
@dataclass
class DeleteResult:deleted_count:int
@dataclass
class UpdateResult:modified_count:int;upserted_id:object=None

def ensure_schema(url):
    with psycopg.connect(url) as c:
        c.execute('CREATE TABLE IF NOT EXISTS app_documents (collection TEXT NOT NULL,id TEXT NOT NULL,data JSONB NOT NULL,PRIMARY KEY(collection,id))')
        c.execute('CREATE INDEX IF NOT EXISTS app_documents_collection_idx ON app_documents(collection)')
def check_postgres_connection(url):
    try:
        with psycopg.connect(url,connect_timeout=8) as c:c.execute('SELECT 1')
        return True
    except Exception:return False
class PostgresCollection:
    def __init__(self,name,url):self.name=name;self.url=url
    def _all(self):
        ensure_schema(self.url)
        with psycopg.connect(self.url) as c:rows=c.execute('SELECT data FROM app_documents WHERE collection=%s',(self.name,)).fetchall()
        return [_dec(x[0]) for x in rows]
    def find(self,q=None,p=None):return Cursor(_project(d,p) for d in self._all() if _match(d,q))
    def find_one(self,q=None,p=None,**kw):
        cur=self.find(q,p); s=kw.get('sort')
        if s:
            for k,d in reversed(s):cur.sort(k,d)
        return cur.docs[0] if cur.docs else None
    def _save(self,d):
        with psycopg.connect(self.url) as c:c.execute('INSERT INTO app_documents VALUES(%s,%s,%s::jsonb) ON CONFLICT(collection,id) DO UPDATE SET data=EXCLUDED.data',(self.name,str(d['_id']),json.dumps(_enc(d))))
    def insert_one(self,d):
        d=dict(d);d.setdefault('_id',ObjectId());self._save(d);return InsertResult(d['_id'])
    def update_one(self,q,u,upsert=False):
        d=next((x for x in self._all() if _match(x,q)),None);created=d is None
        if created:
            if not upsert:return UpdateResult(0)
            d={k:v for k,v in q.items() if not k.startswith('$') and not isinstance(v,dict)};d.setdefault('_id',ObjectId())
        for k,v in u.get('$set',{}).items():d[k]=v
        if created:
            for k,v in u.get('$setOnInsert',{}).items():d[k]=v
        for k,v in u.get('$pull',{}).items():d[k]=[x for x in d.get(k,[]) if x!=v]
        self._save(d);return UpdateResult(1,d['_id'] if created else None)
    def update_many(self,q,u):
        docs=[x for x in self._all() if _match(x,q)]
        for d in docs:self.update_one({'_id':d['_id']},u)
        return UpdateResult(len(docs))
    def delete_one(self,q):
        d=next((x for x in self._all() if _match(x,q)),None)
        if not d:return DeleteResult(0)
        with psycopg.connect(self.url) as c:c.execute('DELETE FROM app_documents WHERE collection=%s AND id=%s',(self.name,str(d['_id'])))
        return DeleteResult(1)
    def delete_many(self,q):
        docs=[x for x in self._all() if _match(x,q)]
        for d in docs:self.delete_one({'_id':d['_id']})
        return DeleteResult(len(docs))
    def count_documents(self,q):return sum(_match(x,q) for x in self._all())
    def create_index(self,*a,**k):return None
