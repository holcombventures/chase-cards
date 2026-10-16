# Hype tracker

Bobby says `/tools/hype` is not intuitive. This is the spec for clearer instructions and an intent selector. It is based on a survey of MTGGoldfish, MTGStocks, Collectr, Card Ladder, PokeData, Limitless, databorn.ink, and TCGplayer.

Free data only. No accounts. No new vendors or keys. No environment changes. Magic: The Gathering is included on this tracker when the existing keyless catalog can supply it. It is not added to Box EV or grading.

## Layout

A one-line purpose: "See which cards are heating up, and why".

Then the intent picker (cards or tabs). Then the game and set pickers. Then that view's controls.

A collapsible "How this works" panel opens on the first visit (localStorage). It contains:

1. Pick what you want to track.
2. Choose a game (and set).
3. Tap ☆ to add favorites, saved in this browser, no account needed.

Each view gets its own 2–3 line explanation and tooltips. The results table shows only that view's columns. A plain-English data status line sits at the bottom (no "Unavailable" or "Skipped").

The intent is remembered in localStorage and in `?view=`.

## Views

### 1. What's hot (default)

Hype is always shown as 0–100, rescaled when a source is down. Add "why" chips, for example "In 41% of decks", "3 Reddit posts", "Set out 9 days". Show cards $1 and up, top 20.

### 2. My favorites

Starred cards across all games and sets, stored in localStorage. Show the price, the change since the last visit ($ and %), a 7-day change once history exists, and an optional on-page target-price highlight.

Empty state: "No favorites yet. Tap ☆ on any card…".

Fetch cards per favorited set, cached in the browser.

### 3. Tournament cards

The percent of Limitless decklists that play the card (count decks, not copies), average copies, price, and a "played + pricey" flag. The window is the last 6 big events, and the page states that window.

Riftbound: "No public decklists yet".

### 4. Price swings

Window 24h / 7d / 30d (default 7d). Direction Up / Down / Both. Threshold ±5 / ±10 / ±20% (default ±10%). $1 minimum. Under / over $60 tabs. Sorted by the biggest percent move.

Empty states:

- "7-day moves unlock &lt;date&gt;" while history builds.
- "No cards moved ±10% above $1 in 7 days, try ±5%".

### 5. New and upcoming sets

Sets out 45 days or less, plus known upcoming sets, with their top chase cards and buzz.

## Scoring

Weights: Tournaments 45 (based on deck share), Buzz 35, Timing 20.

Always show the total out of 100, with per-signal points in a detail panel. When a source is down, rescale the signals that did load so the total is still out of 100.

## Data work

### Daily price snapshots

A Netlify scheduled function (configured with `netlify.toml` or a config export, no environment changes) snapshots prices for every set in each game once a day into Blobs and keeps about 35 days. Price swings and the favorites 7-day column read from that history. Stay light on upstream APIs.

### Limitless

Count decks per card. A decklist that includes the card counts once, no matter how many copies it plays. Average copies is the copy total divided by the number of decks that include the card. The sample is the last 6 big events.

### Reddit

Stagger the fetches so a refresh does not burst Limitless and Reddit together. Cache successes for 12 hours. When Reddit returns 429, show: "Reddit is busy right now, so hype uses tournaments + set age for this game".
