#!/usr/bin/env python3
"""Build/inspect an immutable Abei code archive. Never reads environment files."""
import io
import pathlib
import re
import subprocess
import sys
import tarfile

ROOT_FILES = {'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.dockerignore',
              'docker-compose.abei-prod.yml', 'RELEASE_COMMIT'}
PRIVATE_PARTS = {'node_modules', '.git', '.superpowers', '.next', 'dist',
                 'private-data', 'private-creator-assets', 'private-picture-book-guides',
                 'private-legacy-ai-log-assets', 'uploads', 'logs', 'backups', 'tmp',
                 'textbook', 'textbook-markdown-assets', 'vendor', 'coverage', '__pycache__'}

def allowed(name):
    p = pathlib.PurePosixPath(name)
    if p.is_absolute() or '..' in p.parts or str(p) != name or not p.parts:
        return False
    if any(part in PRIVATE_PARTS or part.startswith('.env') for part in p.parts):
        return False
    if name.startswith('packages/database/generated/'):
        return False
    if p.suffix.lower() in {'.pem', '.key', '.p12', '.pfx', '.dump', '.backup', '.pdf', '.log', '.zip', '.tgz', '.gz'}:
        return False
    if 'public' in p.parts and p.suffix.lower() == '.md':
        return False
    return (name in ROOT_FILES or name.startswith(('apps/', 'packages/', 'deploy/abei/'))
            or name == 'scripts/python311.mjs' or name.startswith('scripts/release/abei-'))

def require_sha(value):
    if not re.fullmatch(r'[0-9a-f]{40}', value):
        raise ValueError('必须提供完整不可变提交 SHA')

def inspect(archive, sha):
    members = archive.getmembers()
    names = set()
    for member in members:
        if not member.isfile() or not allowed(member.name) or member.name in names:
            raise ValueError('发布包包含非白名单文件、重复路径或链接')
        names.add(member.name)
    if 'RELEASE_COMMIT' not in names or archive.extractfile('RELEASE_COMMIT').read().decode().strip() != sha:
        raise ValueError('发布包提交 SHA 不匹配')
    return members

def main():
    command, sha, filename, *rest = sys.argv[1:]
    require_sha(sha)
    if command == 'pack':
        actual = subprocess.check_output(['git', 'rev-parse', f'{sha}^{{commit}}'], text=True).strip()
        if actual != sha:
            raise ValueError('提交不存在')
        listing = subprocess.check_output(['git', 'ls-tree', '-r', '-z', sha]).split(b'\0')
        with tarfile.open(filename, 'w') as archive:
            for entry in filter(None, listing):
                metadata, raw_name = entry.split(b'\t', 1)
                mode, kind, oid = metadata.split()
                name = raw_name.decode()
                if not allowed(name) or name == 'RELEASE_COMMIT':
                    continue
                if kind != b'blob' or mode not in [b'100644', b'100755']:
                    raise ValueError('发布白名单中不允许符号链接或子模块')
                data = subprocess.check_output(['git', 'cat-file', 'blob', oid.decode()])
                item = tarfile.TarInfo(name); item.size = len(data); item.mode = int(mode[-3:], 8)
                archive.addfile(item, io.BytesIO(data))
            data = (sha + '\n').encode(); item = tarfile.TarInfo('RELEASE_COMMIT'); item.size = len(data)
            archive.addfile(item, io.BytesIO(data))
    elif command in ['inspect', 'extract']:
        with tarfile.open(filename, 'r:') as archive:
            members = inspect(archive, sha)
            if command == 'extract':
                target = pathlib.Path(rest[0]).resolve()
                if not target.is_dir() or any(target.iterdir()):
                    raise ValueError('解包目标必须是新的空目录')
                for member in members:
                    dest = target / member.name
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    with dest.open('xb') as output:
                        output.write(archive.extractfile(member).read())
                    dest.chmod(member.mode & 0o755)
    else:
        raise ValueError('未知命令')

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
