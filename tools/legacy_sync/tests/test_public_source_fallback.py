import io
import unittest
from unittest.mock import patch
from tools.legacy_sync.object_transfer import SourceObjects


class PublicSourceFallback(unittest.TestCase):
    def test_invalid_old_storage_key_uses_only_known_public_object_origin_without_credentials(self):
        class InvalidKey(Exception): code='InvalidAccessKeyId'
        class Bucket:
            calls=0
            def head_object(self,*args,**kwargs): self.calls+=1;raise InvalidKey()
        class Response:
            status_code=200
            headers={'Content-Length':'8','ETag':'fixture'}
            def __init__(self): self.raw=io.BytesIO(b'\x89PNG\r\n\x1a\n')
            def close(self): self.raw.close()
        class Web:
            calls=[]
            def get(self,url,**kwargs): self.calls.append((url,kwargs));return Response()
        source=SourceObjects.__new__(SourceObjects)
        source.config={'OSS_BUCKET_NAME':'abei-cdn','OSS_DOMAIN':'https://cdn.abeiai.com/','OSS_ENDPOINT':'https://oss-cn-hangzhou.aliyuncs.com','MEDIA_URL':'/abei/'}
        bucket=Bucket();source.buckets={'abei-cdn':bucket};source.web=Web()
        with patch('tools.legacy_sync.object_transfer.validate_download_url',side_effect=lambda url,hosts:url):
            for _ in range(2):
                body,metadata=source.read('https://cdn.abeiai.com/abei/fixture.png?OSSAccessKeyId=expired&Signature=expired')
                self.assertEqual(body.read(),b'\x89PNG\r\n\x1a\n');body.close()
                self.assertEqual(metadata['sourceReadMethod'],'public-cdn-after-invalid-access-key')
        self.assertEqual(bucket.calls,1)
        self.assertEqual(source.web.calls[0][0],'https://cdn.abeiai.com/abei/fixture.png')
        self.assertFalse(source.web.calls[0][1]['allow_redirects'])
        self.assertNotIn('headers',source.web.calls[0][1])


if __name__=='__main__': unittest.main()
