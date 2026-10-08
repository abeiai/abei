"""Authenticated local chunks. This module never loads source or target credentials."""
import base64
import datetime as dt
import decimal
import gzip
import hashlib
import json
import os
import re
import tempfile
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag

HEADER = b'ABEI-LEGACY-V1\0'


def encode_value(value):
    if isinstance(value, bool) or value is None or isinstance(value, str): return value
    if isinstance(value, (int, float, decimal.Decimal)): return str(value)
    if isinstance(value, dt.datetime):
        raw = value.isoformat()
        zoned = value.replace(tzinfo=dt.timezone(dt.timedelta(hours=8))) if value.tzinfo is None else value
        return {'type': 'datetime', 'raw': raw, 'timezone': 'Asia/Shanghai', 'utc': zoned.astimezone(dt.timezone.utc).isoformat().replace('+00:00', 'Z')}
    if isinstance(value, dt.date): return {'type': 'date', 'raw': value.isoformat()}
    if isinstance(value, (bytes, bytearray)): return {'type': 'binary', 'base64': base64.b64encode(value).decode()}
    if isinstance(value, (dt.time, dt.timedelta)): return {'type': 'time', 'raw': str(value)}
    raise ValueError('Unsupported source value type')


def safe_path(root, relative):
    if not re.fullmatch(r'(?:tables|credentials|finance|metadata|assets|reports)/[a-zA-Z0-9_.-]+\.enc|manifest\.enc', relative):
        raise ValueError('Invalid package path')
    candidate = Path(root) / relative
    if not candidate.resolve().is_relative_to(Path(root).resolve()): raise ValueError('Package path escaped root')
    candidate.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    return candidate


def write_chunk(root, relative, rows, key):
    plaintext = b''.join((json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n').encode() for row in rows)
    nonce = os.urandom(12)
    encoded = HEADER + nonce + AESGCM(key).encrypt(nonce, gzip.compress(plaintext, mtime=0), relative.encode())
    path = safe_path(root, relative)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as out:
        temporary = Path(out.name)
        out.write(encoded)
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)
    return {'file': relative, 'rows': len(rows), 'plaintextSha256': hashlib.sha256(plaintext).hexdigest(), 'encryptedSha256': hashlib.sha256(encoded).hexdigest(), 'plaintextBytes': len(plaintext)}


def read_chunk(root, info, key):
    relative = info['file']
    encoded = safe_path(root, relative).read_bytes()
    if info.get('encryptedSha256') and hashlib.sha256(encoded).hexdigest() != info['encryptedSha256']: raise ValueError('Encrypted chunk checksum mismatch')
    if not encoded.startswith(HEADER): raise ValueError('Unknown encrypted package version')
    nonce, ciphertext = encoded[len(HEADER):len(HEADER)+12], encoded[len(HEADER)+12:]
    try: compressed = AESGCM(key).decrypt(nonce, ciphertext, relative.encode())
    except InvalidTag: raise ValueError('Package authentication failed') from None
    plaintext = gzip.decompress(compressed)
    if info.get('plaintextSha256') and hashlib.sha256(plaintext).hexdigest() != info['plaintextSha256']: raise ValueError('Plaintext chunk checksum mismatch')
    result = [json.loads(line) for line in plaintext.splitlines()]
    if info.get('rows') is not None and len(result) != info['rows']: raise ValueError('Chunk row count mismatch')
    return result


def write_manifest(root, manifest, key):
    return write_chunk(root, 'manifest.enc', [manifest], key)


def load_manifest(root, key):
    result = read_chunk(root, {'file': 'manifest.enc'}, key)[0]
    if result.get('dataSnapshotComplete') is not True: raise ValueError('Incomplete source snapshot cannot be imported')
    return result
