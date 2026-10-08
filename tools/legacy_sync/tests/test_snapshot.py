import datetime as dt
import decimal
import tempfile
import unittest
from pathlib import Path
from tools.legacy_sync.source import batch_query, validate_tables, selected_columns
from tools.legacy_sync.package import encode_value, write_chunk, read_chunk, write_manifest, load_manifest
from tools.legacy_sync.export import export_snapshot


class SnapshotContract(unittest.TestCase):
    def test_fixed_queries_reject_write_injection_and_secret_columns(self):
        sql, params = batch_query('app_user_user', ['id', 'username'], 0, 9007199254740993, 500)
        self.assertNotIn('SELECT *', sql)
        self.assertNotIn('9007199254740993', sql)
        self.assertEqual(params, (0, 9007199254740993, 500))
        for table, columns in [('app_user_user; DELETE FROM app_user_user', ['id']), ('django_session', ['id']), ('app_user_user', ['id` FROM users; DROP TABLE users; --']), ('app_ai_drawversion', ['api_key'])]:
            with self.assertRaises(ValueError): batch_query(table, columns, 0, 1, 10)
        self.assertEqual(selected_columns('app_user_user', ['id', 'password', 'username']), ['id', 'username'])
        self.assertEqual(selected_columns('app_open_app', ['id', 'app_secret', 'title']), ['id', 'title'])

    def test_only_transactional_tables_and_stable_primary_keys(self):
        good = {'app_user_user': {'engine': 'InnoDB', 'primaryKey': ['id'], 'columns': [{'name': 'id', 'type': 'bigint'}]}}
        validate_tables(good)
        for engine, primary in [('MyISAM', ['id']), ('InnoDB', []), ('InnoDB', ['a', 'b'])]:
            with self.assertRaises(ValueError): validate_tables({'app_user_user': {**good['app_user_user'], 'engine': engine, 'primaryKey': primary}})

    def test_integer_money_json_and_shanghai_time_keep_precision(self):
        self.assertEqual(encode_value(9007199254740993), '9007199254740993')
        self.assertEqual(encode_value(decimal.Decimal('123.4500')), '123.4500')
        raw = '{"id":9007199254740993,"price":0.1234567890123456789}'
        self.assertEqual(encode_value(raw), raw)
        time = encode_value(dt.datetime(2026, 10, 8, 0, 1, 2))
        self.assertEqual(time['raw'], '2026-10-08T00:01:02')
        self.assertEqual(time['utc'], '2026-10-07T16:01:02Z')
        self.assertEqual(encode_value(dt.date(2026, 10, 8)), {'type': 'date', 'raw': '2026-10-08'})

    def test_encrypted_chunk_integrity_unicode_and_path_boundaries(self):
        key = bytes(range(32))
        rows = [{'sourcePk': '1', 'values': {'text': '换行\n中文', 'password': '合成测试值'}}]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            info = write_chunk(root, 'tables/app_user_user.000001.enc', rows, key)
            ciphertext = (root / info['file']).read_bytes()
            self.assertNotIn('合成测试值'.encode(), ciphertext)
            self.assertEqual(read_chunk(root, info, key), rows)
            with self.assertRaises(ValueError): write_chunk(root, '../leak.enc', rows, key)
            (root / info['file']).write_bytes(ciphertext[:-1] + bytes([ciphertext[-1] ^ 1]))
            with self.assertRaises(ValueError): read_chunk(root, info, key)

    def test_incomplete_or_wrong_key_package_cannot_be_imported(self):
        key = bytes(range(32))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_manifest(root, {'dataSnapshotComplete': False}, key)
            with self.assertRaises(ValueError): load_manifest(root, key)
            write_manifest(root, {'dataSnapshotComplete': True, 'tables': {}}, key)
            self.assertTrue(load_manifest(root, key)['dataSnapshotComplete'])
            with self.assertRaises(ValueError): load_manifest(root, bytes(reversed(key)))

    def test_failed_connection_or_schema_change_never_marks_snapshot_complete(self):
        class FixtureSource:
            closed = False
            calls = 0
            version = '8.0.36'
            def schema(self):
                self.calls += 1
                return {'app_user_user': {'engine': 'InnoDB', 'primaryKey': ['id'], 'columns': [{'name': 'id', 'type': 'bigint'}, {'name': 'username', 'type': 'varchar(150)'}]}}
            def bounds(self, table): return (1, 1, 1)
            def rows(self, *args): raise ConnectionError('simulated source loss')
            def close(self): self.closed = True
        source = FixtureSource()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(ConnectionError): export_snapshot(source, root, bytes(range(32)), 'fixture-source', 'fixture-run')
            with self.assertRaises(ValueError): load_manifest(root, bytes(range(32)))
        self.assertTrue(source.closed)
        self.assertEqual(source.calls, 1)

    def test_business_and_password_hash_streams_are_separate_and_counted(self):
        class FixtureSource:
            version = '8.0.36'
            closed = False
            def schema(self): return {'app_user_user': {'engine': 'InnoDB', 'primaryKey': ['id'], 'columns': [{'name': 'id', 'type': 'bigint'}, {'name': 'username', 'type': 'varchar(150)'}, {'name': 'password', 'type': 'varchar(128)'}]}}
            def bounds(self, table): return (1, 1, 1)
            def rows(self, table, columns, after, upper, limit): return [(1, 'fixture-user')] if not after else []
            def credentials(self, table, columns, after, upper, limit): return [(1, 'pbkdf2_sha256$1$fixture$fixture')] if not after else []
            def close(self): self.closed = True
        key = bytes(range(32))
        source = FixtureSource()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            export_snapshot(source, root, key, 'fixture-source', 'fixture-run')
            manifest = load_manifest(root, key)
            table = manifest['tables']['app_user_user']
            self.assertEqual(table['count'], 1)
            business = read_chunk(root, table['chunks'][0], key)
            hashes = read_chunk(root, table['credentialChunks'][0], key)
            self.assertNotIn('password', business[0]['values'])
            self.assertEqual(hashes[0]['values']['password'], 'pbkdf2_sha256$1$fixture$fixture')
            self.assertTrue(source.closed)


if __name__ == '__main__': unittest.main()
