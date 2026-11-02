import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/poker-engine.js';
import { estimateShowdownShare, replayFrame, replaySteps } from '../src/replay.js';
const E=globalThis.PokerEngine;

function withSeed(seed, callback) {
 const original=Math.random;
 let state=seed>>>0;
 Math.random=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};
 try{return callback();}finally{Math.random=original;}
}

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

test('short all-ins create eligible side pots, return unmatched chips, and preserve payouts',()=>{
 const hand=withSeed(1,()=>E.createHand({stacks:[40,80,160,300,600,1200,1800,2400,3000]}));
 assert.ok(hand.events.flat().some(action=>action.action==='All-in'));
 assert.deepEqual(hand.pots.map(pot=>({amount:pot.amount,eligible:pot.eligible})),[
  {amount:240,eligible:[0,1,4]},
  {amount:120,eligible:[1,4]},
 ]);
 assert.deepEqual(hand.refunds,[{id:4,amount:40}]);
 assert.deepEqual(hand.pots.map(pot=>pot.winners),[[4],[4]]);
 assert.equal(hand.pots.reduce((sum,pot)=>sum+pot.amount,0)+hand.refunds.reduce((sum,refund)=>sum+refund.amount,0),400);
 assert.equal(hand.final.reduce((sum,player)=>sum+player.stack,0),hand.totalBefore);
});

test('replay frames conserve chips and reveal a no-action all-in runout at the end',()=>{
 const hand=withSeed(1,()=>E.createHand({stacks:[40,80,160,300,600,1200,1800,2400,3000]}));
 const steps=replaySteps(hand.events);
 assert.ok(steps.at(-1).round<3,'the last betting action ends before the river');
 for(let index=0;index<=steps.length;index++){
  const frame=replayFrame(hand,steps,index);
  assert.equal(frame.state.reduce((sum,player)=>sum+player.stack,0)+frame.pot,hand.totalBefore);
 }
 const finalFrame=replayFrame(hand,steps,steps.length);
 assert.equal(finalFrame.shown,5);
 assert.equal(finalFrame.street,3);
 assert.equal(finalFrame.actor,null);
});

test('showdown equity splits ties and gives folded players no share',()=>{
 const players=[
  {cards:[{r:2,s:'♣'},{r:3,s:'♦'}]},
  {cards:[{r:4,s:'♣'},{r:5,s:'♦'}]},
  {cards:[{r:6,s:'♣'},{r:7,s:'♦'}]},
 ];
 const board=[{r:10,s:'♠'},{r:11,s:'♠'},{r:12,s:'♠'},{r:13,s:'♠'},{r:14,s:'♠'}];
 const result=estimateShowdownShare({players,board,shown:5,folded:[false,false,true]},E.evaluate7,E.compare);
 assert.deepEqual(result,[50,50,0]);
});
