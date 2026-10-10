"""Style-only plans, with owner, immutable creation time and target snapshot guards."""
import re
from psycopg import sql
from .book_asset_repair import db_time
from .book_styles import STYLE_IDS


def plan_style_repair(source,current):
    if source['id']!=current['id'] or source['userId']!=current['userId'] or db_time(source['createdAt'])!=db_time(current['createdAt']):
        raise ValueError('Migrated book identity or creation time mismatch')
    if source['style'] not in STYLE_IDS:raise ValueError('Unapproved target style')
    if current['style']!='':return None
    if not isinstance(current['version'],int) or current['version']<0 or not re.fullmatch(r'[a-f0-9]{64}',current['stateSha256']):raise ValueError('Invalid target book snapshot')
    return {'id':current['id'],'userId':current['userId'],'version':current['version'],'updatedAt':db_time(current['updatedAt']),'stateSha256':current['stateSha256'],'newStyle':source['style']}


def repair_styles_sql(plans,database='abei'):
    if database not in {'abei','abei_wechat_test'} or not plans or len({p['id'] for p in plans})!=len(plans):raise ValueError('Explicit distinct abei repair plans required')
    columns=('id','userId','version','updatedAt','stateSha256','newStyle')
    values=[]
    for plan in plans:
        if plan['newStyle'] not in STYLE_IDS or not isinstance(plan['version'],int) or plan['version']<0 or not re.fullmatch(r'[a-f0-9]{64}',plan['stateSha256']):raise ValueError('Invalid style repair plan')
        values.append(sql.SQL('({})').format(sql.SQL(',').join(sql.Literal(plan[k]) for k in columns)))
    return """BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $repair$ BEGIN
 IF current_database() <> """+sql.Literal(database).as_string()+""" THEN RAISE EXCEPTION 'Wrong style repair database'; END IF;
 IF NOT pg_try_advisory_xact_lock(626234801) THEN RAISE EXCEPTION 'Another importer is active'; END IF;
END $repair$;
CREATE TEMP TABLE legacy_book_style_repair (
 id text PRIMARY KEY, owner_id text, expected_version integer, expected_time timestamp(3), state_sha256 text, new_style text
) ON COMMIT DROP;
INSERT INTO legacy_book_style_repair VALUES """+sql.SQL(',\n').join(values).as_string()+""";
DO $repair$ BEGIN
 IF EXISTS (SELECT 1 FROM legacy_book_style_repair p LEFT JOIN picture_books b ON b.id=p.id
  WHERE b.id IS NULL OR b.\"userId\"<>p.owner_id OR b.version<>p.expected_version OR b.\"updatedAt\"<>p.expected_time
   OR encode(sha256(convert_to((to_jsonb(b)-'style')::text,'UTF8')),'hex')<>p.state_sha256 OR b.style NOT IN ('',p.new_style)
 ) THEN RAISE EXCEPTION 'Style repair snapshot conflict'; END IF;
END $repair$;
CREATE TEMP TABLE legacy_book_style_changed ON COMMIT DROP AS
WITH changed AS (
 UPDATE picture_books b SET style=p.new_style FROM legacy_book_style_repair p
 WHERE b.id=p.id AND b.\"userId\"=p.owner_id AND b.version=p.expected_version AND b.\"updatedAt\"=p.expected_time AND b.style=''
  AND encode(sha256(convert_to((to_jsonb(b)-'style')::text,'UTF8')),'hex')=p.state_sha256 RETURNING b.id,b.style
) SELECT * FROM changed;
DO $repair$ BEGIN
 IF EXISTS (SELECT 1 FROM legacy_book_style_repair p LEFT JOIN picture_books b ON b.id=p.id
  WHERE b.id IS NULL OR b.\"userId\"<>p.owner_id OR b.version<>p.expected_version OR b.\"updatedAt\"<>p.expected_time
   OR encode(sha256(convert_to((to_jsonb(b)-'style')::text,'UTF8')),'hex')<>p.state_sha256 OR b.style<>p.new_style
 ) THEN RAISE EXCEPTION 'Style repair reconciliation failed'; END IF;
END $repair$;
SELECT json_build_object('plannedBooks',(SELECT COUNT(*) FROM legacy_book_style_repair),
 'updatedBooks',(SELECT COUNT(*) FROM legacy_book_style_changed),
 'styleCounts',(SELECT json_object_agg(style,amount) FROM (SELECT style,COUNT(*) amount FROM legacy_book_style_changed GROUP BY style) totals));
COMMIT;
"""
