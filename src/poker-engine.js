
/**
 * Poker Recall – Texas Hold’em Spiel-Engine.
 * Unabhängig vom DOM; kann mit Node.js getestet werden.
 */
(function(root) {
'use strict';
const POSITIONS=['SB','BB','UTG','UTG+1','UTG+2','LJ','HJ','CO','BTN'];
const STREETS=['Preflop','Flop','Turn','River'];
const RANKS='23456789TJQKA';
const SUITS=['♠','♥','♦','♣'];
const rand=(n)=>Math.floor(Math.random()*n);
const deep=(v)=>JSON.parse(JSON.stringify(v));
function deck() { const a=[]; for(const s of SUITS) for(let r=2;r<=14;r++) a.push({r,s}); for(let i=a.length-1;i>0;i--){ const j=rand(i+1); [a[i],a[j]]=[a[j],a[i]];}return a;}
function cardString(c){return RANKS[c.r-2]+c.s;}
function evaluate5(cs) {
 const ranks=cs.map(x=>x.r).sort((a,b)=>b-a), counts=new Map();
 for (const r of ranks)counts.set(r,(counts.get(r)||0)+1);
 const groups=[...counts].map(([r,n])=>({r,n})).sort((a,b)=>b.n-a.n||b.r-a.r);
 const uniq=[...new Set(ranks)]; if(uniq.includes(14))uniq.push(1);
 let straight=0; for(let i=0;i<=uniq.length-5;i++)if(uniq[i]-uniq[i+4]===4){straight=uniq[i];break;}
 const flush=cs.every(x=>x.s===cs[0].s);
 if(flush && straight) return [8,straight];
 if(groups[0].n===4)return [7,groups[0].r,groups[1].r];
 if(groups[0].n===3&&groups[1].n>=2)return [6,groups[0].r,groups[1].r];
 if(flush)return [5,...ranks];
 if(straight)return [4,straight];
 if(groups[0].n===3)return [3,groups[0].r,...groups.slice(1).map(x=>x.r).sort((a,b)=>b-a)];
 if(groups[0].n===2&&groups[1].n===2){const pairs=[groups[0].r,groups[1].r].sort((a,b)=>b-a);return [2,...pairs,groups[2].r];}
 if(groups[0].n===2)return [1,groups[0].r,...groups.slice(1).map(x=>x.r).sort((a,b)=>b-a)];
 return [0,...ranks];
}
function compare(a,b){for(let i=0;i<Math.max(a.length,b.length);i++){let d=(a[i]||0)-(b[i]||0);if(d)return Math.sign(d);}return 0;}
function evaluate7(cs){let best=null;for(let a=0;a<3;a++)for(let b=a+1;b<4;b++)for(let c=b+1;c<5;c++)for(let d=c+1;d<6;d++)for(let e=d+1;e<7;e++){const x=evaluate5([cs[a],cs[b],cs[c],cs[d],cs[e]]);if(!best||compare(x,best)>0)best=x;}return best;}
const HANDS=['High Card','Ein Paar','Zwei Paare','Drilling','Straight','Flush','Full House','Vierling','Straight Flush'];
function createHand(opts={}){
 const sb=Number(opts.sb)||10, bb=Number(opts.bb)||20, raw=opts.stacks||POSITIONS.map(()=>((Math.random()<.12?10+rand(25):80+rand(65))*bb));
 const cards=deck();let take=()=>cards.pop();
 const p=POSITIONS.map((name,i)=>({id:i,name,stack:Math.max(1,raw[i]||400),committed:0,streetBet:0,folded:false,allIn:false,cards:[take(),take()],lastAction:null}));
 const board=Array.from({length:5},take);
 const originalStacks=p.map(x=>x.stack), snapshots=[];
 let pot=0,currentBet=0,lastFullRaise=bb,raiseCount=0;
 const events=[[],[],[],[]];
 function invest(pl,amount){const paid=Math.min(Math.max(0,amount),pl.stack);pl.stack-=paid;pl.streetBet+=paid;pl.committed+=paid;pot+=paid;if(pl.stack===0)pl.allIn=true;return paid;}
 invest(p[0],sb); invest(p[1],bb); currentBet=bb; // Der volle Big Blind bleibt die Preflop-Einsatzhöhe, auch bei einem Short-BB.
 const init=p.map(pl=>({stack:pl.stack,committed:pl.committed,streetBet:pl.streetBet}));
 function eligible(){return p.filter(x=>!x.folded&&!x.allIn).map(x=>x.id);}
 function live(){return p.filter(x=>!x.folded);}
 function clockwise(from,ids){const q=[];for(let k=1;k<=9;k++){let i=(from+k)%9;if(ids.includes(i))q.push(i);}return q;}
 function runStreet(street){
  // No-Limit Texas Hold'em: clockwise action, full-raise reopening, short all-ins.
  if(street>0){for(const pl of p)pl.streetBet=0;currentBet=0;lastFullRaise=bb;}
  const active=()=>p.filter(x=>!x.folded&&!x.allIn);
  let q=street===0?[2,3,4,5,6,7,8,0,1].filter(i=>eligible().includes(i)):
    [0,1,2,3,4,5,6,7,8].filter(i=>eligible().includes(i));
  let actedSinceFullRaise=new Set(),safety=0,raisesThisStreet=0;
  // Trainingsprofil je Street: Preflop aggressiver, Turn/River zunehmend passiv.
  const aggression=[{raise:.22,open:.30,fold:.15},{raise:.13,open:.27,fold:.16},{raise:.08,open:.20,fold:.17},{raise:.05,open:.15,fold:.18}][street];
  while(q.length&&live().length>1&&++safety<300){
   const i=q.shift(),pl=p[i];
   if(pl.folded||pl.allIn)continue;
   const toCall=Math.max(0,currentBet-pl.streetBet);
   // Postflop beginnt jede Setzrunde ohne Einsatz: ein Call ist erst nach einer Bet möglich.
   if(street>0 && events[street].length===0 && (currentBet!==0 || toCall!==0))throw new Error('Ungültiger Eröffnungseinsatz nach dem Flop');
   // Trainingslimit: maximal zwei Erhöhungen je Setzrunde; eine eröffnende Bet zählt nicht.
   const canRaise=active().length>1&&!actedSinceFullRaise.has(i)&&pl.stack>toCall&&(currentBet===0||raisesThisStreet<2);
   const minRaiseTo=currentBet===0?bb:currentBet<bb?bb:currentBet+lastFullRaise;
   const minExtra=Math.max(0,minRaiseTo-currentBet);
   const canFullRaise=canRaise&&pl.stack>=toCall+minExtra;
   let kind,put=0;
   const random=Math.random();
   if(toCall>0){
    const pressure=toCall/Math.max(1,pl.stack+pl.streetBet);
    if(random<Math.min(.72,aggression.fold+pressure*.45)){kind='Fold';pl.folded=true;}
    else if(canFullRaise&&random>1-aggression.raise){
     const raiseSize=Math.max(minExtra,lastFullRaise)*(1+rand(3));
     put=invest(pl,toCall+raiseSize);kind='Raise';
    }else if(canRaise&&random>.985){
     // Short stack may push for less than a minimum full raise.
     put=invest(pl,pl.stack);kind='All-in';
    }else {put=invest(pl,toCall);kind=pl.allIn?'All-in':'Call';}
   }else{
    if(canFullRaise&&random>1-aggression.open){
     const raiseSize=Math.max(bb,lastFullRaise)*(1+rand(3));
     put=invest(pl,raiseSize);kind=currentBet?'Raise':'Bet';
    }else if(canRaise&&random>.99){
     put=invest(pl,pl.stack);kind='All-in';
    }else kind='Check';
   }
   const previousBet=currentBet;
   if(pl.streetBet>currentBet){
    if(currentBet>0)raisesThisStreet++;
    const raiseSize=pl.streetBet-currentBet;
    currentBet=pl.streetBet;
    if(raiseSize>=lastFullRaise || (previousBet<bb&&currentBet>=bb)){
     lastFullRaise=previousBet<bb&&currentBet>=bb?bb:raiseSize;
     actedSinceFullRaise.clear();
     q=clockwise(i,eligible().filter(id=>id!==i));
    }else{
     // A short all-in does not reopen betting for players who already acted.
     q=clockwise(i,eligible().filter(id=>id!==i&&(p[id].streetBet<currentBet||!actedSinceFullRaise.has(id))));
    }
   }
   actedSinceFullRaise.add(i);
   if(pl.allIn&&kind!=='Fold')kind='All-in';
   // Schutz gegen Call ohne offenen Einsatz, auch bei späteren Änderungen der Simulation.
   if(kind==='Call' && toCall===0)kind='Check';
   if(street>0 && events[street].length===0 && kind==='Call')throw new Error('Erster Spieler darf postflop nicht callen');
   pl.lastAction=kind;
   const total=pl.streetBet;
   const actionDetail=kind==='Fold'||kind==='Check'?'':kind==='Call'?' · '+put+' Chips':
     (kind==='Raise'||kind==='Bet')?' auf '+total+' Chips':
     ' · '+put+' Chips (gesamt '+total+')';
   events[street].push({id:i,action:kind,put,bet:total,stack:pl.stack,committed:pl.committed,pot,currentBet,folded:pl.folded,allIn:pl.allIn,text:pl.name+': '+kind+actionDetail});
   if(live().length===1){q=[];break;}
   if(active().length<=1){
    // Last remaining player may only call or fold, never bet into an all-in.
    q=q.filter(id=>p[id].streetBet<currentBet);
   }
  }
  if(safety>=300)throw new Error('Setzrunde hat Sicherheitslimit erreicht');
  snapshots.push(deep(p));
 }
 let lastStreetPlayed=-1;
 for(let s=0;s<4;s++){
  if(live().length<=1)break;
  lastStreetPlayed=s;
  if(eligible().length>1)runStreet(s);
  else { // Kein sinnvoller Einsatz mehr möglich: restliche Gemeinschaftskarten werden aufgedeckt.
   snapshots.push(deep(p));
  }
 }
 const uncontested=live().length===1;
 const boardToShow=uncontested?[0,3,4,5][Math.max(0,lastStreetPlayed)]:5;
 const pots=[];let refunds=[];
 const levels=[...new Set(p.map(x=>x.committed).filter(Boolean))].sort((a,b)=>a-b);
 let last=0;
 for(let level of levels){const contributors=p.filter(x=>x.committed>=level),amount=(level-last)*contributors.length;last=level;
  if(contributors.length===1){contributors[0].stack+=amount;refunds.push({id:contributors[0].id,amount});continue;}
  const eligibleIds=contributors.filter(x=>!x.folded).map(x=>x.id);
  const prev=pots[pots.length-1];
  if(prev && prev.eligible.join(',')===eligibleIds.join(','))prev.amount+=amount;
  else pots.push({amount,eligible:eligibleIds,winners:[],hand:null});
 }
 const ranks=p.map(pl=>!pl.folded?evaluate7([...pl.cards,...board]):null);
 let award=0;
 for(let potObj of pots){
  if(!potObj.eligible.length)throw new Error('Pot ohne berechtigten Spieler');
  let top=potObj.eligible[0];for(const i of potObj.eligible)if(compare(ranks[i],ranks[top])>0)top=i;
  const winners=potObj.eligible.filter(i=>compare(ranks[i],ranks[top])===0);
  potObj.winners=winners;potObj.hand=uncontested?'Alle anderen gefoldet':HANDS[ranks[top][0]];
  const share=Math.floor(potObj.amount/winners.length),extra=potObj.amount%winners.length;
  for(let j=0;j<winners.length;j++)p[winners[j]].stack+=share+(j<extra?1:0);
  award+=potObj.amount;
 }
 const final=p.map(x=>({stack:x.stack,committed:x.committed,folded:x.folded,allIn:x.allIn,cards:x.cards,hand:!x.folded?HANDS[ranks[x.id][0]]:null}));
 const totalBefore=originalStacks.reduce((a,b)=>a+b,0),totalAfter=final.reduce((a,b)=>a+b.stack,0);
 if(totalBefore!==totalAfter)throw new Error(`Chip-Bilanz fehlerhaft ${totalBefore} != ${totalAfter}`);
 return {positions:POSITIONS,streets:STREETS,players:p.map(x=>({id:x.id,name:x.name,cards:x.cards})),init,originalStacks,board,events,snapshots,pots,refunds,final,uncontested,boardToShow,blinds:[sb,bb],initialPot:init.reduce((a,b)=>a+b.committed,0),totalBefore,totalAfter};
}
root.PokerEngine={createHand,cardString,evaluate5,evaluate7,compare,HANDS,POSITIONS,STREETS};
if(typeof module!=='undefined'&&module.exports)module.exports=root.PokerEngine;
})(typeof window==='undefined'?globalThis:window);

