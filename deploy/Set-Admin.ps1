param([Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9._+\-]+@[A-Za-z0-9.\-]+$')][string]$Email,[ValidateSet('admin','user')][string]$Role='admin')
$ErrorActionPreference='Stop'
$options=@{email=$Email.Trim().ToLowerInvariant();role=$Role} | ConvertTo-Json -Compress
$encoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($options))
$command=@'
runtime\node.exe -e "const {DatabaseSync}=require('node:sqlite'),fs=require('node:fs'),path=require('node:path');const options=JSON.parse(Buffer.from('OPTIONS_BASE64','base64').toString('utf8')),root=path.join(process.env.HOME,'data','choirloom'),db=new DatabaseSync(path.join(root,'choirloom.sqlite'));db.exec('PRAGMA busy_timeout=5000');const user=db.prepare('SELECT id,email FROM users WHERE email=?').get(options.email);if(!user)throw Error('Account must already exist');const backups=path.join(root,'backups');fs.mkdirSync(backups,{recursive:true});const backup=path.join(backups,'before-role-change-'+Date.now()+'.sqlite');db.prepare('VACUUM INTO ?').run(backup);if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='role'))db.exec('ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT '+String.fromCharCode(39)+'user'+String.fromCharCode(39));db.prepare('UPDATE users SET role=? WHERE id=?').run(options.role,user.id);console.log(JSON.stringify({email:user.email,role:db.prepare('SELECT role FROM users WHERE id=?').get(user.id).role,backupCreated:true}));db.close();"
'@
& (Join-Path $PSScriptRoot 'Azure-Command.ps1') -Command $command.Replace('OPTIONS_BASE64',$encoded)
