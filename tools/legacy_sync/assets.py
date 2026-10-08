"""Offline reference discovery and source-read/target-write object transfer."""
import base64
import hashlib
import ipaddress
import json
import re
import socket
from urllib.parse import urlparse, unquote, parse_qs, urlunparse

URL = re.compile(r'(?:https?://|//)[^\s"\'<>\\]+|data:(?:image|audio|video)/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+')
EXTENSIONS = {'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','image/bmp':'bmp','image/avif':'avif','image/heic':'heic','image/heif':'heif','audio/mpeg':'mp3','audio/wav':'wav','audio/ogg':'ogg','audio/mp4':'m4a','audio/aac':'aac','audio/flac':'flac','video/mp4':'mp4','video/webm':'webm','video/ogg':'ogv'}
MEDIA_SUFFIX = re.compile(r'\.(?:png|jpe?g|webp|gif|bmp|avif|svg|heic|tiff?|mp3|wav|ogg|m4a|aac|flac|mp4|webm|mov|mkv|avi)(?:$|[?#])', re.I)


def public_dns(host):
    return sorted({item[4][0] for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)})


def validate_download_url(url, allowed_hosts, resolver=public_dns):
    if url.startswith('//'): url = 'https:' + url
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None,443) or parsed.hostname not in allowed_hosts:
        raise ValueError('Unapproved media origin')
    if re.search(r'(?:^|/)(?:api|admin|callback)(?:/|$)', unquote(parsed.path), re.I): raise ValueError('Business API cannot be used for media capture')
    addresses = resolver(parsed.hostname)
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses): raise ValueError('Non-public media address')
    return url


def source_locator(url, config):
    domain = urlparse(config['OSS_DOMAIN']).hostname
    endpoint = urlparse(config['OSS_ENDPOINT']).hostname
    bucket = config['OSS_BUCKET_NAME']
    if url.startswith('//'): url = 'https:' + url
    parsed = urlparse(url)
    hosts = {domain:bucket, f'{bucket}.{endpoint}':bucket, 'filed.abeiai.com':'abei-filed', f'abei-filed.{endpoint}':'abei-filed'}
    if parsed.scheme in ('http','https') and parsed.hostname in hosts:
        if parsed.username or parsed.password: raise ValueError('Credentials in media URL')
        key = unquote(parsed.path.lstrip('/'))
        if not key or '..' in key.split('/'): raise ValueError('Invalid source object path')
        version = parse_qs(parsed.query).get('versionId',[None])[0]
        return {'provider':'OSS','bucket':hosts[parsed.hostname],'objectKey':key,'versionId':version}
    if not parsed.scheme and not parsed.netloc and (url.startswith(config.get('MEDIA_URL','/abei/')) or url.startswith('abei/') or MEDIA_SUFFIX.search(url)):
        key = unquote(parsed.path.lstrip('/'))
        if '..' in key.split('/'): raise ValueError('Invalid source object path')
        return {'provider':'OSS','bucket':bucket,'objectKey':key,'versionId':None}
    if url.startswith('data:'): return {'provider':'INLINE','dataUrl':url}
    return {'provider':'HTTPS','url':url}


def find_references(row, owner=None, media_prefix='/abei/'):
    values = row['values']
    user = owner if owner is not None else (row['sourcePk'] if row['sourceTable']=='app_user_user' else values.get('user_id'))
    def walk(value, path, depth=0):
        if depth > 128: raise ValueError('Asset JSON nesting exceeds supported depth')
        if isinstance(value, dict):
            for key, child in value.items(): yield from walk(child,path+'/'+str(key).replace('~','~0').replace('/','~1'),depth+1)
        elif isinstance(value,list):
            for position,child in enumerate(value): yield from walk(child,path+'/'+str(position),depth+1)
        elif isinstance(value,str):
            if value.lstrip().startswith(('{','[')):
                try:
                    parsed=json.loads(value,parse_int=str,parse_float=str)
                except (ValueError,RecursionError): parsed=None
                if isinstance(parsed,(dict,list)):
                    yield from walk(parsed,path,depth+1)
                    return
            matches = [(match.start(),match.group(0)) for match in URL.finditer(value)]
            relative=re.compile(r'(?<![A-Za-z0-9])(?:'+re.escape(media_prefix)+'|'+re.escape(media_prefix.lstrip('/'))+r')[^\s"\'<>\\]+')
            occupied=[(match.start(),match.end()) for match in URL.finditer(value)]
            matches.extend((match.start(),match.group(0)) for match in relative.finditer(value) if not any(start<=match.start()<end for start,end in occupied))
            media_field=any(tag in path.lower() for tag in ['image','avatar','audio','video','assistant_content','results','/img','/cover'])
            if not matches and media_field and MEDIA_SUFFIX.search(value) and not re.search(r'[\s<>]',value): matches=[(0,value)]
            urls=[url.rstrip('),;]') for _,url in sorted(matches)]
            for position,url in enumerate(urls):
                if not (MEDIA_SUFFIX.search(url) or url.startswith(('data:',media_prefix,media_prefix.lstrip('/'))) or media_field): continue
                object_id=hashlib.sha256(url.encode()).hexdigest()
                identity=json.dumps([row['sourceTable'],row['sourcePk'],path,position,url],ensure_ascii=False,separators=(',',':'))
                role='OUTPUT' if any(tag in path.lower() for tag in ['assistant_content','/results','/result/','/video']) else 'REFERENCE' if any(tag in path.lower() for tag in ['reference','/image']) else 'INPUT'
                hint='audio' if row['sourceTable'] in {'app_ai_ttsmessage','app_ai_ttssubject','app_ai_clonetask'} or 'audio' in path.lower() else 'video' if row['sourceTable'] in {'app_ai_videomessage','app_ai_humanmessage'} or 'video' in path.lower() else 'image'
                yield {'referenceId':hashlib.sha256(identity.encode()).hexdigest(),'objectId':object_id,'sourceTable':row['sourceTable'],'sourcePk':row['sourcePk'],
                    'fieldPath':path,'position':position,'sourceUserId':user,'originalUrl':url,'role':role,'mediaHint':hint}
    for field,value in values.items(): yield from walk(value,'/'+field)


def mime_from_bytes(head,hint):
    if head.startswith(b'\x89PNG\r\n\x1a\n'): return 'image/png'
    if head.startswith(b'\xff\xd8\xff'): return 'image/jpeg'
    if head.startswith((b'GIF87a',b'GIF89a')): return 'image/gif'
    if head.startswith(b'RIFF') and head[8:12]==b'WEBP': return 'image/webp'
    if head.startswith(b'RIFF') and head[8:12]==b'WAVE': return 'audio/wav'
    if head.startswith(b'BM'): return 'image/bmp'
    if head.startswith(b'fLaC'): return 'audio/flac'
    if head[4:8]==b'ftyp':
        if head[8:12] in (b'avif',b'avis'): return 'image/avif'
        if head[8:12] in (b'heic',b'heix',b'hevc',b'hevx'): return 'image/heic'
        if head[8:12] in (b'mif1',b'msf1'): return 'image/heif'
        return 'audio/mp4' if hint=='audio' else 'video/mp4'
    if head.startswith(b'ID3') or (len(head)>1 and head[0]==255 and head[1]&0xE0==0xE0): return 'audio/mpeg'
    if head.startswith(b'OggS'): return 'video/ogg' if hint=='video' else 'audio/ogg'
    if head.startswith(b'\x1a\x45\xdf\xa3'): return 'video/webm'
    raise ValueError('Source is not a supported image/audio/video object')


def upload_to_r2(client,bucket,prefix,file,mime,size,digest):
    if bucket!='abeiai' or not re.fullmatch(r'(?:picture-books/)?legacy-sync/abei[a-z0-9-]*/',prefix) or mime not in EXTENSIONS or not re.fullmatch(r'[a-f0-9]{64}',digest): raise ValueError('Unapproved R2 upload destination')
    key=prefix+digest+'.'+EXTENSIONS[mime]
    uploaded=False
    def check():
        metadata=client.head_object(Bucket=bucket,Key=key)
        if metadata.get('ContentLength')!=size or metadata.get('Metadata',{}).get('sha256')!=digest: raise ValueError('R2 object validation failed; existing object is never overwritten')
        return metadata
    try:
        check()
    except Exception as error:
        code=getattr(error,'response',{}).get('Error',{}).get('Code')
        if code not in {'404','NoSuchKey','NotFound'}: raise
        file.seek(0)
        md5=hashlib.md5(usedforsecurity=False)
        for chunk in iter(lambda:file.read(1024*1024),b''): md5.update(chunk)
        file.seek(0)
        try:
            client.put_object(Bucket=bucket,Key=key,Body=file,ContentType=mime,ContentLength=size,
                ContentMD5=base64.b64encode(md5.digest()).decode(),IfNoneMatch='*',
                CacheControl='public, max-age=31536000, immutable',Metadata={'sha256':digest})
            uploaded=True
        except Exception as write_error:
            if getattr(write_error,'response',{}).get('Error',{}).get('Code') not in {'PreconditionFailed','412'}: raise
        check()
    return {'status':'AVAILABLE','bucket':bucket,'objectKey':key,'sha256':digest,'sizeBytes':size,'mimeType':mime,'uploaded':uploaded}
