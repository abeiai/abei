"""Prompt-only repair for untouched imported pages, with atomic snapshot guards."""
import re
from psycopg import sql
from psycopg.types.json import Jsonb
from .book_asset_repair import db_time
from .book_prompts import prompt_text

NON_PROMPT_STATE_SQL="""encode(sha256(convert_to(((to_jsonb(b)-'pages') || jsonb_build_object('pages',
 (SELECT jsonb_agg(p.value-'imagePrompt' ORDER BY p.ordinality) FROM jsonb_array_elements(b.pages) WITH ORDINALITY p)))::text,'UTF8')),'hex')"""

def plan_prompt_repair(source,current):
    if (source['id']!=current['id'] or source['userId']!=current['userId']
        or db_time(source['createdAt'])!=db_time(current['createdAt'])):raise ValueError('Migrated book identity or creation time mismatch')
    if current['version']!=0 or db_time(source['updatedAt'])!=db_time(current['updatedAt']):return None
    old=current['pages'];wanted=source['pages']
    if not isinstance(old,list) or not isinstance(wanted,list) or len(old)!=len(wanted):return None
    patches={}
    for n,(before,after) in enumerate(zip(old,wanted)):
        if not isinstance(before,dict) or not isinstance(after,dict):return None
        if any(before.get(field)!=after.get(field) for field in ('position','caption','narration')):return None
        if before.get('imagePrompt') in (None,'') and prompt_text(after.get('imagePrompt')):patches[str(n)]=after['imagePrompt']
    if not patches:return None
    if not re.fullmatch(r'[a-f0-9]{64}',current['stateSha256']):raise ValueError('Invalid target prompt snapshot')
    return {'id':current['id'],'userId':current['userId'],'version':0,'updatedAt':db_time(current['updatedAt']),
        'stateSha256':current['stateSha256'],'patches':patches,'pageCount':len(old)}

def repair_prompts_sql(plans,database='abei'):
    if database not in {'abei','abei_wechat_test'} or not plans or len({p['id'] for p in plans})!=len(plans):raise ValueError('Explicit distinct abei prompt plans required')
    columns=('id','userId','version','updatedAt','stateSha256','patches','pageCount');values=[]
    for p in plans:
        if (p['version']!=0 or not re.fullmatch(r'[a-f0-9]{64}',p['stateSha256']) or not p['patches']
            or any(not re.fullmatch(r'0|[1-9]\d*',k) or int(k)>=p['pageCount'] or not prompt_text(v) for k,v in p['patches'].items())):raise ValueError('Invalid page prompt plan')
        values.append(sql.SQL('({})').format(sql.SQL(',').join(sql.Literal(Jsonb(p[k]) if k=='patches' else db_time(p[k]) if k=='updatedAt' else p[k]) for k in columns)))
    return """BEGIN;
SET LOCAL TIME ZONE 'UTC'; SET LOCAL lock_timeout='5s';
DO $repair$ BEGIN
 IF current_database() <> """+sql.Literal(database).as_string()+""" OR current_setting('port') <> """+sql.Literal('3606' if database=='abei_wechat_test' else '3604').as_string()+""" THEN RAISE EXCEPTION 'Wrong prompt repair database'; END IF;
 IF NOT pg_try_advisory_xact_lock(626234801) THEN RAISE EXCEPTION 'Another importer is active'; END IF;
END $repair$;
CREATE TEMP TABLE legacy_book_prompt_repair (
 id text PRIMARY KEY, owner_id text, expected_version integer, expected_time timestamp(3), state_sha256 text, patches jsonb, page_count integer
) ON COMMIT DROP;
INSERT INTO legacy_book_prompt_repair VALUES """+sql.SQL(',\n').join(values).as_string()+""";
DO $repair$ BEGIN
 PERFORM b.id FROM picture_books b JOIN legacy_book_prompt_repair p ON p.id=b.id FOR UPDATE OF b;
 IF EXISTS (SELECT 1 FROM legacy_book_prompt_repair p LEFT JOIN picture_books b ON b.id=p.id
 WHERE b.id IS NULL OR b.\"userId\"<>p.owner_id OR b.version<>p.expected_version OR b.\"updatedAt\"<>p.expected_time
  OR jsonb_array_length(b.pages)<>p.page_count OR """+NON_PROMPT_STATE_SQL+"""<>p.state_sha256
  OR EXISTS (SELECT 1 FROM jsonb_each_text(p.patches) change
   WHERE COALESCE(b.pages->(change.key::integer)->>'imagePrompt','') NOT IN ('',change.value))
 ) THEN RAISE EXCEPTION 'Prompt repair snapshot conflict'; END IF;
END $repair$;
CREATE TEMP TABLE legacy_book_prompt_changed ON COMMIT DROP AS
WITH candidates AS (
 SELECT b.id,
  (SELECT jsonb_agg(CASE WHEN p.patches ? (page.ordinality-1)::text AND COALESCE(page.value->>'imagePrompt','')=''
    THEN jsonb_set(page.value,'{imagePrompt}',p.patches->((page.ordinality-1)::text),true) ELSE page.value END ORDER BY page.ordinality)
   FROM jsonb_array_elements(b.pages) WITH ORDINALITY page) AS new_pages,
  (SELECT COUNT(*) FROM jsonb_each_text(p.patches) change WHERE COALESCE(b.pages->(change.key::integer)->>'imagePrompt','')='') AS added
 FROM picture_books b JOIN legacy_book_prompt_repair p ON p.id=b.id
), changed AS (
 UPDATE picture_books b SET pages=c.new_pages FROM candidates c WHERE b.id=c.id AND c.added>0 RETURNING b.id,c.added
) SELECT * FROM changed;
DO $repair$ BEGIN
 IF EXISTS (SELECT 1 FROM legacy_book_prompt_repair p LEFT JOIN picture_books b ON b.id=p.id
 WHERE b.id IS NULL OR b.\"userId\"<>p.owner_id OR b.version<>p.expected_version OR b.\"updatedAt\"<>p.expected_time
  OR """+NON_PROMPT_STATE_SQL+"""<>p.state_sha256
  OR EXISTS (SELECT 1 FROM jsonb_each_text(p.patches) change WHERE (b.pages->(change.key::integer)->>'imagePrompt') IS DISTINCT FROM change.value)
 ) THEN RAISE EXCEPTION 'Prompt repair reconciliation failed'; END IF;
END $repair$;
SELECT json_build_object('plannedBooks',(SELECT COUNT(*) FROM legacy_book_prompt_repair),
 'updatedBooks',(SELECT COUNT(*) FROM legacy_book_prompt_changed),'updatedPages',(SELECT COALESCE(SUM(added),0) FROM legacy_book_prompt_changed));
COMMIT;
"""
