# either

**The internet’s arena.**  
**Rally your people. Settle it here.**

either turns two-sided internet rivalry into a live, capital-backed competition.

A round puts two sides head-to-head for a fixed period of time. Participants back a side with a stablecoin — USDG in the current round — rally others, and move the score. When the clock runs out, the round settles and one side wins.

Backing gives participation weight without turning the round into winner-takes-loser wagering. Losing a round does not, by itself, transfer a user’s backing to the other side. Uncommitted principal and attributable net yield remain redeemable under the round’s published terms and the conditions of the underlying strategy.

Winning can also create something new. If the winning side meets the required backing threshold, eligible backers may choose to commit part or all of their available principal to a community token launch. Only capital explicitly committed after the round enters the launch process.

**Back. Rally. Win.**

---

## How either works

A round follows five stages.

### 1. Back

Choose a side and commit USDC to it.

Backing determines the weight of each side in the round. It also creates an individual balance that remains attributable to the backer throughout the round.

### 2. Rally

Bring others to your side.

As new backing enters, the score moves in real time. The product is designed around visible competition: two sides, one clock, and a result that participants can influence directly.

### 3. Settle

When the round closes, either determines the winner using the scoring rules published before the round began.

The current v1 design uses valid backing principal at the cutoff time as the score. Yield does not increase a side’s score. Final scoring rules, tie handling, and withdrawal rules will be fixed before a production round opens.

### 4. Redeem

After settlement, users can redeem backing that has not been committed to a launch, together with any net yield attributable to that backing.

Winning does not transfer the losing side’s principal or yield to the winner.

### 5. Launch

If the winning side meets the launch eligibility threshold, eligible winning backers may choose whether to participate in a community token launch and how much of their available principal to commit.

If enough valid commitments are received, the launch proceeds. If the launch threshold is not met, committed funds are released back to users.

**The community exists before the token does.**

---

# Core concepts

## Rounds

A **Round** is a time-bounded competition between two sides.

Each round defines, before opening:

- network
- Side A and Side B
- supported USDC contract
- start and end time
- scoring method
- tie and cancellation rules
- withdrawal rules
- yield strategy and fee treatment
- launch eligibility threshold
- launch funding threshold
- launch window and liquidity terms, if launch is enabled

Once a round is active, material rules should not be changed retroactively.

## Sides

A **Side** is one of the two participants in a round. A side may represent a person, community, brand, project, team, idea, or other eligible subject.

A round appearing on either does not by itself imply that the people, brands, or organizations referenced in it participated in, authorized, or endorsed the round.

## Backing

**Backing** is the USDC a user commits to a side during a round.

Backing serves two functions:

1. it contributes to the side’s score; and
2. it represents the user’s capital position in the backing layer.

Backing does **not** automatically purchase a token, authorize a future token purchase, or transfer ownership of principal to the opposing side.

## Score

The **Score** is the metric used to determine which side wins a round.

Under the current v1 design:

`Score(side) = valid backing principal at round close`

The displayed share is:

`Side A share = A backing / (A backing + B backing)`

`Side B share = B backing / (A backing + B backing)`

If neither side has valid backing, the interface should show that no backing has been recorded rather than imply a 50/50 split.

---

# Participation, not prediction

either is not designed to price an external event.

In a prediction market, a participant takes a position on an outcome that is ultimately determined outside the market: an election result, a sports match, an economic release, or another external event.

In either, the competition itself is the event. Participants are not trying to forecast who will win somewhere else. They are trying to make their side win **inside the round** by contributing backing and rallying others.

| | Prediction market | either |
|---|---|---|
| User intent | Be right about an outcome | Help a side win |
| Result source | External event | Published round rules |
| Participation | Prices a forecast | Moves the score |
| Oracle for the round result | Usually required for external settlement | Not required for the internal round result |
| Losing side principal | Subject to the market’s payoff structure | Not transferred to the winning side solely because of the result |

This distinction applies to **round settlement**. Yield venues, stablecoins, bridges, or other infrastructure used by either may have their own oracle, governance, custody, and market dependencies.

---

# Backing and yield

## The backing layer

Backing capital may be routed into approved yield strategies while it remains in the backing layer.

Conceptually:

`USDC → either Backing Layer → Approved Yield Strategy → Yield`

Both sides participate in the economics of their own backing. Winning a round does not create a claim on the losing side’s yield.

## Yield accounting

Yield must be based on actual strategy performance rather than a fixed or advertised return.

For a user with realized distributable positive yield `G` and a protocol yield fee `f`:

`Protocol fee = f × G`

`User net yield = (1 − f) × G`

In the current round the fee is **10%** of realized positive yield, charged only when yield is positive. Principal is never charged, and negative yield is not topped up.

either should account for capital according to the time and amount actually deployed in a strategy. A user entering near the end of a round should not receive yield earned before their capital was deployed.

## What “your backing stays yours” means

It means the outcome of the round does not, by itself, transfer a user’s principal to the opposing side.

It does **not** mean:

- principal is guaranteed;
- USDC cannot depeg or be frozen;
- an underlying yield venue cannot incur losses;
- withdrawals are always instantaneous; or
- a user can redeem principal after voluntarily converting it into launch capital.

---

# Settlement and withdrawals

Settlement fixes the result of a round.

Under the current v1 design:

- Side A wins if its valid backing exceeds Side B’s at the cutoff.
- Side B wins if its valid backing exceeds Side A’s at the cutoff.
- A tie produces no winning-side launch eligibility unless a different tie rule is disclosed before the round opens.

After settlement:

### Losing backers

May redeem eligible principal and net yield. Their capital is not used for the winner’s launch.

### Winning backers — launch not eligible

If the winning side does not meet the backing threshold required for launch eligibility, users may redeem eligible principal and net yield.

### Winning backers — launch eligible

If the winning side qualifies, each eligible backer receives a choice:

- redeem all eligible principal;
- commit part of it to the launch; or
- commit all eligible principal to the launch.

Launch participation is never automatic.

---

# Winner Launch

## Win first. Launch after.

either reverses the usual launch sequence.

Instead of launching a token first and hoping a community forms around it, an either round lets a community form, compete, and demonstrate demand before a token can launch.

A winning round alone is not enough. A launch passes through two separate thresholds.

## 1. Launch eligibility

Let `H_B` be the **backing threshold**.

The winning side becomes eligible to open a launch window only if:

`Winning-side backing ≥ H_B`

This threshold measures whether the winning side demonstrated enough support during the round.

## 2. Launch funding

During the launch window, eligible winning backers choose how much of their available principal to commit.

For user `i`:

`commitment_i = eligible principal_i × selected percentage_i`

The selected percentage may range from 0% to 100%.

Let `C` be the total amount of valid launch commitments and `H_L` the **launch threshold**.

The launch proceeds only if:

`C ≥ H_L`

The two thresholds measure different things:

- `H_B` measures support during the round.
- `H_L` measures actual capital voluntarily committed to the launch.

In the current round both thresholds are **1 USDG**: the mechanism paths are exercised end to end while caps elsewhere limit exposure.

**Winning does not guarantee a launch. Qualifying for a launch does not mean the launch is funded.**

## If a launch fails

If the commitment window closes below `H_L`, or another disclosed launch condition cannot be satisfied:

- no launch liquidity pool is created;
- launch commitments are released;
- users retain their applicable withdrawal rights; and
- net yield remains attributable according to the backing ledger.

A failed launch must not convert a temporary commitment into a permanent loss of principal.

---

# Token allocation and liquidity

When a launch succeeds, the USDC explicitly committed to the launch is used for the Winner Token / USDC liquidity process under the disclosed launch configuration.

Uncommitted winning-side backing, losing-side backing, and user net yield do not enter the launch pool unless separately and explicitly authorized.

## Backer allocation

Let:

- `Q_B` = token supply allocated to launch participants;
- `C` = total valid launch commitments; and
- `c_i` = an individual user’s valid commitment.

The user’s allocation is:

`q_i = Q_B × c_i / C`

A user’s percentage of the backer allocation is not necessarily the same as their percentage of the total token supply.

## Liquidity

A successful launch creates a Winner Token / USDC market according to the pre-disclosed liquidity configuration.

The launch specification must define:

- total token supply;
- backer allocation;
- liquidity allocation;
- any other token allocation;
- initial pricing logic;
- AMM venue and fee tier;
- LP ownership and lock duration; and
- fee rights during and after the lock.

Locked liquidity restricts the ability to remove the LP position. It does not guarantee that the amount of USDC inside the pool remains constant: normal trading changes pool reserves.

Once committed USDC has been used in a successful token launch, that capital is no longer redeemable from either as backing principal. The user instead receives the token allocation defined by the launch.

---

# Fees

either’s current economic design is centered on a share of realized positive yield generated by backing capital.

A protocol fee should not be charged on user principal merely because capital was deposited or moved internally.

Additional fee paths — including launch services, post-launch trading economics, or data products — are not part of the confirmed base mechanism unless separately published for a production deployment.

All production fees should be disclosed before a user commits capital.

---

# Protocol architecture

The current design separates competition logic, backing capital, yield accounting, and launch capital so that one user action cannot implicitly authorize another.

A production implementation is expected to include the following logical components:

### Round Registry

Creates rounds and stores their immutable configuration.

### Round Manager

Tracks backing, scoring, cutoff rules, and final settlement.

### Backing Vault

Accounts for user principal, strategy shares, yield, and redemption rights.

### Strategy Adapter

Connects the backing layer to approved yield venues while isolating venue-specific logic.

### Launch Commitment Vault

Holds only the principal that eligible winning backers explicitly commit to a launch.

### Token Factory / Distributor

Creates the Winner Token under the disclosed configuration and records user allocations.

### Liquidity Launcher / Locker

Creates the liquidity position and applies the disclosed lock rules.

### Fee Collector

Receives protocol fees that have been earned under the published fee schedule. It must not have discretionary access to user principal.

### Indexer / API

Provides application data and historical views. Indexed data improves usability but is not the authoritative source for balances or settlement where onchain state is available.

### Networks

The current v1 round runs on **Robinhood Chain** (chain id 4663), with USDG as the backing stablecoin and gas paid in ETH. An earlier prototype round runs on the Arc testnet with a mock USDC; it is kept for reference and is superseded by the v1 design. Each round is created and settled on a single network, with its backing, yield accounting, launch commitments, token deployment, and liquidity kept within that network unless a future round explicitly publishes a cross-chain design. Chain-specific asset contracts, yield venues, fees, and execution conditions are disclosed at the round level.

---

# Round lifecycle

The protocol lifecycle is designed to keep settlement, redemption, and token launch logically separate.

`Draft → Scheduled → Active → Settled`

After settlement, a round can follow one of two paths:

`Settled → Redemption Only`

or

`Settled → Launch Window → Finalizing → Launched`

If a launch cannot complete:

`Launch Window / Finalizing → Launch Failed → Commitments Released`

Redemption rights for users who are not participating in a launch should not depend on the launch process completing.

---

# Security and invariants

either handles user capital. The protocol design therefore treats accounting and authorization boundaries as core product requirements.

The following properties are expected to hold:

- A user cannot commit more launch capital than they are entitled to authorize.
- Losing-side capital never enters the winner’s launch.
- Winning-side capital that was not explicitly committed never enters the launch.
- The same principal cannot be withdrawn, committed, and counted again simultaneously.
- Settlement, launch success, and launch failure each finalize only once.
- Token distributions cannot exceed the published backer allocation.
- Launch accounting must reconcile with actual USDC held for launch execution.
- Unredeemed strategy yield cannot be treated as liquid launch capital.
- Post-settlement withdrawals do not change the winning side.
- A launch failure returns valid commitments to a redeemable state.
- Assets, scores, and launch commitments from different networks are not combined unless a round explicitly defines and implements a cross-chain accounting mechanism.

Production contracts should be subject to independent security review before handling unrestricted user funds.

---

# The current round (v1)

The first vault round is configured as follows. These are the values the contracts enforce, not marketing copy.

| Parameter | Value |
|---|---|
| Network | Robinhood Chain, chain id 4663 |
| Backing stablecoin | USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` (6 decimals) |
| Yield venue | A USDG ERC-4626 vault `0x37788ff0c1d4e45A7FE06BC7e71e0cc00121d0A8` |
| Protocol yield fee | 10% of realized positive yield |
| Backing threshold `H_B` | 1 USDG |
| Launch threshold `H_L` | 1 USDG |
| Per-account cap | 100 USDG (contract-enforced) |
| Round cap | 2,000 USDG (contract-enforced) |
| Round ledger | `EitherRoundV2` — score, cutoff, settlement and launch accounting; it does not hold funds |
| Entry point | `DepositRouter` — one signed transaction records the deposit and moves USDG to a custodial address |

## Custody disclosure

**This round runs under a custodial model.** After you deposit, USDG sits in a per-user custodial address whose private key is generated and held by either. either moves funds into the vault and executes every withdrawal on your behalf; you sign only the deposit and withdrawal requests.

This means, plainly:

- either can move — and a compromise of either's infrastructure could lose — the funds in your custodial address;
- yield shown on either is computed by either, after its 10% fee. Figures on third-party vault interfaces are gross and cannot be matched to an individual user, because funds pass through custodial addresses;
- the custodial keys are stored encrypted (envelope encryption, keys isolated from the database), but no storage design removes the custody relationship itself;
- this round is a demo deployment. There is no insurance, no compensation scheme, and no guarantee of any kind. Cap your exposure accordingly — the 100 USDG per-account cap exists for this reason.

## Yield display

Yield figures on either are net: they reflect the vault's actual performance minus the 10% protocol fee. During the round, principal in the vault accrues continuously; the settlement and redemption flow prices your shares at the vault rate at that moment.

either combines competition mechanics with stablecoins, yield venues, smart contracts, and — when enabled — token launch and AMM liquidity. Each layer introduces separate risks.

## Custody risk

The current round is custodial: either holds the private keys of every custodial address and executes deposits into and withdrawals from the vault. Key compromise, operational failure, or insider misuse at either can result in total loss of the funds in your custodial address. Keys are encrypted at rest and hot-key permissions are scoped, but those measures reduce rather than remove this risk.

## Stablecoin risk

USDG may be subject to issuer, depeg, freeze, transfer, and smart-contract risk.

## Yield strategy risk

An underlying venue may experience smart-contract failure, bad debt, governance failure, liquidity constraints, or negative strategy performance.

Yield is not fixed and may be zero or negative after losses and costs.

## Withdrawal liquidity

A user may have a valid redemption claim while the underlying strategy requires time to return liquid assets. The interface must distinguish a withdrawal request from funds that are actually claimable.

## Launch risk

Committing principal to a successful launch converts that capital into launch participation. Winner Tokens may lose value, trade with high volatility, or become illiquid.

## AMM risk

Locked liquidity does not protect the market price or preserve a fixed amount of either reserve asset. Trading can materially change the composition and value of an LP position.

## Competition integrity

If score is capital-weighted, larger holders can exert greater influence. Address count is not the same as unique-person count, and per-wallet limits do not prevent Sybil splitting by themselves.

---

# FAQ

## If my side loses, do I lose my backing?

The round result does not transfer your backing to the winning side. After settlement, eligible principal and net yield can be redeemed according to the published withdrawal rules and the actual condition of the underlying strategy.

## Does the winning side receive the losing side’s yield?

No. Yield remains attributable to the capital that generated it, net of the published protocol fee.

## Is backing the same as buying the Winner Token?

No. Backing and launch participation are separate actions. A user must explicitly opt into the launch after the round, if the winning side is eligible.

## Can I commit only part of my backing to the launch?

Yes. The current design allows eligible winning backers to choose a commitment from 0% to 100% of their available principal.

## Why can a winning side fail to launch?

Winning determines the round result. Launch eligibility and launch funding are separate conditions. A winning side must first meet the backing threshold, and eligible users must then voluntarily commit enough launch capital before the launch window closes.

## What happens if the launch does not reach its threshold?

The launch does not proceed. Valid commitments are released and become redeemable according to the round’s withdrawal rules.

## Can I withdraw launch capital after a successful launch?

Not as backing principal. Once committed USDC has been used to complete the launch and seed liquidity, the user’s claim is the Winner Token allocation defined by the launch terms.

## Does either require an either platform token?

No. The current mechanism does not depend on an either platform token.

## Does a round imply endorsement by the people or brands named in it?

No. A round does not by itself imply participation, authorization, endorsement, or an official token launch by the referenced person, brand, or organization.

---

# Glossary

| Term | Meaning |
|---|---|
| **Round** | A time-bounded competition between two sides |
| **Side** | One of the two subjects competing in a round |
| **Backing** | USDC committed to support a side and recorded in the backing ledger |
| **Backer** | An address that provides backing |
| **Score** | The published metric used to determine the winning side |
| **Winner** | The side that wins after the round is settled |
| **Gross yield** | Actual distributable yield generated before the protocol fee |
| **Net yield** | Yield attributable to users after the protocol fee |
| **Backing threshold (`H_B`)** | Minimum winning-side backing required to become launch-eligible |
| **Launch commitment** | Principal an eligible winning backer explicitly commits to a launch |
| **Launch threshold (`H_L`)** | Minimum valid committed capital required for launch execution |
| **Launch window** | Period during which eligible winning backers choose or modify commitments |
| **Winner Token** | Token launched for an eligible winning side; not an either platform token |
| **Backer allocation (`Q_B`)** | Token supply reserved for valid launch participants |
| **LP allocation (`Q_L`)** | Token supply reserved for launch liquidity |
| **Locked liquidity** | An LP position subject to predefined withdrawal restrictions |

---

# Design status

either is under active development. Production parameters, contract addresses, approved yield venues, and security-review status will be published before unrestricted production deployment.

The following production parameters remain to be finalized before unrestricted deployment:

- chain-specific USDC contracts and approved yield venues;
- round duration and cutoff behavior;
- in-round withdrawal or switching rules;
- exact scoring and tie policy;
- approved yield strategy;
- protocol yield fee;
- backing and launch thresholds;
- launch-window duration;
- token supply and allocation;
- AMM venue and initial liquidity configuration;
- LP lock terms and fee rights;
- administrative and upgrade permissions; and
- emergency and withdrawal procedures.

Illustrative values used in prototypes or internal examples are not production parameters unless they are later published in the relevant round configuration.
