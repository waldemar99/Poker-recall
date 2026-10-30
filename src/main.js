import './poker-engine.js';
import './style.css';

/**
 * Poker Recall – Oberfläche, Abläufe und Quiz.
 * Die Spiellogik liegt separat in engine.js.
 */
(()=>{
'use strict';
const E=window.PokerEngine;
const $=id=>document.getElementById(id);
const xy=[[30,88],[10,71],[6,42],[22,15],[49,5],[76,15],[94,42],[90,71],[70,88]];
const kinds=['Fold','Check','Call','Bet','Raise','All-in'];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let hand=null,state=null,street=0,mode='idle',token=0,score=0,total=0,answered=new Set(),selections=new Map(),checked=false,lastActions={},quizEvents=[],replayIndex=0;
let pot=30,shown=0,actor=null,log=[];
const fmt=n=>new Intl.NumberFormat('de-DE').format(n);
const visible=(id,display)=>$(id).hidden=!display;
function card(c){return `<div class="board-card${(c.s==='♥'||c.s==='♦')?' red':''}">${E.cardString(c)}</div>`;}
function renderBoard(){ $('board').innerHTML=Array.from({length:5},(_,i)=>i<shown?card(hand.board[i]):'<div class="board-ghost"></div>').join('');}
function cardHole(c,face){if(!face)return '<div class="hole"></div>';return `<div class="hole face${(c.s==='♥'||c.s==='♦')?' red':''}">${E.cardString(c)}</div>`;}
function renderSeats(){
 if(!state)return;
 const host=$('seats');
 // Sitzplätze werden nur einmal angelegt und bei jeder Aktion aktualisiert.
 // Dadurch bleiben die DOM-Elemente bestehen und Fold-Übergänge animieren wirklich.
 if(host.children.length!==state.length){
  host.innerHTML=state.map((p,i)=>`<div class="seat" style="--x:${xy[i][0]}%;--y:${xy[i][1]}%"><div class="holecards"><div class="hole"></div><div class="hole"></div></div><div class="person"><div class="name">${hand.players[i].name}</div><div class="stack"></div></div><div class="chip-state"></div><div class="seat-equity" hidden></div><div class="table-bet"></div>${i===8?'<div class="dealer-button" aria-label="Dealer Button">D</div>':''}</div>`).join('');
 }
 state.forEach((p,i)=>{
  const seat=host.children[i];
  if(i===8&&!seat.querySelector('.dealer-button'))seat.insertAdjacentHTML('beforeend','<div class="dealer-button" aria-label="Dealer Button">D</div>');
  const face=mode==='showdown';
  const win=mode==='showdown'&&hand.pots.some(pot=>pot.winners.includes(i));
  seat.classList.toggle('folded',Boolean(p.folded)&&mode!=='showdown');
  seat.classList.toggle('is-active',actor===i);
  seat.classList.toggle('is-winner',Boolean(win));
  seat.classList.toggle('showdown-reveal',mode==='showdown');
  seat.querySelector('.holecards').innerHTML=cardHole(hand.players[i].cards[0],face)+cardHole(hand.players[i].cards[1],face);
  seat.querySelector('.name').textContent=hand.players[i].name;
  seat.querySelector('.stack').textContent=`${fmt(p.stack)} ♣`;
  seat.querySelector('.table-bet').textContent=((mode==='watch'||mode==='replay')&&p.streetBet>0)?fmt(p.streetBet):'';
  const equityLabel=seat.querySelector('.seat-equity');
  if(equityLabel)equityLabel.hidden=true;
  const tag=seat.querySelector('.chip-state');
  const entries=mode==='quiz'?quizEvents.map((ev,index)=>({ev,index})).filter(x=>x.ev.id===i):[];
  const chosen=entries.filter(x=>selections.has(x.index));
  tag.textContent=mode==='quiz'?(chosen.length?chosen.map(x=>selections.get(x.index).toUpperCase()).join(' › '):p.folded?'FOLD':''):(p.folded?'FOLD':((mode==='watch'||mode==='replay')&&lastActions[i]?lastActions[i].toUpperCase():win?'🏆 GEWINNER':p.folded?'FOLD':p.allIn?'ALL-IN':''));
  tag.classList.toggle('quiz-selected',mode==='quiz'&&chosen.length>0&&!checked);
  tag.classList.toggle('quiz-correct',mode==='quiz'&&checked&&chosen.length>0&&chosen.every(x=>selections.get(x.index)===x.ev.action));
  tag.classList.toggle('quiz-wrong',mode==='quiz'&&checked&&chosen.some(x=>selections.get(x.index)!==x.ev.action));
  if(mode==='quiz'&&checked&&chosen.length)tag.textContent=entries.map(x=>(selections.get(x.index)||'?').toUpperCase()+(selections.get(x.index)===x.ev.action?' ✓':' ✗')).join(' › ');
 });
}
function flyChips(from,to,count=2){
 const wrap=document.querySelector('.table-wrap');if(!wrap||!from||!to)return;
 const rect=wrap.getBoundingClientRect(),a=from.getBoundingClientRect(),b=to.getBoundingClientRect();
 for(let j=0;j<count;j++){
  const chip=document.createElement('div');chip.className='chip-flight';
  chip.style.left=(a.left+a.width/2-rect.left)+'px';chip.style.top=(a.top+a.height/2-rect.top)+'px';
  wrap.appendChild(chip);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   chip.style.left=(b.left+b.width/2-rect.left+(j-1)*9)+'px';
   chip.style.top=(b.top+b.height/2-rect.top+(j-1)*5)+'px';chip.style.opacity='0';
  }));setTimeout(()=>chip.remove(),750);
 }
}
function animateBet(id){flyChips($('seats').children[id],document.querySelector('.pot-label'));}
function animatePayout(){
 const from=document.querySelector('.pot-label');
 const winners=[...new Set(hand.pots.flatMap(p=>p.winners))];
 for(const id of winners)flyChips(from,$('seats').children[id],3);
}
function renderList(){
 if(!state)return;
 $('player-list').innerHTML=state.map((p,i)=>`<div class="player-row${p.folded?' folded':''}${p.allIn?' allin':''}"><span class="number">${String(i+1).padStart(2,'0')}</span><span class="position">${hand.players[i].name}</span><span class="amount">${fmt(p.stack)} ♣</span><span class="status">${p.folded?'Fold':p.allIn?'All-in':'Im Spiel'}</span></div>`).join('');
}
function render(){if(!hand)return;$('pot').textContent=fmt(pot);renderBoard();renderSeats();renderList();$('score').textContent=`${score} / ${total}`;}
function progress(){
 const s=[...$('progress').children];for(let i=0;i<4;i++)s[i].className=i<street?'done':i===street?'active':'';
 $('street-title').textContent=`${E.STREETS[street].toUpperCase()} · ${mode==='watch'?'BEOBACHTEN':mode==='quiz'?'ERINNERN':mode==='showdown'?'SHOWDOWN':mode==='replay'?'REPLAY':'BEREIT'}`;
 $('round-label').textContent=`RUNDE ${street+1} / 4`;
}
function setLive(text){$('action-text').textContent=text;}
function setPhase(tag,title,desc){$('phase-label').textContent=tag;$('phase-title').textContent=title;$('instructions').textContent=desc;}
function updateLog(){ $('history').innerHTML=log.slice(-5).map(x=>`<span>${x}</span>`).join(''); }
function initialize(){
 token++;hand=E.createHand();mode='watch';street=0;actor=null;equityCache.clear();score=0;total=0;pot=hand.initialPot;shown=0;log=[];answered=new Set();selections=new Map();checked=false;lastActions={};quizEvents=[];
 state=hand.players.map((p,i)=>({...hand.init[i],folded:false,allIn:hand.init[i].stack===0}));
 visible('quiz',false);visible('showdown',false);$('history').classList.remove('is-hidden');$('start').innerHTML='<span>♠</span> Neue Hand starten <span class="arrow">↻</span>';
 $('live-action').hidden=false;setLive('Die Karten sind verteilt. UTG beginnt vor dem Flop.');
 setPhase('01 / BEOBACHTEN','Neun Spieler. Wer macht was?','Merke dir jede Aktion in ihrer Reihenfolge. Ein Spieler kann mehrfach an der Reihe sein.');
 progress();render();return token;
}
async function playRound(id){
 if(id!==token)return;
 mode='watch';actor=null;answered=new Set();selections=new Map();checked=false;lastActions={};quizEvents=[];log=[];
 $('history').classList.remove('is-hidden');visible('quiz',false);visible('showdown',false);$('live-action').hidden=false;
 shown=[0,3,4,5][street];
 setPhase('01 / BEOBACHTEN',`${E.STREETS[street]} · Aktionen beobachten`,'Merke dir alle Aktionen in ihrer Reihenfolge – auch mehrere Aktionen desselben Spielers.');
 setLive(street===0?'UTG ist als Erster an der Reihe.':'Die Setzrunde startet beim ersten aktiven Spieler ab SB.');
 if(street!==0)state.forEach((p)=>{p.streetBet=0;});
 progress();render();
 await sleep(500);if(id!==token)return;
 const current=hand.events[street];
 for(const action of current){
  actor=action.id;
  const p=state[action.id];Object.assign(p,{stack:action.stack,committed:action.committed,streetBet:action.bet,folded:action.folded,allIn:action.allIn});
  pot=action.pot;lastActions[action.id]=action.action;
  setLive(action.text);log.push(action.text);updateLog();render();
  if(action.put>0)animateBet(action.id);
  await sleep(Number($('speed').value));if(id!==token)return;
 }
 actor=null;render();await sleep(350);if(id!==token)return;
 startQuiz();
}
function startQuiz(){
 mode='quiz';quizEvents=hand.events[street];progress();$('history').classList.add('is-hidden');
 if(state.some(p=>p.streetBet>0))flyChips(document.querySelector('.seat .table-bet:not(:empty)'),document.querySelector('.pot-label'),3);
 setPhase('02 / ERINNERN',`${E.STREETS[street]} · Gedächtnistest`,'Die Aktionen sind ausgeblendet. Gefoldete Spieler bleiben rot durchgestrichen markiert – wie am echten Tisch.');
 setLive('Erinnere dich an jede Aktion – auch wenn ein Spieler mehrfach dran war.');
 const quiz=$('questions');
 if(!quizEvents.length){quiz.innerHTML='<p>Keine Setzaktionen mehr: Die verbleibenden Spieler sind All-in oder die Hand ist entschieden.</p>';}
 else quiz.innerHTML=quizEvents.map((ev,index)=>`<div class="question${state[ev.id].folded?' folded':''}" data-event="${index}"><div class="question-head"><strong>${index+1}. ${hand.players[ev.id].name}</strong><small>AKTION ${index+1}?</small></div><div class="choices">${kinds.map(k=>`<button type="button" class="choice" data-choice="${k}">${k}</button>`).join('')}</div></div>`).join('');
 quiz.querySelectorAll('button[data-choice]').forEach(b=>b.addEventListener('click',onChoice));
 $('check').hidden=quizEvents.length===0;$('check').disabled=quizEvents.length>0;
 $('next').hidden=quizEvents.length>0;$('next').disabled=quizEvents.length>0;$('next').textContent=street===3||hand.events.slice(street+1).every(a=>!a.length)?'Showdown zeigen →':'Nächste Runde →';
 visible('quiz',true);render();
}
function onChoice(e){
 if(checked)return;
 const btn=e.currentTarget,container=btn.closest('.question'),index=Number(container.dataset.event);
 selections.set(index,btn.dataset.choice);
 container.querySelectorAll('.choice').forEach(b=>b.classList.toggle('selected',b===btn));
 container.querySelector('small').textContent='AUSGEWÄHLT: '+btn.dataset.choice.toUpperCase();
 $('check').disabled=selections.size!==quizEvents.length;
 renderSeats();
}
function checkAnswers(){
 if(checked||selections.size!==quizEvents.length)return;
 checked=true;
 document.querySelectorAll('#questions .question').forEach(container=>{
  const index=Number(container.dataset.event),answer=selections.get(index),correct=quizEvents[index].action;
  const ok=answer===correct;total++;if(ok)score++;
  container.querySelectorAll('.choice').forEach(b=>{
   b.disabled=true;b.classList.remove('selected');
   if(b.dataset.choice===correct)b.classList.add('correct');
   else if(b.dataset.choice===answer)b.classList.add('wrong');
  });
  container.querySelector('small').textContent=ok?'RICHTIG ✓':`RICHTIG: ${correct}`;
 });
 $('score').textContent=`${score} / ${total}`;
 $('check').hidden=true;$('next').hidden=false;$('next').disabled=false;
 renderSeats();
}
function moveNext(){
 if(mode!=='quiz')return;
 if(street>=3 || hand.events.slice(street+1).every(a=>a.length===0)){finish();return;}
 street++;playRound(token);
}
// Equity im Replay: bekannte Holecards aller Spieler werden aus dem Deck entfernt.
// Monte-Carlo-Anteil am Pot (Split Pots anteilig), nur noch aktive Spieler.
const equityCache=new Map();
function replayEquity(){
 const key=replayIndex+':'+street+':'+shown+':'+state.map(p=>p.folded?'F':'A').join('');
 if(equityCache.has(key))return equityCache.get(key);
 const eligible=state.map((p,i)=>!p.folded?i:-1).filter(i=>i>=0);
 const results=Array(9).fill(0);
 if(eligible.length===1){results[eligible[0]]=100;equityCache.set(key,results);return results;}
 if(!eligible.length)return results;
 const known=[...hand.players.flatMap(p=>p.cards),...hand.board.slice(0,shown)];
 const seen=new Set(known.map(c=>c.r+':'+c.s));
 const remaining=[];
 for(const suit of ['♠','♥','♦','♣'])for(let rank=2;rank<=14;rank++)if(!seen.has(rank+':'+suit))remaining.push({r:rank,s:suit});
 const boardKnown=hand.board.slice(0,shown);
 const missing=5-boardKnown.length;
 const trials=missing===0?1:1200;
 for(let t=0;t<trials;t++){
  const deck=remaining.slice();
  for(let k=0;k<missing;k++){
   const j=k+Math.floor(Math.random()*(deck.length-k));
   [deck[k],deck[j]]=[deck[j],deck[k]];
  }
  const board=[...boardKnown,...deck.slice(0,missing)];
  let best=null,winners=[];
  for(const i of eligible){
   const rank=E.evaluate7([...hand.players[i].cards,...board]);
   const comparison=best===null?1:E.compare(rank,best);
   if(comparison>0){best=rank;winners=[i];}
   else if(comparison===0)winners.push(i);
  }
  for(const i of winners)results[i]+=100/trials/winners.length;
 }
 equityCache.set(key,results);return results;
}
function updateReplayEquity(){
 const panel=$('replay-equity');if(!panel)return;
 const eq=replayEquity();
 document.querySelectorAll('#seats .seat').forEach((seat,i)=>{
  const label=seat.querySelector('.seat-equity');if(!label)return;
  label.hidden=Boolean(state[i].folded);
  label.textContent=state[i].folded?'':eq[i].toFixed(1)+' % EQ';
 });
 panel.innerHTML='<strong>Equity · Gewinnchance</strong><div style="font-size:11px;opacity:.7;margin:4px 0 9px">Bekannte Holecards · Split Pots anteilig · Monte-Carlo-Simulation</div>'+hand.players.map((p,i)=>state[i].folded?'':`<div style="display:flex;align-items:center;gap:8px;margin:5px 0"><span style="width:66px;font-weight:700">${p.name}</span><div style="height:9px;background:#23343c;border-radius:8px;flex:1;overflow:hidden"><div style="height:100%;width:${eq[i].toFixed(2)}%;background:#dfbe79"></div></div><b style="width:55px;text-align:right;font-variant-numeric:tabular-nums">${eq[i].toFixed(1)}%</b></div>`).join('');
}
function replaySteps(){return hand.events.flatMap((events,round)=>events.map(action=>({round,action})));}
function showReplayStep(index){
 const steps=replaySteps();replayIndex=Math.max(0,Math.min(index,steps.length));
 mode='replay';actor=null;lastActions={};log=[];
 state=hand.players.map((p,i)=>({...hand.init[i],folded:false,allIn:hand.init[i].stack===0}));
 pot=hand.initialPot;street=0;shown=0;
 for(let n=0;n<replayIndex;n++){
  const {round,action}=steps[n];
  if(round!==street){street=round;state.forEach(p=>p.streetBet=0);}
  const p=state[action.id];Object.assign(p,{stack:action.stack,committed:action.committed,streetBet:action.bet,folded:action.folded,allIn:action.allIn});
  pot=action.pot;lastActions[action.id]=action.action;
 }
 if(replayIndex<steps.length){
  const next=steps[replayIndex];
  if(next.round>street){street=next.round;state.forEach(p=>p.streetBet=0);}
 }
 shown=[0,3,4,5][street];
 const current=replayIndex?steps[replayIndex-1]:null;
 actor=current?current.action.id:null;
 const status=replayIndex===0?'Start der Hand · Blinds sind gesetzt':current.action.text;
 setPhase('04 / REPLAY','Hand Schritt für Schritt',`Aktion ${replayIndex} von ${steps.length} · ${E.STREETS[street]}`);
 setLive(status);progress();render();updateReplayEquity();
 $('replay-position').textContent=`Aktion ${replayIndex} / ${steps.length} · ${E.STREETS[street]}`;
 $('replay-prev').disabled=replayIndex===0;
 $('replay-next').disabled=replayIndex===steps.length;
 $('replay-start').hidden=true;
 $('replay-controls').hidden=false;
}
function finish(){
 mode='showdown';actor=null;shown=hand.boardToShow;pot=hand.pots.reduce((a,x)=>a+x.amount,0);
 state=hand.final.map((pl)=>({...pl}));
 progress();setPhase('03 / AUSWERTUNG',hand.uncontested?'Gewonnen ohne Showdown':'Showdown · Die Gewinner',hand.uncontested?'Alle Gegner sind ausgestiegen. Nicht ausgespielte Gemeinschaftskarten bleiben verdeckt.':'Alle fünf Gemeinschaftskarten sind aufgedeckt. Die Chip-Verteilung berücksichtigt getrennte Side-Pots und mögliche Split-Pots.');
 $('history').classList.add('is-hidden');visible('quiz',false);$('live-action').hidden=false;
 const winners=[...new Set(hand.pots.flatMap(p=>p.winners))].map(i=>hand.players[i].name).join(' · ');
 setLive(`Hand beendet. ${winners || 'Kein Gewinner'} ${winners.includes('·')?'gewinnen':'gewinnt'}.`);
 const pots=hand.pots.map((pot,i)=>{
  const players=pot.winners.map(id=>hand.players[id].name).join(' + ');
  return `<div class="pot-result"><b>${i?'Side-Pot '+i:'Main Pot'} · ${fmt(pot.amount)} Chips</b><br>Gewinner: ${players}<br><span>${pot.hand}${pot.winners.length>1?' · Split Pot':''}</span></div>`;
 }).join('');
 const refund=hand.refunds.length?`<p>Nicht gecallte Einsätze zurück: ${hand.refunds.map(r=>hand.players[r.id].name+' '+fmt(r.amount)).join(', ')} Chips.</p>`:'';
 $('showdown').innerHTML=`<div class="eyebrow">03 / SHOWDOWN</div><h2>♠ ${hand.uncontested?'Hand ohne Showdown beendet':'Hand abgeschlossen'}</h2><p>${fmt(hand.totalBefore)} Chips insgesamt · ${fmt(hand.totalAfter)} Chips nach Auszahlung – die Bilanz stimmt.</p>${pots}${refund}<p>Eine weitere Hand kannst du direkt unter dem Tisch starten. Dein Ergebnis: <b>${score} von ${total}</b> richtigen Antworten.</p><button type="button" id="replay-start" class="primary">↻ Replay · Hand ansehen</button><div id="replay-controls" hidden><p id="replay-position" aria-live="polite"></p><div id="replay-equity" style="margin:12px 0;padding:12px;border:1px solid #34454b;border-radius:12px"></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" id="replay-prev" class="primary">← Zurück</button><button type="button" id="replay-next" class="primary">Nächste Aktion →</button><button type="button" id="replay-reset" class="primary">↻ Von vorn</button></div></div>`;
 visible('showdown',true);$('replay-start').addEventListener('click',()=>showReplayStep(0));$('replay-prev').addEventListener('click',()=>showReplayStep(replayIndex-1));$('replay-next').addEventListener('click',()=>showReplayStep(replayIndex+1));$('replay-reset').addEventListener('click',()=>showReplayStep(0));animatePayout();$('start').innerHTML='<span>♠</span> Neue Hand starten <span class="arrow">→</span>';render();
}
$('start').addEventListener('click',()=>{
 try { const id=initialize();playRound(id); }
 catch(error) {
  console.error('Poker Recall: Startfehler',error);
  const help=$('runtime-help');
  help.textContent='⚠️ Beim Start ist ein Fehler aufgetreten: '+String(error.message || error);
  help.hidden=false;
 }
});
$('check').addEventListener('click',checkAnswers);
$('next').addEventListener('click',moveNext);
// Die Spieloberfläche bleibt vor der ersten Hand vollständig sichtbar.
const initial=E.POSITIONS.map((name,i)=>({id:i,name,cards:[]}));
hand={players:initial,board:[],originalStacks:[]};state=initial.map((x,i)=>({stack:2000,folded:false,allIn:false}));
render();$('street-title').textContent='BEREIT · 9 SPIELER';$('round-label').textContent='BLINDS 10 / 20';
// Skripte wurden ausgeführt, daher die Vorschau-Warnung ausblenden.
$('runtime-help').hidden=true;
})();

