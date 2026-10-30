#!/usr/bin/env python3
"""Keep the cc.abeiai.com CDN certificate in sync with its local ACME lineage."""
import datetime
import hashlib
import hmac
import json
import os
import re
import subprocess
import tempfile
import socket
import ssl
import stat
import sys
import time
import urllib.request
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

DOMAIN = 'cc.abeiai.com'
ROOT = Path('/etc/abei-cdn-cert')
LINEAGE = Path('/etc/letsencrypt/live') / DOMAIN


def check_storage(root, expected_uid=0):
    for path, directory, mode in [(root, True, 0o700), (root / 'host.key', False, 0o600), (root / 'credentials.enc', False, 0o600)]:
        info = path.lstat()
        kind_ok = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
        if not kind_ok or info.st_uid != expected_uid or stat.S_IMODE(info.st_mode) != mode:
            raise PermissionError('Unsafe credential storage permissions')


def certificate_fingerprint(cert_pem, key_pem):
    cert = x509.load_pem_x509_certificate(cert_pem)
    key = serialization.load_pem_private_key(key_pem, password=None)
    names = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    if DOMAIN not in names.get_values_for_type(x509.DNSName):
        raise ValueError('Certificate does not cover the CDN domain')
    now = datetime.datetime.utcnow()
    if cert.not_valid_before > now or cert.not_valid_after <= now + datetime.timedelta(days=3):
        raise ValueError('Certificate is not valid for at least three more days')
    fmt = (serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    if cert.public_key().public_bytes(*fmt) != key.public_key().public_bytes(*fmt):
        raise ValueError('Certificate and private key do not match')
    return cert.fingerprint(hashes.SHA256()).hex()


def verify_chain(fullchain):
    blocks = re.findall(rb'-----BEGIN CERTIFICATE-----\s+.*?-----END CERTIFICATE-----', fullchain, re.DOTALL)
    if len(blocks) < 2:
        raise ValueError('Certificate chain is incomplete')
    with tempfile.TemporaryDirectory(prefix='abei-cdn-cert-') as directory:
        leaf = Path(directory) / 'leaf.pem'
        chain = Path(directory) / 'chain.pem'
        leaf.write_bytes(blocks[0] + b'\n')
        chain.write_bytes(b'\n'.join(blocks[1:]) + b'\n')
        result = subprocess.run(['/usr/bin/openssl', 'verify', '-purpose', 'sslserver', '-verify_hostname', DOMAIN,
                                 '-CAfile', '/etc/ssl/certs/ca-certificates.crt', '-untrusted', str(chain), str(leaf)],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        if result.returncode:
            raise ValueError('Certificate chain is not trusted')


def live_fingerprint():
    # Only a public certificate is read here. Its digest is compared with the
    # locally validated certificate, including when a previous one has expired.
    context = ssl._create_unverified_context()
    with socket.create_connection((DOMAIN, 443), timeout=15) as conn:
        with context.wrap_socket(conn, server_hostname=DOMAIN) as tls:
            return hashlib.sha256(tls.getpeercert(binary_form=True)).hexdigest()


def tc_api(credentials, action, payload):
    body = json.dumps(payload, separators=(',', ':'), ensure_ascii=False).encode()
    timestamp = int(time.time())
    date = datetime.datetime.fromtimestamp(timestamp, datetime.timezone.utc).strftime('%Y-%m-%d')
    host = 'cdn.tencentcloudapi.com'
    content_type = 'application/json; charset=utf-8'
    hashed = lambda b: hashlib.sha256(b).hexdigest()
    canonical = 'POST\n/\n\ncontent-type:' + content_type + '\nhost:' + host + '\n\ncontent-type;host\n' + hashed(body)
    scope = date + '/cdn/tc3_request'
    sign_text = 'TC3-HMAC-SHA256\n' + str(timestamp) + '\n' + scope + '\n' + hashed(canonical.encode())
    mac = lambda k, b: hmac.new(k, b.encode(), hashlib.sha256).digest()
    signing_key = mac(mac(mac(('TC3' + credentials['SecretKey']).encode(), date), 'cdn'), 'tc3_request')
    signature = hmac.new(signing_key, sign_text.encode(), hashlib.sha256).hexdigest()
    authorization = 'TC3-HMAC-SHA256 Credential=' + credentials['SecretId'] + '/' + scope + ', SignedHeaders=content-type;host, Signature=' + signature
    request = urllib.request.Request('https://' + host, data=body, headers={
        'Content-Type': content_type, 'Host': host, 'Authorization': authorization,
        'X-TC-Action': action, 'X-TC-Version': '2018-06-06', 'X-TC-Timestamp': str(timestamp),
    })
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.load(response)['Response']
    if 'Error' in result:
        raise RuntimeError('Tencent CDN API: ' + result['Error'].get('Code', 'UnknownError'))
    return result


def reconcile(api, probe, fingerprint, cert, key, attempts=48, delay=5, on_submit=lambda: None):
    try:
        if probe() == fingerprint:
            return 'current'
    except (OSError, ssl.SSLError):
        pass  # A broken TLS listener must not prevent certificate recovery.
    api('ModifyDomainConfig', {'Domain': DOMAIN, 'Route': 'Https.CertInfo', 'Value': json.dumps({
        'update': {'Certificate': cert, 'PrivateKey': key}
    })})
    on_submit()
    deadline = time.monotonic() + 240
    for _ in range(attempts):
        if time.monotonic() >= deadline:
            break
        time.sleep(delay)
        try:
            if probe() == fingerprint:
                return 'updated'
        except (OSError, ssl.SSLError):
            pass
    raise RuntimeError('New certificate not yet visible at the CDN; retry required')


def waiting_for_deployment(state, fingerprint, now):
    return (state.get('status') == 'pending' and state.get('fingerprint') == fingerprint
            and 0 <= now - state.get('submitted_at', 0) < 12 * 3600)


def write_state(path, state):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(state))
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)


def main():
    cert = (LINEAGE / 'fullchain.pem').read_bytes()
    key = (LINEAGE / 'privkey.pem').read_bytes()
    fingerprint = certificate_fingerprint(cert, key)
    verify_chain(cert)
    check_storage(ROOT)
    secret = (ROOT / 'host.key').read_bytes()
    encrypted = (ROOT / 'credentials.enc').read_bytes()
    credentials = json.loads(AESGCM(secret).decrypt(encrypted[:12], encrypted[12:], DOMAIN.encode()))
    api = lambda action, payload: tc_api(credentials, action, payload)
    # Verify that the credential still works even when no replacement is needed.
    response = api('DescribeDomainsConfig', {'Filters': [{'Name': 'domain', 'Value': [DOMAIN], 'Fuzzy': False}]})
    domains = response.get('Domains', [])
    if len(domains) != 1 or domains[0].get('Domain') != DOMAIN or domains[0].get('Https', {}).get('Switch') != 'on':
        raise RuntimeError('CDN domain or HTTPS configuration is unavailable')
    config = domains[0]
    cert_id = config.get('Https', {}).get('CertInfo', {}).get('CertId')
    state_path = ROOT / 'deployed.json'
    try:
        state = json.loads(state_path.read_text())
    except FileNotFoundError:
        state = {}
    if state.get('fingerprint') == fingerprint and state.get('cert_id') == cert_id and cert_id and config['Https'].get('SslStatus') == 'deployed':
        try:
            current_edge = live_fingerprint()
        except (OSError, ssl.SSLError):
            current_edge = None  # Retry deployment to recover an unavailable TLS listener.
        if current_edge == fingerprint:
            print('CDN certificate current')
            return
        if current_edge is not None:
            raise RuntimeError('CDN edge has not yet received the deployed certificate')
    if waiting_for_deployment(state, fingerprint, time.time()):
        if live_fingerprint() != fingerprint:
            raise RuntimeError('Previously submitted certificate is still propagating')
        result = 'updated'
    else:
        def mark_pending():
            write_state(state_path, {'fingerprint': fingerprint, 'status': 'pending', 'submitted_at': time.time()})
        result = reconcile(api, live_fingerprint, fingerprint, cert.decode(), key.decode(), on_submit=mark_pending)
    # A successful request and one matching node do not prove every node is ready.
    # Record only the certificate ID reported by the CDN after deployment finishes.
    deadline = time.monotonic() + 240
    for _ in range(48):
        if time.monotonic() >= deadline:
            break
        latest = api('DescribeDomainsConfig', {'Filters': [{'Name': 'domain', 'Value': [DOMAIN], 'Fuzzy': False}]}).get('Domains', [])
        if len(latest) == 1:
            https = latest[0].get('Https', {})
            new_id = (https.get('CertInfo') or {}).get('CertId')
            if latest[0].get('Status') == 'online' and https.get('SslStatus') == 'deployed' and new_id:
                write_state(state_path, {'fingerprint': fingerprint, 'cert_id': new_id, 'status': 'deployed'})
                print('CDN certificate ' + result)
                return
        time.sleep(5)
    raise RuntimeError('Tencent CDN certificate configuration has not finished deploying')

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('CDN certificate synchronization failed: ' + type(exc).__name__ + ': ' + str(exc), file=sys.stderr)
        sys.exit(1)
