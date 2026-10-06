import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createUsageAnalytics, CONSENT_KEY, IDENTIFIER_KEY } from '../src/core/usage-analytics.js';
const settings = { publicToken:'phc_test_public_token', origin:'https://dagerottdev.github.io', paths:['/ExamEngine/','/ExamEngine/index.html'] };
function fixture(overrides = {}) {
  const storage = new Map(), requests = [];
  const env = { location:new URL(settings.origin+'/ExamEngine/'), navigator:{onLine:true}, crypto:{randomUUID}, document:{referrer:'https://reddit.com/r/study?private=secret'}, localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}, fetch:(url,options)=>{requests.push({url,...options,payload:JSON.parse(options.body)});return Promise.resolve();}, ...overrides };
  return { env, storage, requests, analytics:createUsageAnalytics(env,settings) };
}
test('analytics is off before consent, denied, offline, unconfigured, and outside exact production URLs', () => {
  const f=fixture();f.analytics.track('session_started',{kind:'study',question_count:3});assert.equal(f.requests.length,0);assert.equal(f.storage.has(IDENTIFIER_KEY),false);
  f.analytics.setConsent('deny');assert.equal(f.requests.length,0);assert.equal(f.storage.has(IDENTIFIER_KEY),false);
  for(const url of ['http://localhost/ExamEngine/','file:///ExamEngine/index.html','https://fork.github.io/ExamEngine/','https://dagerottdev.github.io/ExamEngine/preview','https://dagerottdev.github.io/ExamEngine-other/']){
    const local=fixture({location:new URL(url)});local.analytics.setConsent('allow');local.analytics.track('pack_published',{question_count:2});assert.equal(local.requests.length,0);assert.equal(local.storage.has(IDENTIFIER_KEY),false);
  }
  const offline=fixture({navigator:{onLine:false}});offline.analytics.setConsent('allow');assert.equal(offline.requests.length,0);assert.equal(offline.storage.has(IDENTIFIER_KEY),false);
  const empty=fixture();createUsageAnalytics(empty.env,{...settings,publicToken:''}).setConsent('allow');assert.equal(empty.requests.length,0);
});
test('fixed event schema discards study content, rejects unknown events, and sends personless events without referrer or credentials', () => {
  const f=fixture();f.analytics.setConsent('allow');
  assert.equal(f.requests[0].payload.properties.traffic,'Reddit');
  const cases={session_started:{kind:'study',question_count:4},session_resumed:{kind:'exam'},session_completed:{kind:'mock',submission:'timer'},pack_imported:{source:'file',result:'deduplicated'},pack_published:{question_count:5},backup_exported:{encrypted:true},backup_restored:{mode:'merge'},appearance_applied:{preset:'compact'}};
  for(const [event,properties] of Object.entries(cases)){
    f.analytics.track(event,{...properties,question:'secret question',score:98,sessionId:'private-id',filename:'private.txt',url:'https://private',password:'private'});
    const request=f.requests.at(-1);assert.equal(request.payload.event,event);
    assert.deepEqual(request.payload.properties,{...properties,$process_person_profile:false,$geoip_disable:true});
    assert.equal(request.credentials,'omit');assert.equal(request.referrerPolicy,'no-referrer');assert.equal(request.url,'https://us.i.posthog.com/i/v0/e/');assert.doesNotMatch(request.body,/secret|private/);
  }
  const length=f.requests.length;f.analytics.track('unknown',{question:'secret'});f.analytics.track('constructor',{});assert.equal(f.requests.length,length);
  f.analytics.track('session_started',{kind:'private',question_count:'4'});assert.deepEqual(f.requests.at(-1).payload.properties,{$process_person_profile:false,$geoip_disable:true});
});
test('reload, withdrawal and cross-tab consent preserve privacy and rotate identifiers', () => {
  const f=fixture();f.analytics.viewScreen('settings');f.analytics.setConsent('allow');const first=f.storage.get(IDENTIFIER_KEY);
  f.analytics.activate();assert.equal(f.requests.filter(r=>r.payload.event==='app_opened').length,1);assert.equal(f.requests[1].payload.properties.screen,'settings');
  f.analytics.viewScreen('settings');assert.equal(f.requests.length,2);f.analytics.viewScreen('library');assert.equal(f.requests.length,3);
  const second=createUsageAnalytics(f.env,settings);second.activate();assert.equal(f.storage.get(IDENTIFIER_KEY),first);
  second.setConsent('deny');assert.equal(f.storage.has(IDENTIFIER_KEY),false);const n=f.requests.length;f.analytics.track('session_completed',{kind:'study',submission:'manual'});assert.equal(f.requests.length,n);
  f.analytics.setConsent('allow');f.analytics.track('session_resumed',{kind:'study'});assert.notEqual(f.storage.get(IDENTIFIER_KEY),first);assert.equal(f.requests.filter(r=>r.payload.event==='app_opened').length,2);
});
test('capture timestamps preserve action order even within one millisecond or a backward clock adjustment', t => {
  let now=Date.parse('2026-10-06T14:00:00Z');t.mock.method(Date,'now',()=>now);
  const f=fixture();f.analytics.setConsent('allow');
  f.analytics.track('session_started',{kind:'exam',question_count:9});now-=100;
  f.analytics.track('session_completed',{kind:'exam',submission:'manual'});
  const times=f.requests.map(r=>Date.parse(r.payload.timestamp));
  assert.equal(times[0],Date.parse('2026-10-06T14:00:00Z'));
  for(let i=1;i<times.length;i++)assert.equal(times[i],times[i-1]+1);
});
test('storage failures and rejected/synchronous fetch failures never escape to app workflows', async () => {
  const denied=fixture({localStorage:{getItem(){throw Error('denied');},setItem(){throw Error('denied');},removeItem(){throw Error('denied');}}});assert.equal(denied.analytics.setConsent('allow'),false);assert.doesNotThrow(()=>denied.analytics.track('session_started',{kind:'exam',question_count:9}));assert.equal(denied.requests.length,0);
  const quota=fixture();quota.analytics.setConsent('allow');const n=quota.requests.length;quota.env.localStorage.setItem=()=>{throw Error('quota');};assert.equal(quota.analytics.setConsent('deny'),false);quota.analytics.track('session_resumed',{kind:'exam'});assert.equal(quota.requests.length,n);
  for(const fetch of [()=>Promise.reject(Error('blocked')),()=>{throw Error('offline');}]){const f=fixture({fetch});assert.doesNotThrow(()=>f.analytics.setConsent('allow'));assert.doesNotThrow(()=>f.analytics.track('backup_exported',{encrypted:false}));}
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(denied.storage.has(CONSENT_KEY),false);
});
