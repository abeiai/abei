"""Source-only CLI: one connection, no reconnect, no target database credential."""
import argparse
import collections
import datetime as dt
import hashlib
import json
import os
import time
from pathlib import Path
from .source import ReadOnlySource, read_config, selected_columns, schema_hash, validate_tables
from .tables import CREDENTIAL_COLUMNS
from .package import encode_value, write_chunk, write_manifest, read_chunk, load_manifest


def export_snapshot(source, root, key, source_system, run_id, progress=None):
    root = Path(root)
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
                'count': 0, 'chunks': [], 'credentialChunks': []}
            manifest['tables'][table] = info
            after, number = 0, 0
            while upper is not None:
                raw = source.rows(table, columns, after, upper, 250)
                if not raw: break
                rows = []
                for row in raw:
                    values = {column: encode_value(value) for column, value in zip(columns, row)}
                    rows.append({'sourceSystem': source_system, 'sourceTable': table, 'sourcePk': str(row[columns.index('id')]), 'values': values})
                number += 1
                prefix = 'finance' if table == 'app_distribution_withdrawalrecord' else 'tables'
                chunk = write_chunk(root, f'{prefix}/{table}.{number:06}.enc', rows, key)
                info['chunks'].append(chunk)
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


def validate_package(root, key):
    manifest = load_manifest(root, key)
    read_chunk(root, manifest['schema'], key)
    for info in manifest['tables'].values():
        count = 0
        last = 0
        for chunk in info['chunks']:
            for row in read_chunk(root, chunk, key):
                primary = int(row['sourcePk'])
                if primary <= last: raise ValueError('Duplicate or unordered source primary key')
                last = primary
                count += 1
        if count != info['count'] or count != info['expectedCount']: raise ValueError('Table checksum coverage mismatch')
        for chunk in info['credentialChunks']: read_chunk(root, chunk, key)
    manifest['validationPassed'] = True
    write_manifest(root, manifest, key)
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
