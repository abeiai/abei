import io
import unittest
from tools.legacy_sync.assets import find_references, source_locator, validate_download_url, mime_from_bytes, upload_to_r2


class AssetTransfer(unittest.TestCase):
    def test_relative_html_and_extensionless_file_fields_are_not_silently_skipped(self):
        row={'sourceTable':'app_ai_chatmessage','sourcePk':'1','values':{'assistant_content':'<img src="/abei/opaque-image">','extra':'{"avatar":"avatar/fixture.png","audio":"abei/opaque-audio"}'}}
        refs=list(find_references(row))
        self.assertEqual(len(refs),3)
        self.assertEqual(refs[0]['originalUrl'],'/abei/opaque-image')
        self.assertEqual(refs[1]['originalUrl'],'avatar/fixture.png')
        config={'OSS_BUCKET_NAME':'abei-cdn','OSS_DOMAIN':'https://cdn.abeiai.com/','OSS_ENDPOINT':'https://oss-cn-hangzhou.aliyuncs.com','MEDIA_URL':'/abei/'}
        self.assertEqual(source_locator(refs[1]['originalUrl'],config)['objectKey'],'avatar/fixture.png')

    def test_nested_json_and_markup_keep_all_reference_positions(self):
        row = {'sourceTable':'app_ai_drawmessage','sourcePk':'10','values':{'id':'10','user_id':'3','results':'["https://cdn.abeiai.com/a.png","https://cdn.abeiai.com/a.png"]','extra':'{"reference":{"character":["https://cdn.abeiai.com/ref.webp"]}}','prompt':'<img src="https://cdn.abeiai.com/p.png">'}}
        refs = list(find_references(row))
        self.assertEqual(len(refs),4)
        self.assertEqual([r['fieldPath'] for r in refs[:2]],['/results/0','/results/1'])
        self.assertEqual(refs[0]['sourceUserId'],'3')
        self.assertNotEqual(refs[0]['referenceId'],refs[1]['referenceId'])
        self.assertEqual(refs[0]['objectId'],refs[1]['objectId'])

    def test_known_oss_domains_and_relative_media_resolve_to_original_objects(self):
        config={'OSS_BUCKET_NAME':'abei-cdn','OSS_DOMAIN':'https://cdn.abeiai.com/','OSS_ENDPOINT':'https://oss-cn-hangzhou.aliyuncs.com','MEDIA_URL':'/abei/'}
        self.assertEqual(source_locator('https://cdn.abeiai.com/abei/test%20image.png?OSSAccessKeyId=fixture',config)['objectKey'],'abei/test image.png')
        self.assertEqual(source_locator('https://filed.abeiai.com/docs/a.pdf',config)['bucket'],'abei-filed')
        self.assertEqual(source_locator('/abei/output.mp3',config)['objectKey'],'abei/output.mp3')

    def test_internal_addresses_credentials_and_business_apis_are_never_downloaded(self):
        allowed={'cdn.abeiai.com'}
        for url in ['http://127.0.0.1/x.png','https://169.254.169.254/latest.png','https://abei.example/api/share/1','https://user:password@cdn.abeiai.com/x.png']:
            with self.assertRaises(ValueError): validate_download_url(url,allowed,lambda host:['127.0.0.1'])
        with self.assertRaises(ValueError): validate_download_url('https://cdn.abeiai.com/x.png',allowed,lambda host:['10.0.0.1'])
        self.assertEqual(validate_download_url('https://cdn.abeiai.com/x.png',allowed,lambda host:['1.1.1.1']),'https://cdn.abeiai.com/x.png')

    def test_media_signature_rejects_html_errors_and_identifies_image_audio_video(self):
        self.assertEqual(mime_from_bytes(b'\x89PNG\r\n\x1a\n' + b'0'*30,'image'),'image/png')
        self.assertEqual(mime_from_bytes(b'RIFF'+b'0'*4+b'WAVE'+b'0'*30,'audio'),'audio/wav')
        self.assertEqual(mime_from_bytes(b'\x00\x00\x00\x18ftypisom'+b'0'*30,'video'),'video/mp4')
        with self.assertRaises(ValueError): mime_from_bytes(b'<html>Access denied</html>','image')

    def test_r2_upload_never_overwrites_and_checks_remote_size_and_digest(self):
        class Missing(Exception):
            response={'Error':{'Code':'404'}}
        class Client:
            calls=[]
            metadata=None
            def head_object(self, **kwargs):
                self.calls.append(('HEAD',kwargs))
                if self.metadata is None: raise Missing()
                return self.metadata
            def put_object(self, **kwargs):
                self.calls.append(('PUT',kwargs))
                self.metadata={'ContentLength':3,'Metadata':kwargs['Metadata']}
                return {'ETag':'fixture'}
        client=Client()
        result=upload_to_r2(client,'abeiai','legacy-sync/abeiai-v1/',io.BytesIO(b'abc'),'image/png',3,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
        self.assertEqual(result['status'],'AVAILABLE')
        puts=[kwargs for method,kwargs in client.calls if method=='PUT']
        self.assertEqual(len(puts),1)
        self.assertEqual(puts[0]['IfNoneMatch'],'*')
        self.assertEqual(puts[0]['Bucket'],'abeiai')
        upload_to_r2(client,'abeiai','legacy-sync/abeiai-v1/',io.BytesIO(b'abc'),'image/png',3,result['sha256'])
        self.assertEqual(len([x for x in client.calls if x[0]=='PUT']),1)
        client.metadata={'ContentLength':4,'Metadata':{'sha256':'wrong'}}
        with self.assertRaises(ValueError): upload_to_r2(client,'abeiai','legacy-sync/abeiai-v1/',io.BytesIO(b'abc'),'image/png',3,result['sha256'])


if __name__ == '__main__': unittest.main()
