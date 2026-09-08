import {rootCertificates,getCACertificates} from 'node:tls';
import {writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {X509Certificate} from 'node:crypto';
/** Give headless Codex the same public/system roots as Node, never an unverified peer certificate. */
export function codexTrustFile(home:string):string{
 const file=path.join(home,'trusted-roots.pem');mkdirSync(home,{recursive:true,mode:0o700});
 const certificates=new Set(rootCertificates);for(const certificate of getCACertificates('system'))if(new X509Certificate(certificate).ca)certificates.add(certificate);
 writeFileSync(file,[...certificates].join('\n')+'\n',{mode:0o600});return file;
}
