// riskConcentration.js
// "Exposition globale" card of the dashboard (2026-09-18, Esdras: "on prend ... 6").
// The bot caps closed trades per day but deliberately NOT concurrent open
// positions (see HANDOFF.md, guardrail semantics), and two positions on
// US100 and US500 in the same direction are ONE bet taken twice. This turns
// the open positions and pending orders into: risk per correlated cluster,
// "same bet" warnings, and how the total compares with what the account can
// still lose today / before its drawdown floor.
//
// Plain script (no imports) so the page can load it directly; the unit test
// evaluates this same file in a vm context. Money is in account currency,
// computed like the existing "Risque aux stops" tile: |entry - stop| * units.

var RISK_CLUSTERS = {
  'Indices actions': ['US100', 'US500', 'GER40'],
  'Anti-dollar (EUR, or)': ['EURUSD', 'XAUUSD'],
};

function riskClusterOf(symbol) {
  for (var name in RISK_CLUSTERS) if (RISK_CLUSTERS[name].indexOf(symbol) !== -1) return name;
  return symbol || 'Inconnu';
}

/**
 * @param {object} p
 * @param {Array} p.positions - { symbol, direction:'bullish'|'bearish', entryPrice, stopLoss, units }
 * @param {Array} p.pendingOrders - { symbol, tradeSide:'BUY'|'SELL' }
 * @param {number} p.balance
 * @param {number} p.riskPctPerTrade - assumed risk of one trade whose real risk is unknown (pending order, position without stop)
 * @param {number} [p.dailyLossPct] - already lost today, % of the day's starting balance
 * @param {number} [p.dailyLossLimitPct]
 * @param {number|null} [p.drawdownFloor] - balance the account must not touch (prop-firm max drawdown), if any
 * @param {number} [p.currentBalance]
 */
function computeRiskConcentration(p) {
  var balance = p.balance > 0 ? p.balance : 0;
  var perTrade = balance * ((p.riskPctPerTrade || 0) / 100);
  var entries = [];

  (p.positions || []).forEach(function (pos) {
    var known = pos.stopLoss !== null && pos.stopLoss !== undefined && pos.entryPrice !== null && pos.entryPrice !== undefined && pos.units !== null && pos.units !== undefined;
    var risk;
    var estimated = false;
    if (!known) {
      risk = perTrade; // no stop known: assume one full trade of risk rather than pretend it is zero
      estimated = true;
    } else {
      var protectedStop = pos.direction === 'bullish' ? pos.stopLoss >= pos.entryPrice : pos.stopLoss <= pos.entryPrice;
      risk = protectedStop ? 0 : Math.abs(pos.entryPrice - pos.stopLoss) * pos.units;
    }
    entries.push({ kind: 'position', symbol: pos.symbol, direction: pos.direction, risk: risk, estimated: estimated });
  });
  (p.pendingOrders || []).forEach(function (o) {
    entries.push({ kind: 'pending', symbol: o.symbol, direction: o.tradeSide === 'BUY' ? 'bullish' : o.tradeSide === 'SELL' ? 'bearish' : null, risk: perTrade, estimated: true });
  });

  var clusters = {};
  entries.forEach(function (e) {
    var name = riskClusterOf(e.symbol);
    var c = clusters[name] || (clusters[name] = { name: name, entries: [], longs: 0, shorts: 0, positionRisk: 0, pendingRisk: 0 });
    c.entries.push(e);
    if (e.direction === 'bullish') c.longs++;
    if (e.direction === 'bearish') c.shorts++;
    if (e.kind === 'position') c.positionRisk += e.risk; else c.pendingRisk += e.risk;
  });
  var clusterList = Object.keys(clusters).map(function (k) {
    var c = clusters[k];
    c.sameDirection = c.longs >= 2 || c.shorts >= 2;
    c.riskPct = balance ? ((c.positionRisk + c.pendingRisk) / balance) * 100 : null;
    return c;
  }).sort(function (a, b) { return (b.positionRisk + b.pendingRisk) - (a.positionRisk + a.pendingRisk); });

  var positionRisk = clusterList.reduce(function (s, c) { return s + c.positionRisk; }, 0);
  var pendingRisk = clusterList.reduce(function (s, c) { return s + c.pendingRisk; }, 0);

  var dailyRoom = null; // money still losable today before the daily limit
  if (balance && p.dailyLossLimitPct) dailyRoom = Math.max(0, (p.dailyLossLimitPct - (p.dailyLossPct || 0)) / 100 * balance);
  var drawdownRoom = null; // money above the drawdown floor
  if (p.drawdownFloor !== null && p.drawdownFloor !== undefined && (p.currentBalance || balance)) drawdownRoom = Math.max(0, (p.currentBalance || balance) - p.drawdownFloor);

  var warnings = [];
  clusterList.forEach(function (c) {
    if (!c.sameDirection) return;
    var symbols = c.entries.filter(function (e) { return e.direction === (c.longs >= 2 ? 'bullish' : 'bearish'); }).map(function (e) { return e.symbol; });
    warnings.push({ level: 'warn', text: symbols.join(' + ') + ' dans le même sens (' + (c.longs >= 2 ? 'achat' : 'vente') + ') : c\'est le même pari pris plusieurs fois, risque cumulé ' + (c.riskPct === null ? '—' : c.riskPct.toFixed(2) + ' %') + ' du solde.' });
  });
  if (dailyRoom !== null && positionRisk > 0 && positionRisk >= dailyRoom) {
    warnings.push({ level: 'danger', text: 'Si tous les stops touchent, la limite de perte journalière est dépassée (risque ouvert supérieur à la marge restante du jour).' });
  } else if (dailyRoom !== null && positionRisk + pendingRisk > 0 && positionRisk + pendingRisk >= dailyRoom) {
    warnings.push({ level: 'warn', text: 'Positions ouvertes + ordres en attente, s\'ils touchent tous leur stop, dépasseraient la marge de perte journalière restante.' });
  }
  if (drawdownRoom !== null && positionRisk > 0 && positionRisk >= drawdownRoom) {
    warnings.push({ level: 'danger', text: 'Si tous les stops touchent, le plancher de drawdown du compte est atteint.' });
  }

  return {
    clusters: clusterList,
    positionRisk: positionRisk,
    pendingRisk: pendingRisk,
    positionRiskPct: balance ? (positionRisk / balance) * 100 : null,
    totalRiskPct: balance ? ((positionRisk + pendingRisk) / balance) * 100 : null,
    dailyRoom: dailyRoom,
    drawdownRoom: drawdownRoom,
    warnings: warnings,
    empty: entries.length === 0,
  };
}
