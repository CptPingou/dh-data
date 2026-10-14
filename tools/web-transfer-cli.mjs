#!/usr/bin/env node
// Offline local staging only. NOT a multi-user server or an authority handoff.
import fs from 'node:fs';
import path from 'node:path';
import {assertEnvelope,toWebView} from '../web/expedition-transfer.mjs';
const [command,input,output]=process.argv.slice(2);
const usage='Usage: node tools/web-transfer-cli.mjs inspect <transfer.json> | stage <transfer.json> <directory> | checkout <directory/expeditionId.json> <output.json>';
function read(p){return assertEnvelope(JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')));}
function write(p,data){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(data,null,2)+'\n','utf8');}
try {
 if(command==='inspect' && input){const t=read(input),v=toWebView(t); console.log(JSON.stringify({expeditionId:v.expeditionId,revision:v.revision,authority:v.authority,characters:v.characters.map(c=>c.name),backpackEntries:v.characters.reduce((n,c)=>n+c.backpack.contents.length,0),caravanEntries:v.caravan.containers.reduce((n,c)=>n+c.contents.length,0),revelations:v.revelations.length},null,2));}
 else if(command==='stage' && input && output){const t=read(input);const dest=path.join(output,`${t.expeditionId}.json`);if(fs.existsSync(dest)){const old=read(dest);if(old.expeditionId!==t.expeditionId || t.revision<=old.revision) throw Error(`Révision non supérieure: reçu ${t.revision}, stocké ${old.revision}`);}write(dest,t);console.log('STAGED',dest,'revision',t.revision);}
 else if(command==='checkout' && input && output){const t=read(input);write(output,t);console.log('CHECKOUT',output,'revision',t.revision);}
 else {console.error(usage);process.exitCode=2;}
} catch(e){console.error('ERROR:',e.message);process.exitCode=1;}
