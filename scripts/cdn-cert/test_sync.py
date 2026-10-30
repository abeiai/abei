import unittest
from unittest.mock import Mock
import sync

class SyncTests(unittest.TestCase):
    def test_current_certificate_does_not_update(self):
        api = Mock()
        probe = Mock(return_value='abc')
        self.assertEqual(sync.reconcile(api, probe, 'abc', 'cert', 'key'), 'current')
        api.assert_not_called()

    def test_changed_certificate_updates_only_certificate_configuration(self):
        api = Mock(return_value={'RequestId': 'id'})
        probe = Mock(side_effect=['old', 'abc'])
        self.assertEqual(sync.reconcile(api, probe, 'abc', 'cert', 'key', attempts=1, delay=0), 'updated')
        action, payload = api.call_args.args
        self.assertEqual(action, 'ModifyDomainConfig')
        self.assertEqual(payload['Route'], 'Https.CertInfo')
        self.assertEqual(payload['Domain'], 'cc.abeiai.com')
        self.assertEqual(sync.json.loads(payload['Value'])['update'], {'Certificate':'cert','PrivateKey':'key'})

    def test_failure_to_deploy_is_an_error_for_retry(self):
        api = Mock(return_value={'RequestId':'id'})
        probe = Mock(return_value='old')
        with self.assertRaises(RuntimeError):
            sync.reconcile(api, probe, 'new', 'cert', 'key', attempts=2, delay=0)

    def test_probe_failure_triggers_certificate_recovery(self):
        api = Mock(return_value={'RequestId':'id'})
        probe = Mock(side_effect=[OSError('unavailable'), 'new'])
        self.assertEqual(sync.reconcile(api, probe, 'new', 'cert', 'key', attempts=1, delay=0), 'updated')
        api.assert_called_once()

    def test_credential_storage_rejects_insecure_permissions(self):
        import os, tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); root.chmod(0o700)
            for name in ('host.key','credentials.enc'):
                (root/name).write_bytes(b'x'); (root/name).chmod(0o600)
            sync.check_storage(root, os.geteuid())
            (root/'credentials.enc').chmod(0o640)
            with self.assertRaises(PermissionError): sync.check_storage(root, os.geteuid())

    def test_submitted_certificate_is_recorded_before_verification(self):
        api=Mock(return_value={'RequestId':'id'}); pending=Mock(); probe=Mock(return_value='old')
        with self.assertRaises(RuntimeError):
            sync.reconcile(api, probe, 'new', 'cert', 'key', attempts=1, delay=0, on_submit=pending)
        pending.assert_called_once()

    def test_recent_pending_submission_is_not_resent(self):
        self.assertTrue(sync.waiting_for_deployment({'fingerprint':'abc','status':'pending','submitted_at':100},'abc',101))
        self.assertFalse(sync.waiting_for_deployment({'fingerprint':'abc','status':'pending','submitted_at':100},'abc',100+13*3600))
        self.assertFalse(sync.waiting_for_deployment({'fingerprint':'abc','status':'pending','submitted_at':100},'different',101))

    def test_untrusted_certificate_chain_is_rejected(self):
        with self.assertRaises(ValueError): sync.verify_chain(b'not a certificate')

class CertificateTests(unittest.TestCase):
    def make_certificate(self, name, cert_key, validity=10):
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        import datetime
        now=datetime.datetime.utcnow()
        cert=(x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,name)]))
              .issuer_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,name)]))
              .public_key(cert_key.public_key()).serial_number(x509.random_serial_number())
              .not_valid_before(now-datetime.timedelta(minutes=1)).not_valid_after(now+datetime.timedelta(days=validity))
              .add_extension(x509.SubjectAlternativeName([x509.DNSName(name)]),critical=False)
              .sign(cert_key,hashes.SHA256()))
        return cert.public_bytes(serialization.Encoding.PEM)

    def test_certificate_must_match_domain_and_private_key_and_remain_valid(self):
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization
        key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
        other=rsa.generate_private_key(public_exponent=65537,key_size=2048)
        pem=lambda k:k.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())
        self.assertEqual(len(sync.certificate_fingerprint(self.make_certificate(sync.DOMAIN,key),pem(key))),64)
        for cert,private in [(self.make_certificate('wrong.example',key),pem(key)),(self.make_certificate(sync.DOMAIN,key),pem(other)),(self.make_certificate(sync.DOMAIN,key,2),pem(key))]:
            with self.assertRaises(ValueError): sync.certificate_fingerprint(cert,private)

if __name__ == '__main__': unittest.main()
