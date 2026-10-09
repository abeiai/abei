"""Offline media-only repair plans; no source or network connection."""
import copy
import datetime as dt
from urllib.parse import urlparse
from psycopg import sql
from psycopg.types.json import Jsonb


def db_time(value):
    if isinstance(value,str):value=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
    if not isinstance(value,dt.datetime):raise ValueError('Authoritative book time required')
    if value.tzinfo:value=value.astimezone(dt.timezone.utc).replace(tzinfo=None)
    return value.replace(microsecond=0)+dt.timedelta(milliseconds=(value.microsecond+500)//1000)


def plan_book_repair(source,current,public):
    if source['id']!=current['id'] or source['userId']!=current['userId'] or current['version']!=0 or db_time(source['updatedAt'])!=db_time(current['updatedAt']):raise ValueError('Book owner, version or source time changed')
    before=current['pages'];wanted=source['pages']
    if not isinstance(before,list) or len(before)!=len(wanted):raise ValueError('Book page inventory changed')
    merged=copy.deepcopy(before);counts={'imageUrl':0,'audioUrl':0}
    parsed=urlparse(public)
    if parsed.scheme!='https' or not parsed.hostname or parsed.query or parsed.fragment or parsed.username or parsed.password:raise ValueError('Explicit HTTPS R2 domain required')
    prefix=public.rstrip('/')+'/picture-books/legacy-sync/abeiai-v1/'
    for old,new,out in zip(before,wanted,merged):
        if {k:v for k,v in old.items() if k not in counts}!={k:v for k,v in new.items() if k not in counts}:raise ValueError('Book text or page position changed')
        for field in counts:
            value=new.get(field)
            if value and (not value.startswith(prefix) or urlparse(value).hostname!=parsed.hostname or urlparse(value).query or urlparse(value).fragment):raise ValueError('Unapproved migrated media URL')
            if not old.get(field) and value:out[field]=value;counts[field]+=1
    status=current['status']
    if status=='EDITING' and source['status']=='COMPLETED' and all(p.get('imageUrl') and p.get('caption') for p in merged):status='COMPLETED'
    return {'id':current['id'],'userId':current['userId'],'version':0,'updatedAt':db_time(current['updatedAt']),'oldPages':copy.deepcopy(before),'oldStatus':current['status'],'newPages':merged,'newStatus':status,'addedImages':counts['imageUrl'],'addedAudio':counts['audioUrl']}


def repair_sql(plans,database='abei'):
    if database not in {'abei','abei_wechat_test'} or not plans or len({p['id'] for p in plans})!=len(plans):raise ValueError('Explicit distinct abei book repair required')
    columns=('id','userId','version','updatedAt','oldPages','oldStatus','newPages','newStatus','addedImages','addedAudio')
    tuples=[]
    for plan in plans:
        if plan['version']!=0:raise ValueError('Edited book repair forbidden')
        tuples.append(sql.SQL('({})').format(sql.SQL(',').join(sql.Literal(Jsonb(plan[k]) if k in {'oldPages','newPages'} else plan[k]) for k in columns)))
    values=sql.SQL(',\n').join(tuples).as_string()
    # Source JSON appears outside the fixed dollar-quoted blocks.
    return '''BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $repair$ BEGIN
  IF current_database() <> '''+sql.Literal(database).as_string()+''' THEN RAISE EXCEPTION 'Wrong book repair database'; END IF;
  IF NOT pg_try_advisory_xact_lock(626234801) THEN RAISE EXCEPTION 'Another importer is active'; END IF;
END $repair$;
CREATE TEMP TABLE legacy_book_asset_repair (
  id text PRIMARY KEY, owner_id text, expected_version integer, expected_time timestamp(3),
  old_pages jsonb, old_status text, new_pages jsonb, new_status text, added_images integer, added_audio integer
) ON COMMIT DROP;
INSERT INTO legacy_book_asset_repair VALUES '''+values+''';
DO $repair$ BEGIN
  IF EXISTS (
    SELECT 1 FROM legacy_book_asset_repair p LEFT JOIN picture_books b ON b.id=p.id
    WHERE b.id IS NULL OR b."userId"<>p.owner_id OR b.version<>p.expected_version OR b."updatedAt"<>p.expected_time
      OR NOT ((b.pages=p.old_pages AND b.status::text=p.old_status) OR (b.pages=p.new_pages AND b.status::text=p.new_status))
  ) THEN RAISE EXCEPTION 'Book repair snapshot conflict'; END IF;
END $repair$;
CREATE TEMP TABLE legacy_book_asset_changed ON COMMIT DROP AS
WITH changed AS (
  UPDATE picture_books b SET pages=p.new_pages,status=p.new_status
  FROM legacy_book_asset_repair p WHERE b.id=p.id AND b."userId"=p.owner_id AND b.version=p.expected_version
    AND b."updatedAt"=p.expected_time AND b.pages=p.old_pages AND b.status::text=p.old_status
    AND (b.pages<>p.new_pages OR b.status::text<>p.new_status)
  RETURNING b.id
) SELECT * FROM changed;
DO $repair$ BEGIN
  IF EXISTS (SELECT 1 FROM legacy_book_asset_repair p LEFT JOIN picture_books b ON b.id=p.id
    WHERE b.id IS NULL OR b."userId"<>p.owner_id OR b.version<>p.expected_version OR b."updatedAt"<>p.expected_time
      OR b.pages<>p.new_pages OR b.status::text<>p.new_status
  ) THEN RAISE EXCEPTION 'Book repair reconciliation failed'; END IF;
END $repair$;
SELECT json_build_object('plannedBooks',(SELECT COUNT(*) FROM legacy_book_asset_repair),
  'updatedBooks',(SELECT COUNT(*) FROM legacy_book_asset_changed),
  'addedImageLinks',(SELECT COALESCE(SUM(p.added_images),0) FROM legacy_book_asset_repair p JOIN legacy_book_asset_changed c ON c.id=p.id),
  'addedAudioLinks',(SELECT COALESCE(SUM(p.added_audio),0) FROM legacy_book_asset_repair p JOIN legacy_book_asset_changed c ON c.id=p.id));
COMMIT;
'''
