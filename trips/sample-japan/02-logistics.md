# Logistics for Japan

## Night split
| City | Nights | Reason |
|---|---|---|
| Tokyo | 2 | Entry city, covers the Asakusa temple/food circuit and a quieter Nezu/Yanaka temple-lane zone |
| Kyoto | 2 | Even split (4 total nights, even), Kyoto Station hub reaches both the Higashiyama temple cluster and the Shimogyo temple/food-hall cluster |

## Stay areas

### Tokyo
| Area | Why (fits likes/avoids) | Example hotel | Rating (count) | Price level | Source |
|---|---|---|---|---|---|
| Nezu / Yanaka (Ikenohata) | Quiet residential lanes with small temples and shrines, next to Ueno Park, away from the Shibuya/Shinjuku crowd density, fits food + temples + avoid crowds | HOTEL GRAPHY NEZU | 4.3 (829) | not returned by tool | tool |
| Nezu / Yanaka (Ikenohata) | same as above | The Barn Tokyo | 4.8 (224) | not returned by tool | tool |
| Asakusa (Nishiasakusa) | Alternative base right by Senso-ji and the Kappabashi/Nakamise food streets, most iconic but the busiest zone in the itinerary | plat hostel keikyu asakusa station | 4.4 (350) | not returned by tool | tool |
| Asakusa (Nishiasakusa) | same as above, budget option near the station | TOKYO-W-inn Asakusa | 4.4 (347) | not returned by tool | tool |

### Kyoto
| Area | Why (fits likes/avoids) | Example hotel | Rating (count) | Price level | Source |
|---|---|---|---|---|---|
| Shimogyo Ward (near Kyoto Station) | Walking distance to Nishi Hongan-ji, Higashi Hongan-ji and station food halls, easy Shinkansen access, calmer than the Higashiyama alleys | KIORI Exec Muromachi Hotel | 4.8 (33) | not returned by tool | tool |
| Shimogyo Ward (near Kyoto Station) | same as above | Onyado Nono Kyotoshichijo | 4.5 (2652) | not returned by tool | tool |
| Nakagyo Ward (central) | Alternative base near Nishiki Market and the Pontocho dining alley, more food density but also more foot traffic than Shimogyo | Cross Hotel Kyoto | 4.7 (2390) | not returned by tool | tool |
| Nakagyo Ward (central) | same as above, budget hostel option | PIECE HOSTEL SANJO | 4.7 (1797) | not returned by tool | tool |

## Inter-city
| From | To | Train | Line | Duration min | Fare JPY reserved | Source (url) |
|---|---|---|---|---|---|---|
| Tokyo | Kyoto | Nozomi | Tokaido Shinkansen | 195 | 13970 | https://smart-ex.jp/en/product/plan/service/, 195 = 135 seeded ride + 60 min station/transfer allowance (estimate) |

## Day skeleton
| Day | City | Base area | Morning zone | Afternoon zone | Evening zone | Est. transit min between zones |
|---|---|---|---|---|---|---|
| 1 | Tokyo | Nezu / Yanaka | Asakusa (temple) | Asakusa (Kappabashi food street) | Asakusa (Hoppy Street food alley) | Morning to afternoon 13, afternoon to evening 14 |
| 2 | Tokyo | Nezu / Yanaka | Nezu / Yanaka (shrine lanes) | Nezu / Yanaka (Yanaka Ginza food street) | Ueno (near base) | Morning to afternoon 14, afternoon to evening 23 |
| 3 | Kyoto | Shimogyo Ward | Shinkansen Tokyo to Kyoto (195 min, see Inter-city) | Higashiyama (temple, historic lane) | Higashiyama (Gion, food) | Within afternoon zone 7, afternoon to evening 11 |
| 4 | Kyoto | Shimogyo Ward | Shimogyo (temple) | Shimogyo (temple) | Shimogyo (station food hall) | Morning to afternoon 11, afternoon to evening 5 |
| 5 | Kyoto | Shimogyo Ward | Shimogyo (final temple/food, departure day) | departure, not scheduled | departure, not scheduled | not applicable |

## Slot transit times

The day skeleton above groups by zone. The itinerary draft (`04-itinerary-draft.md`) commits to specific venues within those zones, each pair below is the walking-route minutes for that exact venue-to-venue move, used as the transit-minute proxy since Google Routes has no transit (subway/bus) data for Japan, per project rule. `get_rail_route` was tried for the two long Kyoto crossings (Kyoto Station to Arashiyama) and returned "not in seed data", it only covers the seeded intercity Shinkansen pairs, not intracity segments, so those two rows also fall back to the walking-route figure.

| Day | Slot | From | To | Minutes | Source |
|---|---|---|---|---|---|
| 1 | afternoon | Meiji Jingu | Tokyo Ramen Street (Tokyo Station) | 102 | tool (walking route) |
| 1 | evening | Tokyo Ramen Street (Tokyo Station) | Yakitori Alley (Yurakucho) | 18 | tool (walking route) |
| 2 | afternoon | Zojo-ji | Pocha Korean Street Food (Shibuya, Honmachi) | 120 | tool (walking route) |
| 2 | evening | Pocha Korean Street Food (Shibuya, Honmachi) | Toranomon Yokocho | 111 | tool (walking route) |
| 3 | afternoon | Kyoto Station | Otagi Nenbutsuji (Ukyo Ward, Arashiyama) | 139 | tool (walking route, get_rail_route returned "not in seed data" for this pair) |
| 3 | evening | Otagi Nenbutsuji (Ukyo Ward, Arashiyama) | chao chao gyoza kyoto (Nakagyo Ward) | 139 | tool (walking route) |
| 4 | afternoon | Fushimi Inari Taisha | To-ji Temple (Minami Ward) | 49 | tool (walking route) |
| 4 | evening | To-ji Temple (Minami Ward) | Kiyamachi-Kawaramachi dining strip | 65 | tool (walking route) |
| 5 | afternoon | Ryoan-ji | Kyoto Station (departure transfer) | 108 | tool (walking route) |
| 5 | evening | n/a, free slot | n/a, no venue, staying at the departure point | 0 | no lookup needed |

Several of these figures are well over a comfortable walking distance (for example 139 minutes Kyoto Station to Arashiyama). They are reported as the walking-route tool's actual output, not an invented transit estimate, because no transit-mode data exists for Japan in the routing tool and `get_rail_route` does not cover intracity segments. In practice a visitor would take a local train or bus for these legs in well under the listed minutes, that real duration could not be verified with the tools available and is not stated here.

## Could not verify
None of the tool calls returned an error. All hotel searches, the rail segment, and every walking-route pair used in the skeleton and in the slot transit times table returned data. Two anchor pairs (Kyoto Station area temples to Kyoto Tower area) initially returned over 40 minutes on a loosely specified place string during the original build, they were re-queried with fuller addresses and replaced in the skeleton with the anchors that came back under 40 minutes, per rule 5. The nine venue-to-venue pairs in the Slot transit times table above were looked up on request against the specific venues already committed in the itinerary draft rather than swapped, their walking-route minutes are reported as-is with the caveat above that they exceed a walking-distance transit time for several long Kyoto crossings.
