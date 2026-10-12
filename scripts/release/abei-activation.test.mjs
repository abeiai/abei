import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, renameSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
const root=resolve(import.meta.dirname,'../..');
const quote=value=>`'${value.replaceAll("'", "'\\''")}'`;

function activationHarness(dir, project, webFails) {
  const source=readFileSync(process.env.ABEI_TEST_ACTIVATION_SOURCE ?? join(root,'scripts/release/abei-server-release.sh'),'utf8');
  const activation=source.slice(source.indexOf('"${compose[@]}" up -d --no-deps api-core web ai-gateway'));
  return `set -euo pipefail
compose=(fixture_compose)
sha=local
backup=${quote(dir)}
probe_script=${quote(join(root,'scripts/release/abei-ingress-probe.mjs'))}
fixture_compose() {
  case "$*" in
    'up -d --no-deps api-core web ai-gateway') return 0 ;;
    'exec -T api-core '*) return 0 ;;
    'exec -T web '*) return ${webFails ? '1' : '0'} ;;
    'exec -T ai-gateway '*) return 0 ;;
    *) if [[ ${webFails ? '1' : '0'} == 1 ]]; then return 0; fi; command docker compose --env-file ${quote(join(dir,'env'))} -p ${quote(project)} -f ${quote(join(dir,'compose.json'))} "$@" ;;
  esac
}
sleep() { :; }
docker() {
  if [[ "$1" == run ]]; then
    shift
    command docker run -e NODE_EXTRA_CA_CERTS=/fixture-ca.pem -v ${quote(join(dir,'certs/live/mcp.abeiai.com/fullchain.pem')+':/fixture-ca.pem:ro')} "$@"
    [[ -f deploy/data/state/maintenance.enabled ]]
    command docker run --rm --read-only --network "container:$(fixture_compose ps -q abei)" --entrypoint node -e NODE_EXTRA_CA_CERTS=/fixture-ca.pem -v ${quote(join(dir,'certs/live/mcp.abeiai.com/fullchain.pem')+':/fixture-ca.pem:ro')} -v ${quote(join(dir,'maintenance.mjs')+':/maintenance.mjs:ro')} abei-api-core:local /maintenance.mjs
  else command docker "$@"; fi
}
${activation}`;
}

test('API success with an unhealthy Web keeps maintenance and never activates ingress', () => {
  const dir=mkdtempSync(join(tmpdir(),'abei-web-readiness-'));
  try {
    mkdirSync(join(dir,'deploy/data/state'),{recursive:true});writeFileSync(join(dir,'deploy/data/state/maintenance.enabled'),'');
    const result=spawnSync('bash',['-c',activationHarness(dir,'abei-never-started',true)],{cwd:dir,encoding:'utf8'});
    assert.ok(existsSync(join(dir,'deploy/data/state/maintenance.enabled')), 'failed Web must retain maintenance');
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/服务就绪检查失败/);
    assert.doesNotMatch(result.stderr,/compose\.json|no such file/i,'must fail before invoking ingress');
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('existing ingress is recreated after config inode replacement and probed before maintenance lifts', {timeout:60_000}, () => {
  const dir=mkdtempSync(join(tmpdir(),'abei-activation-'));
  const project=`abei-activation-${process.pid}`;
  const composeArgs=['compose','--env-file',join(dir,'env'),'-p',project,'-f',join(dir,'compose.json')];
  const docker=(args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  try {
    mkdirSync(join(dir,'certs/live/mcp.abeiai.com'),{recursive:true});
    mkdirSync(join(dir,'certs/live/new.abeiai.com'),{recursive:true});
    mkdirSync(join(dir,'deploy/data/state'),{recursive:true});
    writeFileSync(join(dir,'deploy/data/state/maintenance.enabled'),'');writeFileSync(join(dir,'env'),'');
    const cert=join(dir,'certs/live/mcp.abeiai.com');
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(cert,'privkey.pem'),'-out',join(cert,'fullchain.pem'),'-days','1','-subj','/CN=mcp.abeiai.com','-addext','subjectAltName=DNS:mcp.abeiai.com,DNS:new.abeiai.com'],{stdio:'ignore'});
    for (const file of ['fullchain.pem','privkey.pem']) writeFileSync(join(dir,'certs/live/new.abeiai.com',file),readFileSync(join(cert,file)));
    writeFileSync(join(dir,'maintenance.mjs'), `import assert from 'node:assert/strict'; import https from 'node:https';
for (const host of ['new.abeiai.com','mcp.abeiai.com']) {
  const status = await new Promise((resolve,reject) => { const request=https.get({hostname:'127.0.0.1',port:3610,localAddress:'127.0.0.2',servername:host,path:'/creator',headers:{Host:host,'X-Forwarded-For':'127.0.0.1','X-Real-IP':'127.0.0.1'}},response=>{response.resume();resolve(response.statusCode)}); request.on('error',reject); });
  assert.equal(status,503,'non-probe sources must stay in maintenance despite spoofed headers');
}`);
    writeFileSync(join(dir,'active.conf'),'server { listen 3610 ssl; server_name new.abeiai.com; ssl_certificate /etc/letsencrypt/live/new.abeiai.com/fullchain.pem; ssl_certificate_key /etc/letsencrypt/live/new.abeiai.com/privkey.pem; location / { return 200 "old-ingress"; } }');
    writeFileSync(join(dir,'backend.conf'),`server { listen 3601; location / { return 200 "阿贝绘本创作助手"; } }
server { listen 3602;
 location = /api/creator-auth/metadata { return 200 '{"issuer":"https://mcp.abeiai.com","token_endpoint":"https://mcp.abeiai.com/oauth/token"}'; }
 location = /api/creator-auth/resource-metadata { if ($arg_resource = api) { return 200 '{\"resource\":\"https://mcp.abeiai.com/api/creator/v1\"}'; } return 200 '{"resource":"https://mcp.abeiai.com/$arg_resource"}'; }
 location = /api/creator-mcp { add_header WWW-Authenticate 'Bearer resource_metadata="https://mcp.abeiai.com/.well-known/oauth-protected-resource/mcp"' always; return 401; }
}`);
    writeFileSync(join(dir,'compose.json'),JSON.stringify({services:{abei:{image:'nginx:1.27-alpine',network_mode:'none',extra_hosts:{'api-core':'127.0.0.1',web:'127.0.0.1'},volumes:[`${dir}/active.conf:/etc/nginx/conf.d/default.conf:ro`,`${dir}/backend.conf:/etc/nginx/conf.d/backend.conf:ro`,`${dir}/certs:/etc/letsencrypt:ro`,`${dir}/deploy/data/state:/var/www/state:ro`]}}}));
    docker([...composeArgs,'up','-d']);const before=docker([...composeArgs,'ps','-q','abei']).trim();
    // Reproduce rsync replacement of an individually bind-mounted file.
    writeFileSync(join(dir,'replacement.conf'),readFileSync(join(root,'deploy/abei/production.conf')));
    renameSync(join(dir,'replacement.conf'),join(dir,'active.conf'));
    const result=spawnSync('bash',['-c',activationHarness(dir,project,false)],{cwd:dir,encoding:'utf8',timeout:45_000});
    assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
    const after=docker([...composeArgs,'ps','-q','abei']).trim();
    assert.notEqual(after,before,'must replace the existing container, not merely run nginx -t');
    assert.ok(!existsSync(join(dir,'deploy/data/state/maintenance.enabled')));
    const output=docker(['exec',after,'wget','--no-check-certificate','-qO-','--header','Host: mcp.abeiai.com','https://127.0.0.1:3610/.well-known/oauth-authorization-server']);
    assert.equal(JSON.parse(output).issuer,'https://mcp.abeiai.com');
  } finally {spawnSync('docker',[...composeArgs,'down'],{stdio:'ignore'});rmSync(dir,{recursive:true,force:true});}
});
