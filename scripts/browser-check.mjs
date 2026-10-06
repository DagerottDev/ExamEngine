import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { decodeBackup, encodeBackup } from '../src/core/backup.js';
import { preparePack, createSession } from '../src/core/exam-engine.js';
import { checkUsageAnalytics } from '../tests/browser-analytics.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'output/browser');await mkdir(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'};
const server=http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))throw Error('Outside root');const bytes=await readFile(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes);}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;let browser,backupPath;
try{
 browser=await chromium.launch({headless:true});
 await checkUsageAnalytics(browser, await readFile(path.join(root,'mcq-exam-website/index.html'),'utf8'), output);
 for(const [file,label]of[['browser-harness.html','storage'],['browser-ui.html','workflows']]){
  const context=await browser.newContext({viewport:{width:1500,height:1050},acceptDownloads:true});const page=await context.newPage();const errors=[],downloads=[],external=[];
  page.on('pageerror',e=>{if(label==='storage'&&/Injected (full storage|attachment quota)/.test(e.message))return;errors.push(e.message);});
  page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(base+'/'))external.push(r.url());});
  page.on('download',download=>downloads.push(download));
  await page.goto(`${base}/tests/${file}`);
  await page.waitForFunction(()=>/^(PASS|FAIL)/.test(document.getElementById('summary').textContent),{},{timeout:90000});
  const result=await page.locator('#summary').innerText();const checks=await page.locator('#checks,#results').innerText();
  await writeFile(path.join(output,`${label}.txt`),`${checks}\n${result}\n${errors.join('\n')}\n`);
  await page.screenshot({path:path.join(output,`${label}.png`),fullPage:true});
  assert.match(result,/^PASS:/,result);assert.deepEqual(errors,[],'Unexpected browser errors');assert.deepEqual(external,[],'App requested external resources');
  if(label==='workflows'){
   assert.equal(downloads.length,3,'Expected adaptive, encrypted and plain backup downloads');
   for(let i=0;i<downloads.length;i++){const download=downloads[i];const name=`${i}-${path.basename(download.suggestedFilename())}`;await download.saveAs(path.join(output,name));const parsed=JSON.parse(await readFile(path.join(output,name),'utf8'));if(parsed.encryption)backupPath=path.join(output,name);}
   const app=page.frameLocator('#app');const navigation=page.waitForEvent('framenavigated',{predicate:frame=>frame.parentFrame()===page.mainFrame()});await page.locator('#app').evaluate(el=>el.contentWindow.location.reload());await navigation;await app.locator('#appearance-open').waitFor({state:'attached'});await app.locator('#settings-panel').waitFor({state:'hidden'});
   for(const [width,height]of[[390,844],[768,1024],[1440,900]]){await page.setViewportSize({width:width+40,height:height+220});await page.locator('#app').evaluate((el,size)=>{el.style.width=`${size.width}px`;el.style.height=`${size.height}px`;}, {width,height});await page.locator('#app').screenshot({path:path.join(output,`workspace-${width}.png`)});}
  }
  console.log(`${label}: ${result}`);await context.close();
 }
 // The actual distribution must also start directly from disk, without a server.
 const offline=await browser.newContext();const page=await offline.newPage();const requested=[];page.on('request',r=>{if(/^https?:/.test(r.url()))requested.push(r.url());});await page.goto(new URL('../mcq-exam-website/index.html',import.meta.url).href);await page.locator('#appearance-open').waitFor({state:'attached'});assert.deepEqual(requested,[],'Disk distribution requested a network resource');await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('#import-password').fill('fixture-password-123');await page.locator('#backup-input').setInputFiles(backupPath);await page.locator('#backup-preview').waitFor({state:'visible'});await page.locator('#restore-preferences').check();await page.locator('[data-restore="merge"]').click();await page.locator('#backup-preview').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Library',exact:true}).click();await page.getByText('Local source library',{exact:true}).click();await page.locator('.list-row').filter({hasText:'chapter.pdf'}).getByRole('button',{name:'Open',exact:true}).click();await page.locator('.textLayer').filter({hasText:'Chapter one fixture'}).waitFor();await page.locator('#source-next').click();await page.locator('.textLayer').filter({hasText:'Chapter two fixture'}).waitFor();await page.screenshot({path:path.join(output,'offline-pdf.png')});await page.locator('[data-close="source-dialog"]').click();
 const decoded=await decodeBackup(await readFile(backupPath,'utf8'),'fixture-password-123');const record=decoded.data.packs[0],pack=preparePack(record.pack);pack.delivery.mode='exam';const session={...createSession(pack,Date.now()-3600000),owner:'expired-fixture',originRecordId:record.id,revision:record.revision};decoded.data.session={pack,session};const expired=path.join(output,'expired-session-fixture.json');await writeFile(expired,JSON.stringify(await encodeBackup(decoded.data)));
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('#backup-input').setInputFiles(expired);await page.locator('#backup-preview').waitFor({state:'visible'});await page.locator('[data-restore="replace"]').click();await page.getByRole('dialog',{name:'Confirm action'}).getByRole('button',{name:'Continue'}).click();await page.locator('#backup-preview').waitFor({state:'hidden'});await page.locator('#resume-btn').click();await page.getByRole('dialog',{name:'Confirm action'}).getByRole('button',{name:'Continue'}).click();await page.locator('#result-view').waitFor({state:'visible'});assert.equal(await page.locator('#result-reason').innerText(),'Exam time expired','Expired backup session gained time');assert.deepEqual(requested,[],'Offline sources requested the network');await page.screenshot({path:path.join(output,'offline.png')});console.log('offline: file:// startup, encrypted backup import, PDF pages and expired-session resume; no network requests');await offline.close();
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
