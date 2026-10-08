"""Preserve suspect fields verbatim in restricted chunks, never replace original text."""
import json
import re

KEY = re.compile(r'^(?:api[_-]?key|api[_-]?secret|app[_-]?secret|secret|password|passwd|authorization|cookie|set-cookie|access[_-]?token|refresh[_-]?token|credential.*|token|encodingaeskey|private[_-]?key|client[_-]?secret|x-api-key)$|(?:_secret|_password|_token|_api_key)$', re.I)
TEXT = re.compile(r'\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+|\bsk-[A-Za-z0-9_-]{16,}|\b(?:api[_-]?key|password|authorization|cookie|access[_-]?token|refresh[_-]?token)\s*[:=]', re.I)


def credential_like(value, depth=0):
    if depth > 64: return True
    if isinstance(value, dict): return any(KEY.search(key) or credential_like(child, depth + 1) for key, child in value.items())
    if isinstance(value, list): return any(credential_like(child, depth + 1) for child in value)
    if not isinstance(value, str): return False
    if TEXT.search(value): return True
    if value.lstrip().startswith(('{', '[')):
        try: return credential_like(json.loads(value, parse_int=str, parse_float=str), depth + 1)
        except (ValueError, RecursionError): return True
    return False


def split_restricted(values):
    ordinary, restricted = {}, {}
    for field, value in values.items():
        if field == 'reg_ip' or credential_like(value):
            restricted[field] = value
            ordinary[field] = {'type': 'restricted', 'field': field}
        else: ordinary[field] = value
    return ordinary, restricted
