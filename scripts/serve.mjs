import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const files={'/':'index.html','/index.html':'index.html','/styles.css':'styles.css','/app.mjs':'app.mjs','/core.mjs':'core.mjs'};
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',mjs:'text/javascript; charset=utf-8'};
createServer(async(req,res)=>{
 try{
  const p=new URL(req.url,'http://localhost').pathname,file=Object.hasOwn(files,p)?files[p]:null;
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
  if(!file){res.writeHead(404).end('Not found');return;}
  const body=await readFile(new URL('../public/'+file,import.meta.url));
  res.writeHead(200,{'Content-Type':types[file.split('.').at(-1)],'X-Content-Type-Options':'nosniff'}).end(req.method==='GET'?body:undefined);
 }catch{res.writeHead(500).end('Local preview error');}
}).listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log('Crossing Watch local preview'));
