import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePreferences } from '../src/core/preferences.js';
test('backup preferences accept only supported values and preserve complete unique card order',()=>{
 const p=normalizePreferences({theme:'dark',questionFont:'lora',textSize:'999px',width:999,motion:'animate-forever',cards:['notebook','unknown','notebook']});
 assert.equal(p.theme,'dark');assert.equal(p.questionFont,'lora');assert.equal(p.textSize,18);assert.equal(p.width,70);assert.equal(p.motion,'auto');assert.deepEqual(p.cards,['notebook','due','recent','weak']);
 assert.equal(normalizePreferences(null).theme,'system');
});
