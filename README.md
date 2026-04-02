
# Provably Fair Verification Scripts

Open-source crypto casino game verification tools. Verify Keno, Dice, Limbo, Mines, Plinko, Crash, and Blackjack outcomes using HMAC-SHA256.

Works with **Stake, Shuffle, BC.Game, Rollbit, Roobet, Rainbet, Duel**, and any casino using standard provably fair algorithms.

## What This Does

Every provably fair crypto casino generates game outcomes from three inputs:
- **Server Seed** — chosen by the casino, pre-committed as a SHA-256 hash
- **Client Seed** — chosen by you
- **Nonce** — increments with each bet

These scripts recalculate the game result from your seeds, so you can independently verify the casino didn't cheat.

## Supported Games

| Game | Algorithm | Status |
|------|-----------|--------|
| Dice | HMAC-SHA256 → float → roll | Verified |
| Limbo/Crash | HMAC-SHA256 → crash point | Verified |
| Keno | HMAC-SHA256 → 10 unique picks | Verified |
| Mines | HMAC-SHA256 → mine positions | Verified |
| Plinko | HMAC-SHA256 → bit path | Verified |
| Blackjack | HMAC-SHA256 → card sequence | Verified |

## Quick Start

```javascript
const crypto = require('crypto');

// Core: Generate game hash from seeds
function gameHash(serverSeed, clientSeed, nonce) {
  return crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest('hex');
}

// Dice: Convert hash to roll (0.00 - 100.00)
function verifyDice(serverSeed, clientSeed, nonce) {
  const hash = gameHash(serverSeed, clientSeed, nonce);
  const hex = hash.slice(0, 8);
  const decimal = parseInt(hex, 16);
  return (decimal % 10001) / 100; // 0.00 to 100.00
}

// Limbo/Crash: Convert hash to multiplier
function verifyLimbo(serverSeed, clientSeed, nonce, houseEdge = 0.01) {
  const hash = gameHash(serverSeed, clientSeed, nonce);
  const hex = hash.slice(0, 8);
  const intValue = parseInt(hex, 16);
  
  // 1 in 101 chance of instant crash (house edge)
  if (intValue % 101 === 0) return 1.00;
  
  const e = Math.pow(2, 32);
  const result = Math.floor((e / (intValue + 1)) * (1 - houseEdge)) / 100;
  return Math.max(1, result);
}

// Keno: Generate 10 unique numbers from 1-40
function verifyKeno(serverSeed, clientSeed, nonce) {
  const picks = [];
  let cursor = 0;
  
  while (picks.length < 10) {
    const hash = gameHash(serverSeed, `${clientSeed}:${cursor}`, nonce);
    for (let i = 0; i < hash.length - 7 && picks.length < 10; i += 8) {
      const value = parseInt(hash.slice(i, i + 8), 16);
      const tile = (value % 40) + 1;
      if (!picks.includes(tile)) picks.push(tile);
    }
    cursor++;
  }
  
  return picks;
}

// Mines: Determine mine positions on a 5x5 grid
function verifyMines(serverSeed, clientSeed, nonce, mineCount = 3) {
  const tiles = Array.from({ length: 25 }, (_, i) => i);
  const hash = gameHash(serverSeed, clientSeed, nonce);
  
  // Fisher-Yates shuffle using hash bytes
  for (let i = tiles.length - 1; i > 0; i--) {
    const byteIndex = (tiles.length - 1 - i) * 2;
    const hexPair = hash.slice(byteIndex % hash.length, (byteIndex % hash.length) + 2) || 'ff';
    const j = parseInt(hexPair, 16) % (i + 1);
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  
  return tiles.slice(0, mineCount); // First N positions are mines
}

// Plinko: Determine ball path (left/right at each row)
function verifyPlinko(serverSeed, clientSeed, nonce, rows = 16) {
  const hash = gameHash(serverSeed, clientSeed, nonce);
  const path = [];
  
  for (let i = 0; i < rows; i++) {
    const byteIndex = Math.floor(i / 4);
    const bitIndex = i % 4;
    const byte = parseInt(hash.slice(byteIndex * 2, byteIndex * 2 + 2), 16);
    const direction = (byte >> bitIndex) & 1; // 0 = left, 1 = right
    path.push(direction === 0 ? 'L' : 'R');
  }
  
  return path;
}

// Example usage
const serverSeed = 'your_revealed_server_seed_here';
const clientSeed = 'your_client_seed';
const nonce = 42;

console.log('Dice roll:', verifyDice(serverSeed, clientSeed, nonce));
console.log('Limbo multiplier:', verifyLimbo(serverSeed, clientSeed, nonce));
console.log('Keno picks:', verifyKeno(serverSeed, clientSeed, nonce));
console.log('Mine positions:', verifyMines(serverSeed, clientSeed, nonce));
console.log('Plinko path:', verifyPlinko(serverSeed, clientSeed, nonce));
```

## How to Get Your Seeds

1. Go to your casino's bet history
2. Find the bet you want to verify
3. Click "Provably Fair" or "Verify" on the bet
4. Copy: **Server Seed** (revealed after you rotate), **Client Seed**, and **Nonce**
5. Run the appropriate verification function above

## Verify Without Code

Don't want to run scripts? Use our free browser-based verification tool:

**[rakestake.com/verify](https://rakestake.com/verify)** — Select your casino and game, paste your seeds, click verify. Everything runs client-side in your browser. No data is sent to any server.

## Casino Compatibility

| Casino | Dice | Limbo | Keno | Mines | Plinko | Crash |
|--------|:----:|:-----:|:----:|:-----:|:------:|:-----:|
| Stake | Yes | Yes | Yes | Yes | Yes | Yes |
| Shuffle | Yes | Yes | Yes | Yes | Yes | Yes |
| BC.Game | Yes | Yes | Yes | Yes | Yes | Yes |
| Rollbit | Yes | Mod. | - | Yes | Yes | Yes |
| Roobet | Yes | Yes | - | - | - | Yes |

*"Mod." = Modified algorithm, our tool handles the differences automatically.*

## How Provably Fair Works

```
Before your bet:
  Casino commits: SHA256(serverSeed) → published hash
  You set: clientSeed
  
During your bet:
  Result = Algorithm(HMAC-SHA256(serverSeed, clientSeed:nonce))
  
After your bet:
  Casino reveals: serverSeed
  You verify: SHA256(revealed) === committed hash ✓
  You verify: Algorithm(HMAC-SHA256(revealed, clientSeed:nonce)) === result ✓
```

If both checks pass, the casino provably could not have manipulated the outcome.

## Earn Rakeback on Your Bets

While you're verifying your bets, you might as well earn cashback on them. [Rakestake](https://rakestake.com) offers up to 15% rakeback on every bet across 10+ partner casinos — automatically, on top of any casino bonuses.

- Up to **15% rakeback** on every bet
- **Weekly ~$4,000 lottery** — earn tickets by playing
- **VIP tiers** — higher level = higher rakeback
- Works with all the casinos listed above

[Learn more at rakestake.com](https://rakestake.com/how-it-works)

## License

MIT — Use freely. If you find this useful, a star helps others discover it.

## Contributing

PRs welcome. If you've reverse-engineered a casino's verification algorithm that isn't listed, we'd love to add it.
