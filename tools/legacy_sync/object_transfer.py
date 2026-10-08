"""Reads original object storage only. Writes exclusively to the configured abeiai R2."""
import base64
import hashlib
import json
import re
import tempfile
from pathlib import Path
from urllib.parse import urlparse
from .assets import source_locator, validate_download_url, mime_from_bytes, upload_to_r2


def pinned_adapter():
    from requests.adapters import HTTPAdapter
    from urllib3 import PoolManager
    from urllib3.connection import HTTPSConnection
    from urllib3.connectionpool import HTTPSConnectionPool
    from urllib3.util.connection import create_connection
    from .assets import public_dns
    import ipaddress
    class PinnedConnection(HTTPSConnection):
        def _new_conn(self):
            addresses=public_dns(self.host)
            if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses): raise ValueError('Non-public media transport address')
            failure=None
            for address in addresses:
                try: return create_connection((address,self.port),self.timeout,source_address=self.source_address,socket_options=self.socket_options)
                except OSError as error: failure=error
            raise failure
    class PinnedPool(HTTPSConnectionPool):
        ConnectionCls=PinnedConnection
    class Adapter(HTTPAdapter):
        def init_poolmanager(self,connections,maxsize,block=False,**kwargs):
            self.poolmanager=PoolManager(num_pools=connections,maxsize=maxsize,block=block,**kwargs)
            self.poolmanager.pool_classes_by_scheme={**self.poolmanager.pool_classes_by_scheme,'https':PinnedPool}
    return Adapter(pool_connections=16,pool_maxsize=16),PinnedConnection


def env_values(files, keys):
    result={}
    for filename in files:
        for line in Path(filename).read_text().splitlines():
            match=re.fullmatch(r'([A-Z_0-9]+)\s*=\s*(.*)',line)
            if match and match[1] in keys:
                value=match[2].strip()
                if '$(' in value or '`' in value or '${' in value: raise ValueError('Dynamic storage config is forbidden')
                result[match[1]]=value.strip('\"\'')
    return result


def r2_client(filename):
    import boto3
    from botocore.config import Config
    values=env_values([filename],{'S3_ENDPOINT','S3_BUCKET','S3_REGION','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','S3_PUBLIC_BASE_URL'})
    endpoint=urlparse(values.get('S3_ENDPOINT',''))
    public=urlparse(values.get('S3_PUBLIC_BASE_URL',''))
    if values.get('S3_BUCKET')!='abeiai' or endpoint.scheme!='https' or not (endpoint.hostname or '').endswith('.r2.cloudflarestorage.com') or public.scheme!='https' or not public.hostname or public.username or public.password:
        raise ValueError('Expected confirmed abeiai R2 configuration')
    client=boto3.client('s3',endpoint_url=values['S3_ENDPOINT'],aws_access_key_id=values['S3_ACCESS_KEY_ID'],aws_secret_access_key=values['S3_SECRET_ACCESS_KEY'],
        config=Config(signature_version='s3v4',region_name='auto',connect_timeout=10,read_timeout=120,retries={'max_attempts':3},request_checksum_calculation='when_required',response_checksum_validation='when_required'))
    client.head_bucket(Bucket='abeiai')
    return client,values['S3_PUBLIC_BASE_URL'].rstrip('/')


class SourceObjects:
    def __init__(self,files):
        import oss2
        import requests
        self.config=env_values(files,{'OSS_ACCESS_KEY_ID','OSS_ACCESS_KEY_SECRET','OSS_BUCKET_NAME','OSS_DOMAIN','OSS_ENDPOINT','MEDIA_URL'})
        endpoint=urlparse(self.config['OSS_ENDPOINT'])
        if endpoint.scheme!='https' or not re.fullmatch(r'oss-[a-z0-9-]+\.aliyuncs\.com',endpoint.hostname or '') or '-internal.' in endpoint.hostname:
            raise ValueError('Expected confirmed public OSS object endpoint')
        allowed={f'{bucket}.{endpoint.hostname}' for bucket in [self.config['OSS_BUCKET_NAME'],'abei-filed']}
        class ReadOnlySession(requests.Session):
            def request(self,method,url,*args,**kwargs):
                if method.upper() not in {'GET','HEAD'}: raise ValueError('Source object writes are forbidden')
                validate_download_url(url,allowed)
                kwargs['allow_redirects']=False
                response=super().request(method,url,*args,**kwargs)
                if 300<=response.status_code<400:
                    response.close()
                    raise ValueError('OSS redirect requires independent origin validation')
                return response
        session=oss2.Session(pool_size=8)
        session.session=ReadOnlySession()
        session.session.trust_env=False
        session.session.mount('https://',pinned_adapter()[0])
        auth=oss2.Auth(self.config['OSS_ACCESS_KEY_ID'],self.config['OSS_ACCESS_KEY_SECRET'])
        self.buckets={bucket:oss2.Bucket(auth,self.config['OSS_ENDPOINT'],bucket,session=session,connect_timeout=60) for bucket in [self.config['OSS_BUCKET_NAME'],'abei-filed']}
        self.web=requests.Session()
        self.web.trust_env=False
        self.web.mount('https://',pinned_adapter()[0])

    def read(self,url):
        locator=source_locator(url,self.config)
        if locator['provider']=='INLINE':
            import io
            data=base64.b64decode(url.split(',',1)[1],validate=True)
            return io.BytesIO(data),{'contentLength':len(data),'consistencyStatus':'snapshot-inline'}
        if locator['provider']=='OSS':
            bucket=self.buckets[locator['bucket']]
            params={'versionId':locator['versionId']} if locator['versionId'] else None
            meta=bucket.head_object(locator['objectKey'],params=params)
            body=bucket.get_object(locator['objectKey'],headers={'If-Match':meta.etag},params=params)
            return body,{'contentLength':meta.content_length,'etag':meta.etag,'lastModified':meta.last_modified,
                'consistencyStatus':'snapshot-versioned' if locator['versionId'] else 'download-time-only'}
        # Only known pure object CDNs: never follow a legacy application or provider task API.
        host=urlparse(url).hostname or ''
        approved = host in {'mmbiz.qpic.cn','thirdwx.qlogo.cn','wx.qlogo.cn','avatars.githubusercontent.com'} or bool(re.fullmatch(r'[a-z0-9-]+\.oss-[a-z0-9-]+\.aliyuncs\.com|pub-[a-z0-9]+\.r2\.dev',host))
        if not approved: raise ValueError('Unclassified external media origin')
        safe=validate_download_url(url,{host})
        response=self.web.get(safe,timeout=(10,60),stream=True,allow_redirects=False)
        if response.status_code!=200:
            response.close()
            raise ValueError('External media missing, expired or redirected')
        response.raw.decode_content=True
        return response.raw,{'contentLength':int(response.headers['Content-Length']) if response.headers.get('Content-Length') and not response.headers.get('Content-Encoding') else None,'etag':response.headers.get('ETag'),'consistencyStatus':'download-time-only','response':response}


def transfer_one(origin,client,public_base,url,hint,source_system,max_bytes=1024*1024*1024):
    if url.startswith('data:') and len(url.split(',',1)[1])>4*((max_bytes+2)//3): raise ValueError('Inline media exceeds transfer limit before decoding')
    body,metadata=origin.read(url)
    try:
        with tempfile.TemporaryFile() as temporary:
            digest=hashlib.sha256()
            size=0
            head=b''
            for chunk in iter(lambda:body.read(1024*1024),b''):
                size+=len(chunk)
                if size>max_bytes: raise ValueError('Media exceeds configured transfer limit')
                if len(head)<256: head=(head+chunk)[:256]
                digest.update(chunk)
                temporary.write(chunk)
            if not size or (metadata.get('contentLength') is not None and size!=metadata['contentLength']): raise ValueError('Source media length mismatch')
            mime=mime_from_bytes(head,hint)
            result=upload_to_r2(client,'abeiai',f'picture-books/legacy-sync/{source_system}/',temporary,mime,size,digest.hexdigest())
            result.update({key:value for key,value in metadata.items() if key!='response'})
            result['publicUrl']=public_base+'/'+result['objectKey']
            return result
    finally:
        body.close()
        if metadata.get('response') is not None: metadata['response'].close()
