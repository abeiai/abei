"""Ratio-only repair of untouched imported books."""
import re
import base64
import hashlib
import json
from psycopg import sql
from .book_asset_repair import db_time

REPAIR_RATIOS=frozenset(('5:4','4:5'))
PUBLICATION_FIELDS=('approvedSnapshot','currentSnapshot','approvedHash','currentHash')


def course_snapshot_hash(snapshot):
    def stable(value):
        if isinstance(value,dict):return '{'+','.join(json.dumps(k,ensure_ascii=False)+':'+stable(value[k]) for k in sorted(value,key=lambda k:k.encode('utf-16-be')))+'}'
        if isinstance(value,list):return '['+','.join(map(stable,value))+']'
        if isinstance(value,float):raise ValueError('Unexpected fractional snapshot value')
        return json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False)
    return hashlib.sha256(stable(snapshot).encode()).hexdigest()


def plan_publication_ratio_repair(publication,book_plan,current_snapshot):
    old=publication.get('currentSnapshot');digest=course_snapshot_hash(old)
    if (publication.get('pictureBookId')!=book_plan['id'] or publication.get('materialType')!='PICTURE_BOOK'
        or publication.get('status')!='APPROVED' or not isinstance(old,dict) or old.get('type')!='PICTURE_BOOK'
        or old.get('aspectRatio')!='1:1' or old!=current_snapshot or old!=publication.get('approvedSnapshot')
        or publication.get('currentHash')!=digest or publication.get('approvedHash')!=digest
        or book_plan['newRatio'] not in REPAIR_RATIOS):raise ValueError('Published book snapshot differs from the original live book')
    new={**old,'aspectRatio':book_plan['newRatio']}
    return {'id':publication['id'],'bookId':book_plan['id'],'expectedOther':{k:v for k,v in publication.items() if k not in PUBLICATION_FIELDS},'oldSnapshot':old,'newSnapshot':new,'oldHash':digest,'newHash':course_snapshot_hash(new)}


def publication_sql(books,publications):
    targets={p['id']:p['newRatio'] for p in books}
    if len({p['id'] for p in publications})!=len(publications):raise ValueError('Duplicate publication plan')
    for p in publications:
        if (p['bookId'] not in targets or p['newSnapshot']!={**p['oldSnapshot'],'aspectRatio':targets[p['bookId']]}
            or p['oldHash']!=course_snapshot_hash(p['oldSnapshot']) or p['newHash']!=course_snapshot_hash(p['newSnapshot'])
            or p['expectedOther'].get('pictureBookId')!=p['bookId'] or p['expectedOther'].get('id')!=p['id']
            or p['expectedOther'].get('status')!='APPROVED'):raise ValueError('Invalid publication ratio plan')
    encoded=base64.b64encode(json.dumps(publications,ensure_ascii=False,separators=(',',':')).encode()).decode()
    prepare="""SET LOCAL lock_timeout='5s';
LOCK TABLE course_material_publications,course_review_requests,picture_book_submissions IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE legacy_ratio_publications ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset(convert_from(decode('"""+encoded+"""','base64'),'UTF8')::jsonb)
 AS s(id text,\"bookId\" text,\"expectedOther\" jsonb,\"oldSnapshot\" jsonb,\"newSnapshot\" jsonb,\"oldHash\" text,\"newHash\" text);
CREATE UNIQUE INDEX ON legacy_ratio_publications(id);
DO $repair$ BEGIN
 IF EXISTS (SELECT 1 FROM course_material_publications p JOIN legacy_book_ratio_repair b ON b.id=p.\"pictureBookId\"
   LEFT JOIN legacy_ratio_publications s ON s.id=p.id AND s.\"bookId\"=b.id WHERE s.id IS NULL)
  OR EXISTS (SELECT 1 FROM picture_book_submissions p JOIN legacy_book_ratio_repair b ON b.id=p.\"pictureBookId\")
 THEN RAISE EXCEPTION 'Unplanned published book copy'; END IF;
 IF EXISTS (SELECT 1 FROM legacy_ratio_publications s LEFT JOIN course_material_publications p ON p.id=s.id
   WHERE p.id IS NULL OR p.\"pictureBookId\"<>s.\"bookId\" OR (to_jsonb(p)-ARRAY['approvedSnapshot','currentSnapshot','approvedHash','currentHash']) IS DISTINCT FROM s.\"expectedOther\"
    OR NOT ((p.\"currentSnapshot\"=s.\"oldSnapshot\" AND p.\"approvedSnapshot\"=s.\"oldSnapshot\" AND p.\"currentHash\"=s.\"oldHash\" AND p.\"approvedHash\"=s.\"oldHash\")
         OR (p.\"currentSnapshot\"=s.\"newSnapshot\" AND p.\"approvedSnapshot\"=s.\"newSnapshot\" AND p.\"currentHash\"=s.\"newHash\" AND p.\"approvedHash\"=s.\"newHash\"))
    OR EXISTS (SELECT 1 FROM course_review_requests r WHERE r.\"materialPublicationId\"=s.id AND r.status='PENDING')
 ) THEN RAISE EXCEPTION 'Publication ratio snapshot conflict'; END IF;
END $repair$;
"""
    apply="""CREATE TEMP TABLE legacy_ratio_publications_changed ON COMMIT DROP AS
WITH changed AS (UPDATE course_material_publications p SET \"currentSnapshot\"=s.\"newSnapshot\",\"approvedSnapshot\"=s.\"newSnapshot\",\"currentHash\"=s.\"newHash\",\"approvedHash\"=s.\"newHash\"
 FROM legacy_ratio_publications s WHERE p.id=s.id AND p.\"currentHash\"=s.\"oldHash\" AND p.\"approvedHash\"=s.\"oldHash\" RETURNING p.id) SELECT * FROM changed;
DO $repair$ BEGIN
 IF EXISTS (SELECT 1 FROM legacy_ratio_publications s LEFT JOIN course_material_publications p ON p.id=s.id
 WHERE p.id IS NULL OR (to_jsonb(p)-ARRAY['approvedSnapshot','currentSnapshot','approvedHash','currentHash']) IS DISTINCT FROM s.\"expectedOther\"
   OR p.\"currentSnapshot\" IS DISTINCT FROM s.\"newSnapshot\" OR p.\"approvedSnapshot\" IS DISTINCT FROM s.\"newSnapshot\"
   OR p.\"currentHash\" IS DISTINCT FROM s.\"newHash\" OR p.\"approvedHash\" IS DISTINCT FROM s.\"newHash\"
   OR EXISTS (SELECT 1 FROM course_review_requests r WHERE r.\"materialPublicationId\"=s.id AND r.status='PENDING')
 ) THEN RAISE EXCEPTION 'Publication ratio reconciliation failed'; END IF;
END $repair$;
"""
    return prepare,apply


def plan_ratio_repair(source,current):
    if source['id']!=current['id'] or source['userId']!=current['userId'] or db_time(source['createdAt'])!=db_time(current['createdAt']):raise ValueError('Migrated book identity or creation time mismatch')
    if source['aspectRatio'] not in REPAIR_RATIOS:raise ValueError('Ratio outside requested repair scope')
    if current['aspectRatio']!='1:1' or current['version']!=0 or db_time(source['updatedAt'])!=db_time(current['updatedAt']):return None
    if not re.fullmatch(r'[a-f0-9]{64}',current['stateSha256']):raise ValueError('Invalid target book snapshot')
    return {'id':current['id'],'userId':current['userId'],'version':0,'updatedAt':db_time(current['updatedAt']),'stateSha256':current['stateSha256'],'newRatio':source['aspectRatio']}


def repair_ratios_sql(plans,database='abei',publications=()):
    if database not in {'abei','abei_wechat_test'} or not plans or len({p['id'] for p in plans})!=len(plans):raise ValueError('Explicit distinct abei repair plans required')
    columns=('id','userId','version','updatedAt','stateSha256','newRatio');values=[]
    for plan in plans:
        if plan['newRatio'] not in REPAIR_RATIOS or plan['version']!=0 or not re.fullmatch(r'[a-f0-9]{64}',plan['stateSha256']):raise ValueError('Invalid ratio repair plan')
        values.append(sql.SQL('({})').format(sql.SQL(',').join(sql.Literal(plan[k]) for k in columns)))
    publication_prepare,publication_apply=publication_sql(plans,publications)
    return """BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $repair$ BEGIN
 IF current_database() <> """+sql.Literal(database).as_string()+""" THEN RAISE EXCEPTION 'Wrong ratio repair database'; END IF;
 IF NOT pg_try_advisory_xact_lock(626234801) THEN RAISE EXCEPTION 'Another importer is active'; END IF;
END $repair$;
CREATE TEMP TABLE legacy_book_ratio_repair (
 id text PRIMARY KEY, owner_id text, expected_version integer, expected_time timestamp(3), state_sha256 text, new_ratio text
) ON COMMIT DROP;
INSERT INTO legacy_book_ratio_repair VALUES """+sql.SQL(',\n').join(values).as_string()+""";
DO $repair$ BEGIN
 IF EXISTS (SELECT 1 FROM legacy_book_ratio_repair p LEFT JOIN picture_books b ON b.id=p.id
  WHERE b.id IS NULL OR b.\"userId\"<>p.owner_id OR b.version<>p.expected_version OR b.\"updatedAt\"<>p.expected_time
   OR encode(sha256(convert_to((to_jsonb(b)-'aspectRatio')::text,'UTF8')),'hex')<>p.state_sha256 OR b.\"aspectRatio\" NOT IN ('1:1',p.new_ratio)
 ) THEN RAISE EXCEPTION 'Ratio repair snapshot conflict'; END IF;
END $repair$;
"""+publication_prepare+"""CREATE TEMP TABLE legacy_book_ratio_changed ON COMMIT DROP AS
WITH changed AS (
 UPDATE picture_books b SET \"aspectRatio\"=p.new_ratio FROM legacy_book_ratio_repair p
 WHERE b.id=p.id AND b.\"userId\"=p.owner_id AND b.version=p.expected_version AND b.\"updatedAt\"=p.expected_time AND b.\"aspectRatio\"='1:1'
  AND encode(sha256(convert_to((to_jsonb(b)-'aspectRatio')::text,'UTF8')),'hex')=p.state_sha256 RETURNING b.id,b.\"aspectRatio\"
) SELECT * FROM changed;
DO $repair$ BEGIN
 IF EXISTS (SELECT 1 FROM legacy_book_ratio_repair p LEFT JOIN picture_books b ON b.id=p.id
  WHERE b.id IS NULL OR b.\"userId\"<>p.owner_id OR b.version<>p.expected_version OR b.\"updatedAt\"<>p.expected_time
   OR encode(sha256(convert_to((to_jsonb(b)-'aspectRatio')::text,'UTF8')),'hex')<>p.state_sha256 OR b.\"aspectRatio\"<>p.new_ratio
 ) THEN RAISE EXCEPTION 'Ratio repair reconciliation failed'; END IF;
END $repair$;
"""+publication_apply+"""SELECT json_build_object('plannedBooks',(SELECT COUNT(*) FROM legacy_book_ratio_repair),
 'updatedBooks',(SELECT COUNT(*) FROM legacy_book_ratio_changed),
 'updatedPublications',(SELECT COUNT(*) FROM legacy_ratio_publications_changed),
 'ratioCounts',(SELECT json_object_agg(\"aspectRatio\",amount) FROM (SELECT \"aspectRatio\",COUNT(*) amount FROM legacy_book_ratio_changed GROUP BY \"aspectRatio\") totals));
COMMIT;
"""
