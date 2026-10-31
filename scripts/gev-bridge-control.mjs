// Local operator control; never commit or log credentials.
import { createHash } from 'node:crypto';
import { loadCredentials, BRIDGE_STATE_DIR } from './gev-bridge-security.mjs';
const keys=loadCredentials();
const cmd=process.argv[2]||'status';
const finger=(s)=>createHash('sha256').update(s).digest('hex').slice(0,10);
if(cmd==='status') {
  console.log('Bridge state directory:',BRIDGE_STATE_DIR);
  console.log('Keys present: LIM',finger(keys.limToken),'GEV',finger(keys.gevToken),'admin',finger(keys.adminToken));
} else if(cmd==='pair-lim' || cmd==='pair-gev') {
  const role=cmd==='pair-lim'?'limToken':'gevToken';
  console.log('LOCAL DEMO ONLY: paste this value in the matching browser pairing box. Never commit or share it.');
  console.log(keys[role]);
} else if(cmd==='reset') {
  const port=Number(process.env.GEV_BRIDGE_PORT||8617);
  const r=await fetch('http://127.0.0.1:'+port+'/admin/reset',{
    method:'POST',headers:{Authorization:'Bearer '+keys.adminToken}});
  if(!r.ok)throw Error('reset refused HTTP '+r.status);
  console.log('Demo receipt reset accepted; auth keys retained. Response:',await r.text());
} else {
  console.error('Usage: node scripts/gev-bridge-control.mjs [status|pair-lim|pair-gev|reset]');
  process.exitCode=2;
}
