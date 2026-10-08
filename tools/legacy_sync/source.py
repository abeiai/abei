"""Only fixed metadata/SELECT templates and read-only transaction controls."""
import hashlib
import json
import re
from pathlib import Path
from .tables import TABLES, FORBIDDEN_COLUMNS


def identifier(value):
    if not re.fullmatch(r'[a-z][a-z0-9_]*', value): raise ValueError('Invalid source identifier')
    return '`' + value + '`'


def selected_columns(table, names):
    if table not in TABLES: raise ValueError('Source table is not approved')
    provider_config = {'endpoint', 'extra'} if re.fullmatch(r'app_ai_(?:bots|llm|draw|human|recognition|clone|tts|video)(?:model|version|price)', table) else set()
    return [name for name in names if name.lower() not in FORBIDDEN_COLUMNS | provider_config and not name.lower().endswith(('_secret', '_password', '_token', '_api_key'))]


def batch_query(table, columns, after, upper, limit):
    if table not in TABLES or 'id' not in columns or selected_columns(table, columns) != columns: raise ValueError('Unapproved source projection')
    if not isinstance(limit, int) or not 1 <= limit <= 500: raise ValueError('Invalid source batch size')
    projection = ','.join(identifier(column) for column in columns)
    return f'SELECT {projection} FROM {identifier(table)} WHERE `id` > %s AND `id` <= %s ORDER BY `id` LIMIT %s', (after, upper, limit)


def validate_tables(tables):
    if not tables or 'app_user_user' not in tables: raise ValueError('Required source tables missing')
    for name, table in tables.items():
        if name not in TABLES or table['engine'] != 'InnoDB' or table['primaryKey'] != ['id']:
            raise ValueError('Unsupported source snapshot layout')
        primary = next((c for c in table['columns'] if c['name'] == 'id'), {})
        if not re.match(r'^(?:bigint|int|smallint)', primary.get('type', '')): raise ValueError('Unsupported source cursor key')


def read_config(files):
    values = {}
    for file in files:
        for line in Path(file).read_text().splitlines():
            match = re.fullmatch(r'([A-Z_0-9]+)\s*=\s*(.*)', line)
            if match and match[1].startswith('MYSQL_'):
                raw = match[2].strip()
                if '$(' in raw or '`' in raw or '${' in raw: raise ValueError('Dynamic source config is forbidden')
                values[match[1]] = raw.strip('\"\'')
    required = ['MYSQL_URL', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']
    if any(not values.get(key) for key in required): raise ValueError('Source config incomplete')
    return values


class ReadOnlySource:
    def __init__(self, config, confirmed_legacy_entry=False):
        import pymysql
        if not confirmed_legacy_entry: raise ValueError('The legacy access entry must be explicitly confirmed')
        self.config = config
        self.connection = pymysql.connect(host=config['MYSQL_URL'], port=int(config['MYSQL_PORT']),
            user=config['MYSQL_USER'], password=config['MYSQL_PASSWORD'], database=config['MYSQL_DATABASE'],
            charset='utf8mb4', connect_timeout=10, read_timeout=90, write_timeout=10, autocommit=False)
        self.closed = False
        try:
            with self.connection.cursor() as cursor:
                cursor.execute('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ')
                cursor.execute('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY')
                cursor.execute('SELECT VERSION(), DATABASE(), @@transaction_read_only, @@transaction_isolation')
                version, database, readonly, isolation = cursor.fetchone()
                if not version.startswith('8.0.') or database != config['MYSQL_DATABASE'] or not readonly or isolation != 'REPEATABLE-READ':
                    raise ValueError('Source read-only snapshot cannot be verified')
                self.version = version
        except Exception:
            self.close()
            raise

    def schema(self):
        with self.connection.cursor() as c:
            c.execute('SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = %s ORDER BY TABLE_NAME', (self.config['MYSQL_DATABASE'],))
            inventory = dict(c.fetchall())
            if TABLES - inventory.keys(): raise ValueError('Approved source table disappeared')
            unknown = set(inventory) - TABLES
            from .tables import EXCLUDED_TABLES
            if unknown - EXCLUDED_TABLES: raise ValueError('Unknown source tables require classification')
            result = {name: {'engine': inventory[name], 'columns': [], 'primaryKey': []} for name in sorted(TABLES & inventory.keys())}
            c.execute('SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, COLUMN_KEY, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = %s ORDER BY TABLE_NAME, ORDINAL_POSITION', (self.config['MYSQL_DATABASE'],))
            for table, name, kind, key, nullable in c.fetchall():
                if table not in result: continue
                identifier(name)
                result[table]['columns'].append({'name': name, 'type': kind, 'nullable': nullable == 'YES'})
                if key == 'PRI': result[table]['primaryKey'].append(name)
        validate_tables(result)
        return result

    def bounds(self, table):
        if table not in TABLES: raise ValueError('Unapproved table')
        with self.connection.cursor() as c:
            c.execute(f'SELECT MIN(`id`), MAX(`id`), COUNT(`id`) FROM {identifier(table)}')
            return c.fetchone()

    def rows(self, table, columns, after, upper, limit):
        sql, parameters = batch_query(table, columns, after, upper, limit)
        with self.connection.cursor() as c:
            c.execute(sql, parameters)
            return c.fetchall()

    def credentials(self, table, columns, after, upper, limit):
        # Separate encrypted credential stream; only approved password-hash/access-code columns.
        from .tables import CREDENTIAL_COLUMNS
        if set(columns) - ({'id'} | CREDENTIAL_COLUMNS.get(table, set())) or 'id' not in columns or not 1 <= limit <= 500:
            raise ValueError('Unapproved credential projection')
        if table not in CREDENTIAL_COLUMNS: raise ValueError('Unapproved credential table')
        sql = f'SELECT {",".join(identifier(c) for c in columns)} FROM {identifier(table)} WHERE `id` > %s AND `id` <= %s ORDER BY `id` LIMIT %s'
        with self.connection.cursor() as c:
            c.execute(sql, (after, upper, limit))
            return c.fetchall()

    def close(self):
        if self.closed: return
        self.closed = True
        try: self.connection.rollback()
        finally: self.connection.close()


def schema_hash(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
