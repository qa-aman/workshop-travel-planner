# Logistics for Japan

## Night split
| City | Nights | Reason |
|---|---|---|
| Tokyo | 3 | Food + temple access (Asakusa, Yanaka), balanced against 5-day total |
| Kyoto | 2 | Highest temple density, needs early starts to dodge crowds |

Total nights = 4 (5-day trip). Even split, no city gets a spare night since both carry equal must-do weight (Tokyo for food, Kyoto for temples).

## Stay areas

### Tokyo
| Area | Why (fits likes/avoids) | Example hotel | Rating (count) | Price level | Source |
|---|---|---|---|---|---|
| Nezu / Yanaka (Ikenohata, quiet backstreets) | Old-town shrines, low foot traffic, away from Shibuya/Shinjuku crowds, close to local food alleys | HOTEL GRAPHY NEZU | 4.3 (829) | not returned by tool | search_places |
| Nezu / Yanaka (alt.) | Same area, boutique option | The Barn Tokyo | 4.8 (224) | not returned by tool | search_places |
| Asakusa (near station, temple + food) | Senso-ji on foot, izakaya and street-food alleys, well connected by rail | plat hostel keikyu asakusa station | 4.4 (350) | not returned by tool | search_places |
| Asakusa (alt.) | Near station, guesthouse-style | TOKYO-W-inn Asakusa | 4.4 (347) | not returned by tool | search_places |

### Kyoto
| Area | Why (fits likes/avoids) | Example hotel | Rating (count) | Price level | Source |
|---|---|---|---|---|---|
| Higashiyama Ward | Walking distance to Kiyomizu-dera and the temple lanes, best done at opening to avoid crowds | Imperial Hotel Kyoto | 4.6 (72) | not returned by tool | search_places |
| Higashiyama (alt., Nakagyo edge) | Close to Gion food streets, still away from the main station bustle | Mitsui Garden Hotel Kyoto Sanjo Premier | 4.6 (453) | not returned by tool | search_places |
| Kyoto Station area (Shimogyo) | Station access for Fushimi Inari / day trips, food court and station-front dining | M's Hotel Kyoto Station Taruya | 3.9 (272) | not returned by tool | search_places |
| Kyoto Station (alt., budget) | Cheapest station-front option | HOTEL LiVEMAX KYOTO-EKIMAE | 3.2 (408) | not returned by tool | search_places |

Note: `search_places` did not return a `price_level` value for any result in this run, so price level is marked "not returned by tool" rather than estimated.

## Inter-city
| From | To | Train | Line | Duration min | Fare JPY reserved | Source (url) |
|---|---|---|---|---|---|---|
| Tokyo | Kyoto | Nozomi | Tokaido Shinkansen | 135 | 13,970 | https://smart-ex.jp/en/product/plan/service/ |

Note (seed data): Nozomi is all-reserved during New Year, Golden Week and Obon. Hikari is about 160 min, fare 13,650 JPY, and is covered by the JR Pass. Fares can move by 200 to 400 JPY per the same table depending on peak/off-peak/super-peak timing.

## Day skeleton
| Day | City | Base area | Morning zone | Afternoon zone | Evening zone | Est. transit min between zones |
|---|---|---|---|---|---|---|
| 1 | Tokyo | Asakusa | Asakusa (Senso-ji, early to avoid crowds) | Asakusa food alleys (Nakamise, Kappabashi) | Asakusa izakaya row | 0 (same zone) |
| 2 | Tokyo | Nezu / Yanaka | Yanaka Ginza old town | Nezu Shrine and backstreets | Ueno food street (Ameyoko) | 14 (Yanaka Ginza to Nezu Shrine, tool), 26 (Nezu Shrine to Ameyoko, Ueno, tool), Asakusa to Nezu zone earlier in trip is 52, walk, or metro (time could not verify) if crossing same day |
| 3 | Kyoto (travel day) | Higashiyama | Shinkansen Tokyo to Kyoto: 195 min total block (135 min Nozomi ride, seed, plus 60 min for platform transfer, luggage and buffer at each end) | Honenin Temple (Sakyo Ward), a quieter alternative to the main Higashiyama crowds | Gion food streets | Kyoto Station to Honenin Temple is 89 min walk, or metro (time could not verify), tool, Honenin to Gion food streets could not verify (no route pulled for this leg) |
| 4 | Kyoto | Higashiyama / Kyoto Station | Higashiyama early (Kiyomizu-dera at opening) | Kyoto Station area food court and depachika | Pontocho / Kyoto Station dining | 38 (Kiyomizu-dera to Kyoto Station, tool) |

Day 5 is a half-day departure from Kyoto, not scheduled here since no return leg or flight time was given in the brief.

Extra verified walking legs (for optional day-trip planning, not assigned to a specific day above):
- Kyoto Station area to Fushimi Inari Taisha: 40 min walk, tool.
- Nezu Shrine to Ueno food street (Ameyoko): 26 min walk, tool.

## Could not verify
- Hotel price levels: `search_places` returned no `price_level` for any Tokyo or Kyoto result, so no price signal is given for any hotel above.
- A same-day Asakusa-to-Nezu crossing time is a walk of 52 minutes per the tool, if used as a single-day move rather than an overnight base change, treat it as "walk 52 min, or metro (time could not verify)."
- Honenin Temple to Gion food streets: no route was pulled for this specific leg, so transit time could not verify.
- Kyoto Station to Honenin Temple is a 89 min walk per the tool, since this is over 40 minutes, treat it as "walk 89 min, or metro (time could not verify)" rather than a stated metro time.
