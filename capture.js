/**
 * Provably Fair Bet Capture — Browser Console Script
 *
 * Paste this into your browser console (F12 → Console) while playing
 * on a supported crypto casino. It captures bet data (seeds, nonce,
 * results) so you can verify them later.
 *
 * Supported: Stake, Shuffle, BC.Game, Rollbit, Roobet
 *
 * Free verification tool: https://rakestake.com/verify
 * Source: https://github.com/rakestake/provably-fair-scripts
 *
 * HOW TO USE:
 * 1. Open your casino site (e.g. stake.com)
 * 2. Press F12 → Console tab
 * 3. Paste this entire script and press Enter
 * 4. Play normally — bets are captured automatically
 * 5. Type PF.export() to download captured bets as JSON
 * 6. Type PF.verify() to verify the last bet instantly
 * 7. Type PF.list() to see all captured bets
 */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════
  // STORAGE
  // ═══════════════════════════════════════════════════

  const captured = [];
  let captureCount = 0;

  // Detect which casino we're on
  const host = window.location.hostname.toLowerCase();
  let casino = 'unknown';
  if (host.includes('stake')) casino = 'stake';
  else if (host.includes('shuffle')) casino = 'shuffle';
  else if (host.includes('bc.game') || host.includes('bc.fun')) casino = 'bcgame';
  else if (host.includes('rollbit')) casino = 'rollbit';
  else if (host.includes('roobet')) casino = 'roobet';
  else if (host.includes('rainbet')) casino = 'rainbet';
  else if (host.includes('duel')) casino = 'duel';

  console.log(`%c[PF Capture] Initialized on ${casino}`, 'color: #22c55e; font-weight: bold; font-size: 14px');
  console.log(`%c[PF Capture] Commands: PF.list() | PF.export() | PF.verify() | PF.clear() | PF.help()`, 'color: #6366f1');

  // ═══════════════════════════════════════════════════
  // NETWORK INTERCEPTOR — Capture API responses
  // ═══════════════════════════════════════════════════

  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

      // Clone response so we can read it without consuming
      const clone = response.clone();

      // Check if this is a bet/game result response
      if (isBetResponse(url)) {
        clone.json().then(data => {
          extractBetData(url, data);
        }).catch(() => {});
      }
    } catch (e) {}

    return response;
  };

  // Also intercept XMLHttpRequest for older casino implementations
  const originalXHR = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._pfUrl = url;
    this.addEventListener('load', function() {
      try {
        if (isBetResponse(url)) {
          const data = JSON.parse(this.responseText);
          extractBetData(url, data);
        }
      } catch (e) {}
    });
    return originalXHR.call(this, method, url, ...rest);
  };

  // WebSocket interceptor for real-time game data
  const OrigWS = window.WebSocket;
  window.WebSocket = function(...args) {
    const ws = new OrigWS(...args);
    ws.addEventListener('message', function(event) {
      try {
        if (typeof event.data === 'string' && event.data.includes('serverSeed')) {
          const data = JSON.parse(event.data);
          extractBetData('websocket', data);
        }
      } catch (e) {}
    });
    return ws;
  };
  window.WebSocket.prototype = OrigWS.prototype;

  // ═══════════════════════════════════════════════════
  // BET DETECTION — Identify bet-related API calls
  // ═══════════════════════════════════════════════════

  function isBetResponse(url) {
    const patterns = [
      /bet/i, /game/i, /play/i, /roll/i, /spin/i,
      /crash/i, /limbo/i, /dice/i, /keno/i, /mines/i,
      /plinko/i, /blackjack/i, /hilo/i, /result/i,
      /graphql/i, /api.*v\d/i,
    ];
    return patterns.some(p => p.test(url));
  }

  // ═══════════════════════════════════════════════════
  // DATA EXTRACTION — Pull seed data from responses
  // ═══════════════════════════════════════════════════

  function extractBetData(url, data) {
    // Recursively search for seed-related fields
    const seeds = findSeeds(data);
    if (!seeds) return;

    captureCount++;
    const bet = {
      id: captureCount,
      casino: casino,
      timestamp: new Date().toISOString(),
      url: typeof url === 'string' ? url.split('?')[0] : 'websocket',
      ...seeds,
      raw: data,
    };

    captured.push(bet);

    const gameLabel = bet.game || 'unknown';
    const resultLabel = bet.result !== undefined ? ` → ${bet.result}` : '';
    console.log(
      `%c[PF] #${captureCount} ${gameLabel}${resultLabel}`,
      'color: #ffd700; font-weight: bold',
      bet.serverSeed ? '(seeds captured)' : '(partial)'
    );
  }

  function findSeeds(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 8) return null;

    // Direct field mapping
    const result = {};
    let found = false;

    const fieldMap = {
      serverSeed: ['serverSeed', 'server_seed', 'serverHash', 'secret'],
      clientSeed: ['clientSeed', 'client_seed', 'seed'],
      nonce: ['nonce', 'round', 'betNonce', 'game_nonce'],
      hashedServerSeed: ['hashedServerSeed', 'hashed_server_seed', 'serverSeedHash', 'hash'],
      game: ['game', 'gameType', 'game_type', 'type', 'gameName'],
      result: ['result', 'outcome', 'roll', 'multiplier', 'crashPoint', 'payout'],
      betAmount: ['amount', 'betAmount', 'bet_amount', 'wager', 'stake'],
      profit: ['profit', 'payout', 'win', 'winAmount'],
      betId: ['id', 'betId', 'bet_id', 'gameId', 'roundId'],
    };

    for (const [key, aliases] of Object.entries(fieldMap)) {
      for (const alias of aliases) {
        if (obj[alias] !== undefined && obj[alias] !== null && obj[alias] !== '') {
          result[key] = obj[alias];
          found = true;
          break;
        }
      }
    }

    if (found && (result.serverSeed || result.hashedServerSeed || result.nonce !== undefined)) {
      return result;
    }

    // Search nested objects and arrays
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) {
        for (const item of val) {
          const nested = findSeeds(item, depth + 1);
          if (nested) return nested;
        }
      } else if (typeof val === 'object' && val !== null) {
        const nested = findSeeds(val, depth + 1);
        if (nested) return nested;
      }
    }

    return null;
  }

  // ═══════════════════════════════════════════════════
  // VERIFICATION — Verify captured bets inline
  // ═══════════════════════════════════════════════════

  function hmacSHA256(serverSeed, message) {
    // Browser-compatible HMAC-SHA256
    return crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(serverSeed),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    ).then(key =>
      crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
    ).then(sig =>
      Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
    );
  }

  async function verifyBet(bet) {
    if (!bet.serverSeed || !bet.clientSeed) {
      return { verified: false, reason: 'Missing server seed or client seed. Rotate your seed to reveal it.' };
    }

    const hash = await hmacSHA256(bet.serverSeed, `${bet.clientSeed}:${bet.nonce || 0}`);

    // Dice verification
    const diceResult = (parseInt(hash.slice(0, 8), 16) % 10001) / 100;

    // Limbo verification
    const limboInt = parseInt(hash.slice(0, 8), 16);
    let limboResult;
    if (limboInt % 101 === 0) {
      limboResult = 1.00;
    } else {
      limboResult = Math.max(1, Math.floor((Math.pow(2, 32) / (limboInt + 1)) * 0.99) / 100);
    }

    return {
      verified: true,
      hash: hash,
      diceResult: diceResult.toFixed(2),
      limboResult: limboResult.toFixed(2),
      reportedResult: bet.result,
      casino: bet.casino,
      game: bet.game,
    };
  }

  // ═══════════════════════════════════════════════════
  // PUBLIC API — window.PF
  // ═══════════════════════════════════════════════════

  window.PF = {
    // List all captured bets
    list() {
      if (captured.length === 0) {
        console.log('%c[PF] No bets captured yet. Play a game!', 'color: #f59e0b');
        return;
      }
      console.table(captured.map(b => ({
        '#': b.id,
        game: b.game || '?',
        result: b.result || '?',
        seeds: b.serverSeed ? 'full' : b.hashedServerSeed ? 'hashed' : 'partial',
        time: new Date(b.timestamp).toLocaleTimeString(),
      })));
    },

    // Verify the last bet (or by index)
    async verify(index) {
      const bet = index ? captured[index - 1] : captured[captured.length - 1];
      if (!bet) {
        console.log('%c[PF] No bet to verify', 'color: #ef4444');
        return;
      }

      console.log(`%c[PF] Verifying bet #${bet.id}...`, 'color: #6366f1');
      const result = await verifyBet(bet);

      if (result.verified) {
        console.log('%c[PF] Verification Results:', 'color: #22c55e; font-weight: bold; font-size: 13px');
        console.log(`  Hash: ${result.hash}`);
        console.log(`  Dice result: ${result.diceResult}`);
        console.log(`  Limbo result: ${result.limboResult}x`);
        if (result.reportedResult !== undefined) {
          console.log(`  Casino reported: ${result.reportedResult}`);
        }
        console.log(`%c  For full verification with all game types: https://rakestake.com/verify`, 'color: #6366f1');
      } else {
        console.log(`%c[PF] ${result.reason}`, 'color: #f59e0b');
      }

      return result;
    },

    // Export all captured bets as JSON file
    export() {
      if (captured.length === 0) {
        console.log('%c[PF] Nothing to export', 'color: #f59e0b');
        return;
      }

      const clean = captured.map(b => ({
        id: b.id,
        casino: b.casino,
        game: b.game,
        timestamp: b.timestamp,
        serverSeed: b.serverSeed,
        clientSeed: b.clientSeed,
        hashedServerSeed: b.hashedServerSeed,
        nonce: b.nonce,
        result: b.result,
        betAmount: b.betAmount,
        profit: b.profit,
        betId: b.betId,
      }));

      const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `provably-fair-bets-${casino}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      console.log(`%c[PF] Exported ${clean.length} bets`, 'color: #22c55e; font-weight: bold');
    },

    // Clear captured bets
    clear() {
      captured.length = 0;
      captureCount = 0;
      console.log('%c[PF] Cleared all captured bets', 'color: #6366f1');
    },

    // Get raw data for a specific bet
    raw(index) {
      const bet = index ? captured[index - 1] : captured[captured.length - 1];
      if (bet) console.log(bet.raw);
      else console.log('%c[PF] No bet found', 'color: #ef4444');
      return bet?.raw;
    },

    // Count
    get count() { return captured.length; },

    // Help
    help() {
      console.log(`
%c═══ Provably Fair Bet Capture ═══%c

Commands:
  PF.list()      List all captured bets
  PF.verify()    Verify the last captured bet
  PF.verify(3)   Verify bet #3
  PF.export()    Download all bets as JSON
  PF.raw()       View raw API data for last bet
  PF.raw(3)      View raw API data for bet #3
  PF.clear()     Clear all captured data
  PF.count       Number of captured bets
  PF.help()      Show this help

How it works:
  This script intercepts API responses from the casino.
  When a bet is placed, it captures seed data automatically.

  Note: Server seeds are only revealed AFTER you rotate.
  Until then, only the hashed server seed is captured.

Full verification tool: https://rakestake.com/verify
Source code: https://github.com/rakestake/provably-fair-scripts
      `, 'color: #ffd700; font-weight: bold; font-size: 14px', 'color: #94a3b8');
    },
  };

  // Show help on load
  console.log('%c[PF] Type PF.help() for commands', 'color: #94a3b8');

})();
