/** Pure helpers for rebuilding a hand as it appeared during replay. */
export function replaySteps(events) {
  return events.flatMap((streetEvents, round) => streetEvents.map(action => ({ round, action })));
}

export function replayFrame(hand, steps, requestedIndex) {
  const index = Math.max(0, Math.min(requestedIndex, steps.length));
  const state = hand.players.map((_, i) => ({
    ...hand.init[i],
    folded: false,
    allIn: hand.init[i].stack === 0,
  }));
  const lastActions = {};
  let pot = hand.initialPot;
  let street = 0;

  for (let n = 0; n < index; n++) {
    const { round, action } = steps[n];
    if (round !== street) {
      street = round;
      state.forEach(player => { player.streetBet = 0; });
    }
    Object.assign(state[action.id], {
      stack: action.stack,
      committed: action.committed,
      streetBet: action.bet,
      folded: action.folded,
      allIn: action.allIn,
    });
    pot = action.pot;
    lastActions[action.id] = action.action;
  }

  if (index < steps.length && steps[index].round > street) {
    street = steps[index].round;
    state.forEach(player => { player.streetBet = 0; });
  }

  let shown = [0, 3, 4, 5][street];
  if (index === steps.length) {
    // At the end of the action list, also show any no-action all-in runout.
    shown = hand.boardToShow;
    street = [0, 3, 4, 5].indexOf(shown);
  }

  return {
    index, state, pot, street, shown, lastActions,
    actor: index === 0 || index === steps.length ? null : steps[index - 1].action.id,
  };
}

/** Monte-Carlo showdown share among the currently active players. */
export function estimateShowdownShare({ players, board, shown, folded }, evaluate7, compare, options = {}) {
  const trials = options.trials ?? 1200;
  const random = options.random ?? Math.random;
  const eligible = players.map((_, i) => !folded[i] ? i : -1).filter(i => i >= 0);
  const results = Array(players.length).fill(0);
  if (eligible.length === 1) {
    results[eligible[0]] = 100;
    return results;
  }
  if (!eligible.length) return results;

  const known = [...players.flatMap(player => player.cards), ...board.slice(0, shown)];
  const seen = new Set(known.map(card => `${card.r}:${card.s}`));
  const remaining = [];
  for (const suit of ['♠', '♥', '♦', '♣']) {
    for (let rank = 2; rank <= 14; rank++) {
      if (!seen.has(`${rank}:${suit}`)) remaining.push({ r: rank, s: suit });
    }
  }

  const boardKnown = board.slice(0, shown);
  const missing = 5 - boardKnown.length;
  const count = missing === 0 ? 1 : trials;
  for (let trial = 0; trial < count; trial++) {
    const deck = remaining.slice();
    for (let k = 0; k < missing; k++) {
      const j = k + Math.floor(random() * (deck.length - k));
      [deck[k], deck[j]] = [deck[j], deck[k]];
    }
    const completedBoard = [...boardKnown, ...deck.slice(0, missing)];
    let best = null;
    let winners = [];
    for (const i of eligible) {
      const rank = evaluate7([...players[i].cards, ...completedBoard]);
      const comparison = best === null ? 1 : compare(rank, best);
      if (comparison > 0) {
        best = rank;
        winners = [i];
      } else if (comparison === 0) {
        winners.push(i);
      }
    }
    for (const i of winners) results[i] += 100 / count / winners.length;
  }
  return results;
}
