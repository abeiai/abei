#!/usr/bin/env python3
"""Read a Tencent API credential from stdin and store only encrypted data."""
import json
import os
import sys
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

root = Path('/etc/abei-cdn-cert')
if os.geteuid() != 0:
    raise SystemExit('Must be run as root')
root.mkdir(mode=0o700, parents=True, exist_ok=True)
os.chmod(root, 0o700)
credentials = json.load(sys.stdin)
if set(credentials) != {'SecretId', 'SecretKey'} or not all(isinstance(v, str) and v for v in credentials.values()):
    raise SystemExit('Invalid credential input')
keyfile = root / 'host.key'
if not keyfile.exists():
    fd = os.open(keyfile, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as f:
        f.write(AESGCM.generate_key(bit_length=256))
key = keyfile.read_bytes()
nonce = os.urandom(12)
ciphertext = nonce + AESGCM(key).encrypt(nonce, json.dumps(credentials).encode(), b'cc.abeiai.com')
fd = os.open(root / 'credentials.enc.new', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'wb') as f:
    f.write(ciphertext)
os.replace(root / 'credentials.enc.new', root / 'credentials.enc')
print('Encrypted credential installed')
