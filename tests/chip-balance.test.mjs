import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/poker-engine.js';
const E=globalThis.PokerEngine;

test('500 simulated hands conserve chips at every action and at payout',()=>{
 for(let n=0;n<500;n++){
  const hand=E.createHand();
  const total=hand.originalStacks.reduce((a,b)=>a+b,0);
  const stacks=hand.init.map(p=>p.stack);
  let pot=hand.initialPot;
  assert.equal(stacks.reduce((a,b)=>a+b,0)+pot,total,'initial blinds');
  for(const [round,events] of hand.events.entries()){
   for(const action of events){
    assert.ok(action.put>=0,'negative investment');
    assert.ok(action.stack>=0,'negative stack');
    assert.ok(action.pot>=pot,'pot decreased while betting');
    assert.equal(stacks[action.id]-action.stack,action.put,'stack decrease differs from invested chips');
    stacks[action.id]=action.stack;
    pot=action.pot;
    assert.equal(stacks.reduce((a,b)=>a+b,0)+pot,total,`round ${round} action ${action.action}`);
   }
  }
  assert.equal(hand.totalBefore,total);
  assert.equal(hand.totalAfter,total);
  assert.equal(hand.final.reduce((a,p)=>a+p.stack,0),total,'final payouts');
  assert.equal(hand.pots.reduce((a,p)=>a+p.amount,0)+hand.refunds.reduce((a,r)=>a+r.amount,0),pot,'pot distribution');
 }
});
