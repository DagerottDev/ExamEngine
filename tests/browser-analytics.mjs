import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import config from '../src/analytics-config.json' with {type:'json'};
import { CONSENT_KEY, IDENTIFIER_KEY } from '../src/core/usage-analytics.js';

// Serve the built distribution at its exact production URL, intercepting every capture.
// The fixture token never touches the source configuration or the real PostHog project.
export async function checkUsageAnalytics(browser, markup, output) {
 const tokenLine=`publicToken: ${JSON.stringify(config.publicToken)}`;
 assert.equal(markup.split(tokenLine).length,2,'Expected one bundled analytics config');
 const html=markup.replace(tokenLine,'publicToken: "phc_browser_fixture"');
 const production='https://dagerottdev.github.io/RecallForge/';
 const endpoint='https://us.i.posthog.com/i/v0/e/';
 const context=await browser.newContext({acceptDownloads:true});
 const events=[],errors=[];let blocked=false;
 await context.route('**/*',async route=>{
   const request=route.request();
   if(request.url().startsWith(endpoint)){
     events.push(JSON.parse(request.postData()));
     if(blocked)await route.abort('blockedbyclient');else await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"status":1}'});
   }else if(request.url()===production)await route.fulfill({contentType:'text/html',body:html});
   else await route.abort();
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 const nav=async(name)=>page.getByRole('button',{name,exact:true}).click();
 const settingsChoice=choice=>page.locator(`#settings-panel [data-analytics-consent="${choice}"]`);
 const waitEvent=async(name,count=1)=>{await page.waitForFunction(()=>document.querySelector('#appearance-open'));for(let i=0;i<100&&events.filter(e=>e.event===name).length<count;i++)await page.waitForTimeout(20);assert.equal(events.filter(e=>e.event===name).length,count,name);};
 const readPrivacy=()=>page.evaluate(keys=>keys.map(key=>localStorage.getItem(key)),[CONSENT_KEY,IDENTIFIER_KEY]);
 const submit=async()=>{await page.locator('#submit-btn').click();await page.getByRole('dialog',{name:'Confirm action'}).getByRole('button',{name:'Continue'}).click();await page.locator('#result-view').waitFor({state:'visible'});};
 try {
  await page.goto(production);await page.locator('#analytics-notice').waitFor({state:'visible'});
  assert.equal(events.length,0);assert.deepEqual(await readPrivacy(),[null,null]);
  await page.locator('#analytics-notice [data-analytics-consent="deny"]').click();await nav('Settings');assert.equal(events.length,0);assert.deepEqual(await readPrivacy(),['deny',null]);
  await page.reload();await page.locator('#appearance-open').waitFor({state:'attached'});assert.equal(events.length,0);await nav('Settings');await settingsChoice('allow').click();await waitEvent('app_opened');
  const firstId=(await readPrivacy())[1];assert.ok(firstId);assert.equal(events[0].properties.traffic,'direct');
  await nav('Home');await page.locator('#delivery-mode').selectOption('study');await page.locator('#load-sample-btn').click();await page.locator('#exam-view').waitFor({state:'visible'});await waitEvent('session_started');await waitEvent('pack_imported');
  assert.deepEqual(events.find(e=>e.event==='session_started').properties,{kind:'study',question_count:9,$process_person_profile:false,$geoip_disable:true});
  // Cancellation emits no completion; reloading/resuming never starts a second session.
  await page.locator('#submit-btn').click();await page.getByRole('dialog',{name:'Confirm action'}).getByRole('button',{name:'Cancel'}).click();assert.equal(events.filter(e=>e.event==='session_completed').length,0);
  await page.reload();await page.locator('#resume-btn').click();await page.getByRole('dialog',{name:'Confirm action'}).getByRole('button',{name:'Continue'}).click();await page.locator('#exam-view').waitFor({state:'visible'});await waitEvent('session_resumed');assert.equal(events.filter(e=>e.event==='session_started').length,1);
  await submit();await waitEvent('session_completed');await page.locator('#submit-btn').evaluate(button=>button.click());assert.equal(events.filter(e=>e.event==='session_completed').length,1);
  await page.locator('#new-exam-btn').click();await nav('Settings');await page.locator('#appearance-open').click();await page.locator('#pref-layout').selectOption('compact');await page.locator('#appearance-form button.primary').click();await waitEvent('appearance_applied');
  const downloadPromise=page.waitForEvent('download');await page.locator('#backup-export-form button.primary').click();const download=await downloadPromise;const backupPath=output+'/analytics-backup.json';await download.saveAs(backupPath);await waitEvent('backup_exported');
  const backupText=await (await import('node:fs/promises')).readFile(backupPath,'utf8');assert.ok(!backupText.includes(firstId));assert.ok(!backupText.includes(CONSENT_KEY));assert.ok(!backupText.includes(IDENTIFIER_KEY));
  await page.locator('#backup-input').setInputFiles(backupPath);await page.locator('[data-restore="merge"]').click();await page.locator('#backup-preview').waitFor({state:'hidden'});await waitEvent('backup_restored');assert.deepEqual(await readPrivacy(),['allow',firstId]);
  await nav('Settings');await page.locator('#backup-input').setInputFiles(backupPath);await page.locator('[data-restore="replace"]').click();await page.getByRole('dialog',{name:'Confirm action'}).getByRole('button',{name:'Cancel'}).click();assert.equal(events.filter(e=>e.event==='backup_restored').length,1);
  await page.locator('[data-restore="replace"]').click();await page.getByRole('dialog',{name:'Confirm action'}).getByRole('button',{name:'Continue'}).click();await waitEvent('backup_restored',2);assert.deepEqual(await readPrivacy(),['allow',firstId]);
  await nav('Settings');await page.locator('#restore-undo').click();await page.getByRole('dialog',{name:'Confirm action'}).getByRole('button',{name:'Continue'}).click();await page.getByText('Previous workspace restored.',{exact:true}).waitFor();assert.deepEqual(await readPrivacy(),['allow',firstId]);
  await nav('Settings');await page.locator('#appearance-open').click();await page.locator('#reset-appearance').click();await page.locator('#appearance-form button.primary').click();assert.deepEqual(await readPrivacy(),['allow',firstId]);
  const second=await context.newPage();await second.goto(production);await second.locator('#appearance-open').waitFor({state:'attached'});await settingsChoice('deny').click();await second.getByRole('button',{name:'Settings',exact:true}).click();await second.getByText('Analytics declined. No usage events are sent.',{exact:true}).waitFor();assert.equal((await readPrivacy())[1],null);
  const deniedCount=events.length;await nav('Library');await second.getByRole('button',{name:'Library',exact:true}).click();await page.waitForTimeout(100);assert.equal(events.length,deniedCount);
  await nav('Settings');await settingsChoice('allow').click();await nav('Library');assert.notEqual((await readPrivacy())[1],firstId);
  // Invalid file and publisher validation don't claim success. Then publish one valid pack.
  const imports=events.filter(e=>e.event==='pack_imported').length;await nav('Home');await page.locator('#file-input').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});await page.locator('#upload-error').waitFor({state:'visible'});assert.equal(events.filter(e=>e.event==='pack_imported').length,imports);
  await nav('Library');await page.locator('[data-edit]').first().click();await page.locator('#edit-question').fill('');await page.locator('#editor-form button.primary').click();await page.locator('#editor-errors').waitFor({state:'visible'});assert.equal(events.filter(e=>e.event==='pack_published').length,0);
  await page.locator('#edit-question').fill('Fixture question');await page.locator('#editor-form button.primary').click();await waitEvent('pack_published');
  blocked=true;await nav('Home');await page.locator('#load-sample-btn').click();await page.locator('#exam-view').waitFor({state:'visible'});await submit();await page.locator('#new-exam-btn').click();await nav('Settings');const blockedDownload=page.waitForEvent('download');await page.locator('#backup-export-form button.primary').click();await blockedDownload;
  assert.deepEqual(errors,[]);for(const event of events){assert.equal(event.api_key,'phc_browser_fixture');assert.equal(event.properties.$process_person_profile,false);assert.doesNotMatch(JSON.stringify(event),/Fixture question|Cell Biology|answers|score|packId|sessionId|filename|password/);}
  await page.screenshot({path:output+'/analytics-settings.png',fullPage:true});
  // Reads and writes both denied: analytics remains off and exam/backup still run.
  const storageContext=await browser.newContext({acceptDownloads:true});let storageRequests=0;
  await storageContext.route('**/*',route=>{if(route.request().url()===production)return route.fulfill({contentType:'text/html',body:html});storageRequests++;return route.abort();});
  await storageContext.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw Error('Injected storage denial');}}));
  const denied=await storageContext.newPage();await denied.goto(production);await denied.locator('#analytics-notice [data-analytics-consent="allow"]').click();await denied.locator('#delivery-mode').selectOption('study');await denied.locator('#load-sample-btn').click();await denied.locator('#exam-view').waitFor({state:'visible'});await denied.locator('#submit-btn').click();await denied.getByRole('dialog',{name:'Confirm action'}).getByRole('button',{name:'Continue'}).click();await denied.locator('#result-view').waitFor({state:'visible'});await denied.locator('#new-exam-btn').click();await denied.getByRole('button',{name:'Settings',exact:true}).click();const deniedDownload=denied.waitForEvent('download');await denied.locator('#backup-export-form button.primary').click();await deniedDownload;assert.equal(storageRequests,0);await storageContext.close();
  await writeFile(output+'/analytics.txt','PASS: consent, payload privacy, start/resume/completion, cancellation and validation, publish, appearance, backup merge/replace/undo isolation, reload, cross-tab withdrawal, ID rotation, blocked requests and storage denial\n');
  console.log('analytics: production-origin intercepted acceptance passed');
 } finally {await context.close();}
}
