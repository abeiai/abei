import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from tools.legacy_sync.source import ReadOnlySource, selected_columns, validate_tables
from tools.legacy_sync.export import export_snapshot, validate_package
from tools.legacy_sync.package import read_chunk, write_chunk, write_manifest, load_manifest

BASELINE = json.loads((Path(__file__).parents[1] / 'schema-baseline.json').read_text())
KEY = bytes(range(32))


class FixtureSource:
    version = '8.0.36'
    closed = False
    schema_calls = 0
    mutate_schema = False
    def schema(self):
        self.schema_calls += 1
        result = copy.deepcopy(BASELINE)
        if self.mutate_schema and self.schema_calls > 1: result['app_user_user']['columns'][1]['type'] = 'varchar(2)'
        return result
    def bounds(self, table): return (1, 1, 1) if table == 'app_user_user' else (None, None, 0)
    def rows(self, table, columns, after, upper, limit):
        if table != 'app_user_user' or after: return []
        values = {'id': 1, 'username': 'fixture-user', 'extra': '{"headers":{"Authorization":"Bearer fixture-secret"},"prompt":"完整业务正文"}'}
        return [tuple(values.get(column) for column in columns)]
    def credentials(self, table, columns, after, upper, limit): return [(1, 'pbkdf2_sha256$1$fixture$fixture')] if not after else []
    def close(self): self.closed = True


class ReviewRegressions(unittest.TestCase):
    def test_constructor_sets_session_read_only_before_current_snapshot(self):
        queries = []
        class Cursor:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def execute(self, sql): queries.append(sql)
            def fetchone(self): return ('8.0.36', 'fixture', 1, 'REPEATABLE-READ')
        class Connection:
            def cursor(self): return Cursor()
            def rollback(self): queries.append('ROLLBACK')
            def close(self): pass
        config = {'MYSQL_URL': 'fixture.invalid', 'MYSQL_PORT': '3306', 'MYSQL_USER': 'fixture', 'MYSQL_PASSWORD': 'fixture', 'MYSQL_DATABASE': 'fixture'}
        with patch('pymysql.connect', return_value=Connection()):
            source = ReadOnlySource(config, True)
            source.close()
        self.assertIn('SET SESSION TRANSACTION READ ONLY', queries)
        self.assertLess(queries.index('SET SESSION TRANSACTION READ ONLY'), queries.index('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY'))
        self.assertFalse(any(sql.startswith(('INSERT','UPDATE','DELETE','CREATE','ALTER','DROP')) for sql in queries))

    def test_unknown_columns_and_missing_or_changed_baseline_are_rejected(self):
        with self.assertRaises(ValueError): selected_columns('app_user_user', ['id', 'username', 'credential_blob'])
        for mutation in ['missing', 'type', 'table']:
            baseline = copy.deepcopy(BASELINE)
            if mutation == 'missing': baseline['app_user_user']['columns'] = [column for column in baseline['app_user_user']['columns'] if column['name'] != 'username']
            elif mutation == 'type': baseline['app_user_user']['columns'][1]['type'] = 'blob'
            else: del baseline['app_ai_chatmessage']
            with self.assertRaises(ValueError): validate_tables(baseline)

    def test_nested_credentials_move_to_restricted_stream_without_losing_original_text(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            export_snapshot(FixtureSource(), root, KEY, 'fixture-source', 'fixture-run')
            manifest = load_manifest(root, KEY)
            table = manifest['tables']['app_user_user']
            ordinary = read_chunk(root, table['chunks'][0], KEY)
            self.assertNotIn('fixture-secret', json.dumps(ordinary))
            restricted = read_chunk(root, table['restrictedChunks'][0], KEY)
            self.assertIn('fixture-secret', restricted[0]['values']['extra'])
            self.assertIn('完整业务正文', restricted[0]['values']['extra'])
            self.assertEqual(restricted[0]['sourcePk'], ordinary[0]['sourcePk'])
            validate_package(root, KEY)

    def test_empty_missing_credentials_wrong_envelope_and_id_mismatch_packages_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            schema = write_chunk(root, 'metadata/schema.enc', [{}], KEY)
            write_manifest(root, {'protocol': 1, 'dataSnapshotComplete': True, 'schema': schema, 'tables': {}}, KEY)
            with self.assertRaises(ValueError): validate_package(root, KEY)
        for mutation in ['credentials', 'table', 'id', 'truncation']:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                export_snapshot(FixtureSource(), root, KEY, 'fixture-source', 'fixture-run')
                manifest = load_manifest(root, KEY)
                table = manifest['tables']['app_user_user']
                if mutation == 'credentials': table['credentialChunks'] = []
                elif mutation == 'truncation': del manifest['tables']['app_ai_ttsmessage']
                else:
                    chunk = table['chunks'][0]
                    rows = read_chunk(root, chunk, KEY)
                    if mutation == 'table': rows[0]['sourceTable'] = 'app_user_share'
                    else: rows[0]['values']['id'] = '999'
                    table['chunks'][0] = write_chunk(root, chunk['file'], rows, KEY)
                write_manifest(root, manifest, KEY)
                with self.assertRaises(ValueError): validate_package(root, KEY)

    def test_schema_change_during_snapshot_leaves_incomplete_package(self):
        source = FixtureSource()
        source.mutate_schema = True
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(ValueError): export_snapshot(source, root, KEY, 'fixture-source', 'fixture-run')
            with self.assertRaises(ValueError): load_manifest(root, KEY)
        self.assertTrue(source.closed)


if __name__ == '__main__': unittest.main()
