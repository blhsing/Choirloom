import nodemailer from 'nodemailer';
import { mkdirSync,writeFileSync } from 'node:fs';
import path from 'node:path';
import { dataDir,token,hash,run,HttpError } from './db.ts';
export const origin=process.env.APP_ORIGIN||'http://localhost:5173';
export async function sendMail(to:string,subject:string,text:string){if(!process.env.SMTP_HOST){if(process.env.NODE_ENV==='production')throw new HttpError(503,'mailUnavailable');const out=path.join(dataDir,'mail');mkdirSync(out,{recursive:true,mode:0o700});writeFileSync(path.join(out,`${Date.now()}-${token().slice(0,6)}.json`),JSON.stringify({to,subject,text}),{mode:0o600});return;}
 const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_PORT==='465',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}:undefined});await transport.sendMail({from:process.env.MAIL_FROM,to,subject,text,disableFileAccess:true,disableUrlAccess:true});}
export async function sendToken(user:any,kind:'verify'|'reset'){const value=token();run('INSERT INTO tokens VALUES(?,?,?,?)',hash(value),user.id,kind,Date.now()+30*60_000);await sendMail(user.email,kind==='verify'?'Choirloom · 驗證電子郵件 / Verify email':'Choirloom · 重設密碼 / Reset password',`${kind==='verify'?'驗證您的電子郵件 / Verify your email':'重設您的密碼 / Reset your password'}\n${origin}${process.env.APP_BASE||''}/?${kind}=${value}\n此連結將於 30 分鐘後失效。This link expires in 30 minutes.`);}
