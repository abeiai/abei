"""Source-only CLI: one connection, no reconnect, no target database credential."""
import argparse
import collections
import datetime as dt
import hashlib
import json
import os
import time
from pathlib import Path
from .source import ReadOnlySource, read_config, selected_columns, schema_hash, validate_tables, SCHEMA_BASELINE
from .tables import CREDENTIAL_COLUMNS
from .package import encode_value, write_chunk, write_manifest, read_chunk, load_manifest
from .sensitive import split_restricted


def export_snapshot(source, root, key, source_system, run_id, progress=None):
    root = Path(root)
    if root.exists() and any(root.iterdir()): raise ValueError('A source snapshot requires a fresh empty package directory')
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(root, 0o700)
    manifest = {'protocol': 1, 'runId': run_id, 'sourceSystem': source_system, 'sourceVersion': source.version,
        'sourceTimezone': 'Asia/Shanghai', 'startedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
        'dataSnapshotComplete': False, 'assetsComplete': False, 'validationPassed': False,
        'accessPolicy': 'user-confirmed-legacy-entry/fixed-select/read-only-transaction', 'tables': {}}
    write_manifest(root, manifest, key)
    last_progress = time.monotonic()
    try:
        schema = source.schema()
        validate_tables(schema)
        signature = schema_hash(schema)
        manifest['schema'] = write_chunk(root, 'metadata/schema.enc', [schema], key)
        manifest['schemaSha256'] = signature
        # Smaller relationship/dictionary tables precede the four large log tables.
        large = {'app_ai_chatmessage', 'app_ai_drawmessage', 'app_ai_ttsmessage', 'app_ai_videomessage'}
        order = sorted(schema, key=lambda name: (name in large, name != 'app_user_user', name))
        for table in order:
            names = [column['name'] for column in schema[table]['columns']]
            columns = selected_columns(table, names)
            lower, upper, expected = source.bounds(table)
            info = {'columns': columns, 'excludedColumns': [c for c in names if c not in columns], 'expectedCount': expected,
                'minPk': str(lower) if lower is not None else None, 'maxPk': str(upper) if upper is not None else None,
                'count': 0, 'chunks': [], 'credentialChunks': [], 'restrictedChunks': [], 'restrictedCount': 0}
            manifest['tables'][table] = info
            after, number = 0, 0
            while upper is not None:
                raw = source.rows(table, columns, after, upper, 250)
                if not raw: break
                rows, restricted_rows = [], []
                for row in raw:
                    values = {column: encode_value(value) for column, value in zip(columns, row)}
                    ordinary, restricted = split_restricted(values)
                    envelope = {'sourceSystem': source_system, 'sourceTable': table, 'sourcePk': str(row[columns.index('id')])}
                    rows.append({**envelope, 'values': ordinary, 'restrictedFields': sorted(restricted)})
                    if restricted: restricted_rows.append({**envelope, 'values': restricted})
                number += 1
                prefix = 'finance' if table == 'app_distribution_withdrawalrecord' else 'tables'
                chunk = write_chunk(root, f'{prefix}/{table}.{number:06}.enc', rows, key)
                info['chunks'].append(chunk)
                if restricted_rows:
                    info['restrictedChunks'].append(write_chunk(root, f'credentials/{table}.restricted.{number:06}.enc', restricted_rows, key))
                    info['restrictedCount'] += len(restricted_rows)
                info['count'] += len(rows)
                next_after = int(rows[-1]['sourcePk'])
                if next_after <= after: raise ValueError('Source cursor failed to advance')
                after = next_after
                if progress and time.monotonic() - last_progress >= 15:
                    progress({'phase': 'database-export', 'table': table, 'rows': info['count'], 'expected': expected})
                    last_progress = time.monotonic()
            if info['count'] != expected or (expected and after != upper): raise ValueError('Source row coverage mismatch')
            password_columns = sorted(CREDENTIAL_COLUMNS.get(table, set()) & set(names))
            if password_columns:
                after, number, credential_count = 0, 0, 0
                algorithms = collections.Counter()
                while upper is not None:
                    raw = source.credentials(table, ['id'] + password_columns, after, upper, 250)
                    if not raw: break
                    rows = [{'sourceSystem': source_system, 'sourceTable': table, 'sourcePk': str(row[0]),
                        'values': {column: encode_value(value) for column, value in zip(['id'] + password_columns, row)}} for row in raw]
                    number += 1
                    info['credentialChunks'].append(write_chunk(root, f'credentials/{table}.{number:06}.enc', rows, key))
                    credential_count += len(rows)
                    next_after = int(rows[-1]['sourcePk'])
                    if next_after <= after: raise ValueError('Credential cursor failed to advance')
                    after = next_after
                    if table == 'app_user_user':
                        for row in rows:
                            password = row['values'].get('password') or ''
                            algorithm = password.split('$', 1)[0] if '$' in password else 'unusable-or-unknown'
                            algorithms[algorithm if algorithm in {'pbkdf2_sha256', 'pbkdf2_sha1', 'argon2', 'bcrypt_sha256', 'bcrypt', 'scrypt'} else 'unusable-or-unknown'] += 1
                if credential_count != expected: raise ValueError('Credential row coverage mismatch')
                if algorithms: info['passwordAlgorithms'] = dict(algorithms)
            write_manifest(root, manifest, key)
            if progress: progress({'phase': 'table-complete', 'table': table, 'rows': info['count']})
        if schema_hash(source.schema()) != signature: raise ValueError('Source schema changed during snapshot')
        source.close()
        manifest['finishedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
        manifest['dataSnapshotComplete'] = True
        write_manifest(root, manifest, key)
        return manifest
    except Exception as error:
        manifest['errorCategory'] = type(error).__name__
        manifest['dataSnapshotComplete'] = False
        write_manifest(root, manifest, key)
        raise
    finally:
        source.close()


def validate_package(root, key, record_validation=True):
    manifest = load_manifest(root, key)
    if manifest.get('protocol') != 1 or not manifest.get('sourceSystem') or set(manifest.get('tables', {})) != set(SCHEMA_BASELINE):
        raise ValueError('Incomplete table inventory or unknown package protocol')
    if manifest['schema']['file'] != 'metadata/schema.enc': raise ValueError('Unexpected schema package location')
    schema = read_chunk(root, manifest['schema'], key)[0]
    validate_tables(schema)
    if schema_hash(schema) != manifest['schemaSha256']: raise ValueError('Schema signature mismatch')
    seen_files = {manifest['schema']['file']}
    for table, info in manifest['tables'].items():
        columns = selected_columns(table, [column['name'] for column in schema[table]['columns']])
        if info['columns'] != columns: raise ValueError('Unexpected source column projection')
        credentials = sorted(CREDENTIAL_COLUMNS.get(table, set()) & {c['name'] for c in schema[table]['columns']})

        def entries(chunks, mode):
            last = 0
            prefix = ('finance/' if table == 'app_distribution_withdrawalrecord' else 'tables/') if mode == 'business' else 'credentials/'
            for chunk in chunks:
                filename = chunk['file']
                if not filename.startswith(prefix + table + '.') or filename in seen_files: raise ValueError('Duplicate or misplaced source chunk')
                seen_files.add(filename)
                for row in read_chunk(root, chunk, key):
                    if row.get('sourceSystem') != manifest['sourceSystem'] or row.get('sourceTable') != table: raise ValueError('Source envelope attribution mismatch')
                    primary = int(row['sourcePk'])
                    if primary <= last or primary < int(info['minPk']) or primary > int(info['maxPk']): raise ValueError('Duplicate, unordered or out-of-range source key')
                    last = primary
                    values = row['values']
                    if mode != 'restricted' and (values.get('id') != row['sourcePk'] or set(values) != set(columns if mode == 'business' else ['id'] + credentials)):
                        raise ValueError('Source row projection/id mismatch')
                    if mode == 'restricted' and (not values or set(values) - set(columns)): raise ValueError('Unknown restricted source fields')
                    yield row

        credential_rows = iter(entries(info['credentialChunks'], 'credential'))
        restricted_rows = iter(entries(info['restrictedChunks'], 'restricted'))
        current_restricted = next(restricted_rows, None)
        count, last, first, restricted_count = 0, 0, None, 0
        for row in entries(info['chunks'], 'business'):
            primary = int(row['sourcePk'])
            if first is None: first = primary
            last = primary
            count += 1
            if credentials:
                credential = next(credential_rows, None)
                if credential is None or credential['sourcePk'] != row['sourcePk']: raise ValueError('Missing or mismatched credential coverage')
            fields = row.get('restrictedFields', [])
            if current_restricted is not None and int(current_restricted['sourcePk']) < primary: raise ValueError('Orphan restricted source row')
            if fields:
                if current_restricted is None or current_restricted['sourcePk'] != row['sourcePk'] or set(current_restricted['values']) != set(fields): raise ValueError('Missing or mismatched restricted source fields')
                for field in fields:
                    if row['values'].get(field) != {'type': 'restricted', 'field': field}: raise ValueError('Restricted source marker mismatch')
                restricted_count += 1
                current_restricted = next(restricted_rows, None)
            elif current_restricted is not None and int(current_restricted['sourcePk']) == primary: raise ValueError('Unexpected restricted source row')
        if next(credential_rows, None) is not None or current_restricted is not None or next(restricted_rows, None) is not None: raise ValueError('Extraneous restricted/credential records')
        if count != info['count'] or count != info['expectedCount'] or restricted_count != info['restrictedCount']: raise ValueError('Table checksum coverage mismatch')
        if count and (str(first) != info['minPk'] or str(last) != info['maxPk']): raise ValueError('Incomplete source key range')
        if not count and (info['minPk'] is not None or info['maxPk'] is not None): raise ValueError('Empty source table has invalid range')
    if manifest['tables']['app_user_user']['count'] < 1: raise ValueError('Expected existing legacy users')
    manifest['validationPassed'] = True
    if record_validation: write_manifest(root, manifest, key)
    return manifest


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-env', action='append')
    parser.add_argument('--source-system', required=True)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--key-file', required=True)
    parser.add_argument('--confirmed-legacy-entry', action='store_true')
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    key_path, root = Path(args.key_file).resolve(), Path(args.output).resolve()
    if key_path.is_relative_to(root): raise ValueError('Package key must be stored separately')
    key = key_path.read_bytes()
    if len(key) != 32: raise ValueError('Expected separate 256-bit package key')
    if args.validate_only:
        result = validate_package(root, key)
    else:
        if not args.source_env: raise ValueError('Explicit source config is required')
        config = read_config(args.source_env)
        source = ReadOnlySource(config, args.confirmed_legacy_entry)
        result = export_snapshot(source, root, key, args.source_system, args.run_id, lambda value: print(json.dumps(value), flush=True))
        result['sourceFingerprint'] = hashlib.sha256((config['MYSQL_URL'] + '/' + config['MYSQL_DATABASE']).encode()).hexdigest()
        write_manifest(root, result, key)
        result = validate_package(root, key)
    print(json.dumps({'phase': 'snapshot-validated', 'tables': len(result['tables']), 'rows': sum(t['count'] for t in result['tables'].values()), 'dataSnapshotComplete': result['dataSnapshotComplete'], 'validationPassed': result['validationPassed']}), flush=True)


if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(json.dumps({'phase': 'snapshot-failed', 'errorCategory': type(error).__name__}), flush=True)
        raise SystemExit(1)
