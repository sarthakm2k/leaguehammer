# LeagueHammer player ratings

Overall uses LeagueHammer's own position weights. These are inspired by football roles and do not reproduce EA's proprietary rating formula.

For each entered attribute, multiply its rating by its position weight. Divide the sum by the sum of weights for **entered attributes only**, then round to the nearest integer (halves round up). Overall and attributes range from 1 to 99. If no attributes in the active profile are entered, overall stays blank. Goalkeepers use their six goalkeeper attributes; outfield attributes do not affect goalkeeper overall, and vice versa.

| Card position | PAC | SHO | PAS | DRI | DEF | PHY |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ST | 20% | 35% | 10% | 20% | 5% | 10% |
| CF | 15% | 30% | 20% | 25% | 5% | 5% |
| LW / RW | 30% | 20% | 15% | 25% | 5% | 5% |
| LM / RM | 25% | 10% | 25% | 25% | 5% | 10% |
| CAM | 10% | 20% | 30% | 30% | 5% | 5% |
| CM | 10% | 10% | 35% | 20% | 15% | 10% |
| CDM | 10% | 5% | 25% | 10% | 30% | 20% |
| CB | 10% | 5% | 10% | 5% | 45% | 25% |
| LB / RB | 20% | 5% | 20% | 10% | 30% | 15% |
| LWB / RWB | 25% | 5% | 25% | 15% | 20% | 10% |

| Card position | DIV | HAN | KIC | REF | SPD | POS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| GK | 25% | 20% | 5% | 30% | 5% | 15% |

When card position is absent, Forward uses ST, Midfielder uses CM, Defender uses CB, and Goalkeeper uses GK. An unspecified playing position uses equal outfield weights. An explicit card position takes precedence.

Example: with only PAC 99 and SHO 80 entered, ST overall is `round((99 × 20 + 80 × 35) / 55) = 87`; LW overall is `round((99 × 30 + 80 × 20) / 50) = 91`. Missing attributes are not treated as zero.

Overall is computed from saved attributes whenever player data is returned, so existing players automatically use the current formula without a migration or data rewrite. Unrated players remain unrated. The editor recalculates immediately when attributes or position change; saved ratings are recalculated by the backend for auctioneer, public and projector responses.

Backend and frontend implementations are covered by matching reference cases for all 15 card positions, partial and empty ratings, the 99 cap, and broad position fallbacks. The browser workflow also verifies editor previews against saved ratings and live auction updates.
