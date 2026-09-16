-- either v1 — custodial ledger.
-- Applied by `npm run migrate`. Amounts are usdg base units (6 decimals) as numeric(78,0)
-- so nothing is ever rounded; the application converts to bigint at the boundary.

create table if not exists users (
    wallet_address  text primary key check (wallet_address = lower(wallet_address)),
    created_at      timestamptz not null default now()
);

-- one platform-operated account per user per round; the private key is sealed, never stored raw
create table if not exists custodial_accounts (
    user_wallet     text not null references users(wallet_address),
    round_id        text not null,
    address         text not null unique check (address = lower(address)),
    kek_id          text not null,
    key_version     smallint not null default 1,
    dek_ciphertext  bytea not null,
    key_iv          bytea not null,
    key_auth_tag    bytea not null,
    key_ciphertext  bytea not null,
    registered_tx   text,                       -- round.registerAccount, null until confirmed
    created_at      timestamptz not null default now(),
    primary key (user_wallet, round_id)
);

-- the offchain mirror of the round ledger plus what the ledger cannot know: vault shares
create table if not exists positions (
    user_wallet     text not null references users(wallet_address),
    round_id        text not null,
    side            smallint not null check (side in (0, 1)),
    principal       numeric(78,0) not null default 0 check (principal >= 0),
    shares          numeric(78,0) not null default 0 check (shares >= 0),
    launch_bps      smallint check (launch_bps between 0 and 10000),
    updated_at      timestamptz not null default now(),
    primary key (user_wallet, round_id, side)
);

-- every movement of funds, and every ledger write, with the idempotency key that prevents replays
create table if not exists transactions (
    id              bigserial primary key,
    operation_id    text not null unique,
    user_wallet     text references users(wallet_address),
    round_id        text not null,
    kind            text not null check (kind in (
                        'register', 'gas_topup', 'deposit_seen', 'vault_deposit',
                        'vault_redeem', 'payout', 'fee', 'record_withdraw', 'record_redeem',
                        'release_launch', 'settle', 'finalize_launch'
                    )),
    side            smallint check (side in (0, 1)),
    amount          numeric(78,0),
    shares          numeric(78,0),
    tx_hash         text,
    block_number    bigint,
    log_index       integer,
    status          text not null default 'pending' check (status in ('pending', 'sent', 'confirmed', 'failed')),
    error           text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists transactions_user_idx on transactions (user_wallet, round_id, created_at desc);
create index if not exists transactions_status_idx on transactions (status) where status in ('pending', 'sent');

-- deposit events already processed, keyed the only way that is unique across reorgs
create table if not exists processed_events (
    tx_hash         text not null,
    log_index       integer not null,
    block_number    bigint not null,
    seen_at         timestamptz not null default now(),
    primary key (tx_hash, log_index)
);

-- where the indexer last stopped
create table if not exists indexer_cursor (
    name            text primary key,
    block_number    bigint not null
);

-- multi-step withdrawals, resumable from any step
create table if not exists withdrawals (
    id              bigserial primary key,
    user_wallet     text not null references users(wallet_address),
    round_id        text not null,
    side            smallint not null check (side in (0, 1)),
    kind            text not null check (kind in ('pre_settlement', 'redemption', 'launch_release')),
    principal       numeric(78,0) not null,
    shares          numeric(78,0) not null,
    gross_assets    numeric(78,0),              -- filled in after redeem
    fee             numeric(78,0),
    net_payout      numeric(78,0),
    state           text not null default 'pending' check (state in (
                        'pending', 'redeeming', 'redeemed', 'paying', 'paid', 'recording', 'done', 'failed'
                    )),
    release_tx      text,                       -- round.releaseLaunch, launch_release only
    redeem_tx       text,
    payout_tx       text,
    fee_tx          text,
    record_tx       text,
    error           text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists withdrawals_open_idx on withdrawals (state) where state not in ('done', 'failed');

-- periodic reads of the vault, for apy and for reconciliation
create table if not exists vault_snapshots (
    id              bigserial primary key,
    round_id        text not null,
    vault           text not null,
    block_number    bigint not null,
    total_assets    numeric(78,0) not null,
    total_supply    numeric(78,0) not null,
    taken_at        timestamptz not null default now()
);

create index if not exists vault_snapshots_time_idx on vault_snapshots (round_id, taken_at desc);

-- sign-in nonces; consumed on use
create table if not exists auth_nonces (
    nonce           text primary key,
    wallet_address  text,
    expires_at      timestamptz not null,
    used_at         timestamptz
);
