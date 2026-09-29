use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, BurnChecked, Mint, TokenAccount, TokenInterface, TransferChecked};
use pyth_solana_receiver_sdk::price_update::{get_feed_id_from_hex, PriceUpdateV2};
use std::str::FromStr;

declare_id!("11111111111111111111111111111111");

const INITIAL_SUPPLY_TOKENS: u64 = 1_000_000_000;
const LOCKED_TOKENS: u64 = 700_000_000;

const MILESTONES_USD: [u64; 10] = [
    100_000,
    200_000,
    300_000,
    400_000,
    500_000,
    600_000,
    700_000,
    800_000,
    900_000,
    1_000_000,
];

const BURN_TOKENS: [u64; 10] = [
    100_000_000,
    95_000_000,
    90_000_000,
    80_000_000,
    75_000_000,
    70_000_000,
    60_000_000,
    50_000_000,
    40_000_000,
    40_000_000,
];

const PUMP_PROGRAM_ID: &str = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const PUMP_AMM_PROGRAM_ID: &str = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
const WSOL_MINT: &str = "So11111111111111111111111111111111111111112";
const USDC_MINT: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Pyth Core feed IDs.
const SOL_USD_FEED_ID: &str =
    "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
const USDC_USD_FEED_ID: &str =
    "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a";

const MAX_PRICE_AGE_SECONDS: u64 = 120;

#[program]
pub mod kryphos_burn {
    use super::*;

    /// Creates the immutable burn state and moves exactly 700M tokens
    /// into a PDA-owned token account. There is deliberately no withdraw
    /// instruction anywhere in this program.
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let mint = &ctx.accounts.mint;
        let decimals = mint.decimals;

        require!(decimals <= 9, KryphosError::UnsupportedDecimals);
        require!(
            is_supported_quote(&ctx.accounts.quote_mint.key()),
            KryphosError::UnsupportedQuoteMint
        );

        let expected_supply = raw_tokens(INITIAL_SUPPLY_TOKENS, decimals)?;
        let lock_amount = raw_tokens(LOCKED_TOKENS, decimals)?;

        require_eq!(
            mint.supply,
            expected_supply,
            KryphosError::UnexpectedInitialSupply
        );
        require!(
            ctx.accounts.source_token_account.amount >= lock_amount,
            KryphosError::InsufficientSourceBalance
        );

        let state = &mut ctx.accounts.state;
        state.mint = mint.key();
        state.quote_mint = ctx.accounts.quote_mint.key();
        state.pool = Pubkey::default();
        state.vault = ctx.accounts.vault_token_account.key();
        state.initial_supply_raw = expected_supply;
        state.locked_amount_raw = lock_amount;
        state.burned_raw = 0;
        state.stage = 0;
        state.decimals = decimals;
        state.pool_bound = false;
        state.state_bump = ctx.bumps.state;
        state.vault_authority_bump = ctx.bumps.vault_authority;
        state.vault_bump = ctx.bumps.vault_token_account;

        let cpi_accounts = TransferChecked {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.source_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
            lock_amount,
            decimals,
        )?;

        ctx.accounts.vault_token_account.reload()?;
        require_eq!(
            ctx.accounts.vault_token_account.amount,
            lock_amount,
            KryphosError::VaultFundingMismatch
        );

        emit!(VaultInitialized {
            mint: state.mint,
            quote_mint: state.quote_mint,
            vault: state.vault,
            locked_amount_raw: state.locked_amount_raw,
        });

        Ok(())
    }

    /// Binds the state, once and forever, to Pump.fun's canonical PumpSwap pool
    /// created by migration. Anybody can call this after graduation; the program
    /// derives and verifies the exact canonical pool PDA itself.
    pub fn bind_canonical_pool(ctx: Context<BindCanonicalPool>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(!state.pool_bound, KryphosError::PoolAlreadyBound);

        let pump_program = Pubkey::from_str(PUMP_PROGRAM_ID).unwrap();
        let pump_amm_program = Pubkey::from_str(PUMP_AMM_PROGRAM_ID).unwrap();

        let (canonical_creator, _) = Pubkey::find_program_address(
            &[b"pool-authority", state.mint.as_ref()],
            &pump_program,
        );

        let index_bytes = 0u16.to_le_bytes();
        let (expected_pool, _) = Pubkey::find_program_address(
            &[
                b"pool",
                &index_bytes,
                canonical_creator.as_ref(),
                state.mint.as_ref(),
                state.quote_mint.as_ref(),
            ],
            &pump_amm_program,
        );

        require_keys_eq!(
            ctx.accounts.pool.key(),
            expected_pool,
            KryphosError::InvalidCanonicalPool
        );
        require_keys_eq!(
            *ctx.accounts.pool.owner,
            pump_amm_program,
            KryphosError::InvalidPoolOwner
        );

        let snapshot = read_pool_snapshot(&ctx.accounts.pool)?;

        require_eq!(snapshot.index, 0, KryphosError::InvalidCanonicalPool);
        require_keys_eq!(
            snapshot.creator,
            canonical_creator,
            KryphosError::InvalidCanonicalPool
        );
        require_keys_eq!(
            snapshot.base_mint,
            state.mint,
            KryphosError::PoolMintMismatch
        );
        require_keys_eq!(
            snapshot.quote_mint,
            state.quote_mint,
            KryphosError::PoolQuoteMismatch
        );
        require_keys_eq!(
            snapshot.base_token_account,
            ctx.accounts.pool_base_token_account.key(),
            KryphosError::PoolTokenAccountMismatch
        );
        require_keys_eq!(
            snapshot.quote_token_account,
            ctx.accounts.pool_quote_token_account.key(),
            KryphosError::PoolTokenAccountMismatch
        );
        require_keys_eq!(
            ctx.accounts.pool_base_token_account.owner,
            ctx.accounts.pool.key(),
            KryphosError::PoolAuthorityMismatch
        );
        require_keys_eq!(
            ctx.accounts.pool_quote_token_account.owner,
            ctx.accounts.pool.key(),
            KryphosError::PoolAuthorityMismatch
        );

        state.pool = ctx.accounts.pool.key();
        state.pool_bound = true;

        emit!(CanonicalPoolBound {
            mint: state.mint,
            pool: state.pool,
            quote_mint: state.quote_mint,
        });

        Ok(())
    }

    /// Permissionless staged burn.
    ///
    /// Anyone may submit this instruction, but the program burns only the
    /// next published stage and only when the canonical PumpSwap pool's
    /// current spot market cap is at or above the stage's USD milestone.
    pub fn burn_next(ctx: Context<BurnNext>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(state.pool_bound, KryphosError::PoolNotBound);

        let stage = state.stage as usize;
        require!(stage < MILESTONES_USD.len(), KryphosError::AllStagesComplete);

        let snapshot = validate_bound_pool(
            state,
            &ctx.accounts.pool,
            &ctx.accounts.pool_base_token_account,
            &ctx.accounts.pool_quote_token_account,
        )?;

        let base_reserve = ctx.accounts.pool_base_token_account.amount;
        require!(base_reserve > 0, KryphosError::EmptyBaseReserve);

        let effective_quote_i128 = i128::from(ctx.accounts.pool_quote_token_account.amount)
            .checked_add(snapshot.virtual_quote_reserves)
            .ok_or(KryphosError::MathOverflow)?;
        require!(
            effective_quote_i128 > 0,
            KryphosError::InvalidEffectiveQuoteReserve
        );
        let effective_quote = effective_quote_i128 as u128;

        let feed_id = quote_feed_id(&state.quote_mint)?;
        let price = ctx.accounts.price_update.get_price_no_older_than(
            &Clock::get()?,
            MAX_PRICE_AGE_SECONDS,
            &feed_id,
        )?;
        let quote_usd_micro = price_to_micro_usd(price.price, price.exponent)?;

        // market_cap_usd =
        // total_supply_raw * (quote_reserve/base_reserve adjusted for quote decimals)
        // * quote_usd
        //
        // Base decimals cancel out algebraically.
        let numerator = (ctx.accounts.mint.supply as u128)
            .checked_mul(effective_quote)
            .ok_or(KryphosError::MathOverflow)?
            .checked_mul(quote_usd_micro)
            .ok_or(KryphosError::MathOverflow)?;

        let quote_scale = pow10_u128(ctx.accounts.quote_mint.decimals as u32)?;
        let denominator = (base_reserve as u128)
            .checked_mul(quote_scale)
            .ok_or(KryphosError::MathOverflow)?;
        require!(denominator > 0, KryphosError::MathOverflow);

        let market_cap_micro_usd = numerator
            .checked_div(denominator)
            .ok_or(KryphosError::MathOverflow)?;

        let milestone_micro_usd = (MILESTONES_USD[stage] as u128)
            .checked_mul(1_000_000)
            .ok_or(KryphosError::MathOverflow)?;

        require!(
            market_cap_micro_usd >= milestone_micro_usd,
            KryphosError::MilestoneNotReached
        );

        let burn_amount = raw_tokens(BURN_TOKENS[stage], state.decimals)?;
        require!(
            ctx.accounts.vault_token_account.amount >= burn_amount,
            KryphosError::VaultBalanceTooLow
        );

        let state_key = state.key();
        let authority_seeds: &[&[u8]] = &[
            b"vault-authority",
            state_key.as_ref(),
            &[state.vault_authority_bump],
        ];

        let cpi_accounts = BurnChecked {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };

        token_interface::burn_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                &[authority_seeds],
            ),
            burn_amount,
            state.decimals,
        )?;

        state.burned_raw = state
            .burned_raw
            .checked_add(burn_amount)
            .ok_or(KryphosError::MathOverflow)?;
        state.stage = state
            .stage
            .checked_add(1)
            .ok_or(KryphosError::MathOverflow)?;

        emit!(StageBurned {
            stage: state.stage,
            milestone_usd: MILESTONES_USD[stage],
            burn_amount_raw: burn_amount,
            total_burned_raw: state.burned_raw,
            market_cap_micro_usd,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    pub quote_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        constraint = source_token_account.mint == mint.key() @ KryphosError::SourceMintMismatch,
        constraint = source_token_account.owner == payer.key() @ KryphosError::SourceOwnerMismatch
    )]
    pub source_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = payer,
        seeds = [b"state", mint.key().as_ref()],
        bump,
        space = 8 + BurnState::SPACE
    )]
    pub state: Account<'info, BurnState>,

    /// CHECK: signer-only PDA authority; no data account is required.
    #[account(
        seeds = [b"vault-authority", state.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        seeds = [b"vault", state.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = vault_authority,
        token::token_program = token_program
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct BindCanonicalPool<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,
    pub quote_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [b"state", mint.key().as_ref()],
        bump = state.state_bump,
        has_one = mint,
        has_one = quote_mint
    )]
    pub state: Account<'info, BurnState>,

    /// CHECK: owner, canonical PDA and contents are verified in the instruction.
    pub pool: UncheckedAccount<'info>,

    #[account(
        constraint = pool_base_token_account.mint == mint.key() @ KryphosError::PoolMintMismatch
    )]
    pub pool_base_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        constraint = pool_quote_token_account.mint == quote_mint.key() @ KryphosError::PoolQuoteMismatch
    )]
    pub pool_quote_token_account: InterfaceAccount<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct BurnNext<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    pub quote_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [b"state", mint.key().as_ref()],
        bump = state.state_bump,
        has_one = mint,
        has_one = quote_mint,
        constraint = state.vault == vault_token_account.key() @ KryphosError::VaultAddressMismatch,
        constraint = state.pool == pool.key() @ KryphosError::InvalidCanonicalPool
    )]
    pub state: Account<'info, BurnState>,

    /// CHECK: PDA signer authority, verified by seeds.
    #[account(
        seeds = [b"vault-authority", state.key().as_ref()],
        bump = state.vault_authority_bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"vault", state.key().as_ref()],
        bump = state.vault_bump,
        constraint = vault_token_account.mint == mint.key() @ KryphosError::VaultMintMismatch,
        constraint = vault_token_account.owner == vault_authority.key() @ KryphosError::VaultAuthorityMismatch
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: canonical PumpSwap account is verified in-program.
    pub pool: UncheckedAccount<'info>,

    #[account(mut)]
    pub pool_base_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub pool_quote_token_account: InterfaceAccount<'info, TokenAccount>,

    pub price_update: Account<'info, PriceUpdateV2>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[account]
pub struct BurnState {
    pub mint: Pubkey,
    pub quote_mint: Pubkey,
    pub pool: Pubkey,
    pub vault: Pubkey,
    pub initial_supply_raw: u64,
    pub locked_amount_raw: u64,
    pub burned_raw: u64,
    pub stage: u8,
    pub decimals: u8,
    pub pool_bound: bool,
    pub state_bump: u8,
    pub vault_authority_bump: u8,
    pub vault_bump: u8,
}

impl BurnState {
    pub const SPACE: usize = 192;
}

#[event]
pub struct VaultInitialized {
    pub mint: Pubkey,
    pub quote_mint: Pubkey,
    pub vault: Pubkey,
    pub locked_amount_raw: u64,
}

#[event]
pub struct CanonicalPoolBound {
    pub mint: Pubkey,
    pub pool: Pubkey,
    pub quote_mint: Pubkey,
}

#[event]
pub struct StageBurned {
    pub stage: u8,
    pub milestone_usd: u64,
    pub burn_amount_raw: u64,
    pub total_burned_raw: u64,
    pub market_cap_micro_usd: u128,
}

struct PoolSnapshot {
    index: u16,
    creator: Pubkey,
    base_mint: Pubkey,
    quote_mint: Pubkey,
    base_token_account: Pubkey,
    quote_token_account: Pubkey,
    virtual_quote_reserves: i128,
}

fn validate_bound_pool(
    state: &BurnState,
    pool: &UncheckedAccount,
    base: &InterfaceAccount<TokenAccount>,
    quote: &InterfaceAccount<TokenAccount>,
) -> Result<PoolSnapshot> {
    let pump_amm_program = Pubkey::from_str(PUMP_AMM_PROGRAM_ID).unwrap();
    require_keys_eq!(
        *pool.owner,
        pump_amm_program,
        KryphosError::InvalidPoolOwner
    );

    let snapshot = read_pool_snapshot(pool)?;

    require_keys_eq!(
        snapshot.base_mint,
        state.mint,
        KryphosError::PoolMintMismatch
    );
    require_keys_eq!(
        snapshot.quote_mint,
        state.quote_mint,
        KryphosError::PoolQuoteMismatch
    );
    require_keys_eq!(
        snapshot.base_token_account,
        base.key(),
        KryphosError::PoolTokenAccountMismatch
    );
    require_keys_eq!(
        snapshot.quote_token_account,
        quote.key(),
        KryphosError::PoolTokenAccountMismatch
    );
    require_keys_eq!(
        base.owner,
        pool.key(),
        KryphosError::PoolAuthorityMismatch
    );
    require_keys_eq!(
        quote.owner,
        pool.key(),
        KryphosError::PoolAuthorityMismatch
    );

    Ok(snapshot)
}

fn read_pool_snapshot(pool: &UncheckedAccount) -> Result<PoolSnapshot> {
    let data = pool.try_borrow_data()?;

    // Anchor discriminator: 8
    // pool_bump: 1
    // index: 2
    // creator/base_mint/quote_mint/lp_mint/base_vault/quote_vault: 6 * 32
    // lp_supply: 8
    // coin_creator: 32
    // is_mayhem_mode: 1
    // is_cashback_coin: 1
    // virtual_quote_reserves: i128 (optional appended field)
    require!(data.len() >= 203, KryphosError::InvalidPoolData);

    let index = u16::from_le_bytes([data[9], data[10]]);
    let creator = pubkey_from_slice(&data[11..43])?;
    let base_mint = pubkey_from_slice(&data[43..75])?;
    let quote_mint = pubkey_from_slice(&data[75..107])?;
    let base_token_account = pubkey_from_slice(&data[139..171])?;
    let quote_token_account = pubkey_from_slice(&data[171..203])?;

    let virtual_quote_reserves = if data.len() >= 261 {
        i128::from_le_bytes(
            data[245..261]
                .try_into()
                .map_err(|_| error!(KryphosError::InvalidPoolData))?,
        )
    } else {
        0
    };

    Ok(PoolSnapshot {
        index,
        creator,
        base_mint,
        quote_mint,
        base_token_account,
        quote_token_account,
        virtual_quote_reserves,
    })
}

fn pubkey_from_slice(data: &[u8]) -> Result<Pubkey> {
    let bytes: [u8; 32] = data
        .try_into()
        .map_err(|_| error!(KryphosError::InvalidPoolData))?;
    Ok(Pubkey::new_from_array(bytes))
}

fn raw_tokens(tokens: u64, decimals: u8) -> Result<u64> {
    let scale = pow10_u128(decimals as u32)?;
    let value = (tokens as u128)
        .checked_mul(scale)
        .ok_or(KryphosError::MathOverflow)?;
    u64::try_from(value).map_err(|_| error!(KryphosError::MathOverflow))
}

fn pow10_u128(exp: u32) -> Result<u128> {
    require!(exp <= 18, KryphosError::MathOverflow);
    let mut value = 1u128;
    for _ in 0..exp {
        value = value.checked_mul(10).ok_or(KryphosError::MathOverflow)?;
    }
    Ok(value)
}

fn price_to_micro_usd(price: i64, exponent: i32) -> Result<u128> {
    require!(price > 0, KryphosError::InvalidOraclePrice);

    let value = price as u128;
    let scale_exponent = exponent
        .checked_add(6)
        .ok_or(KryphosError::MathOverflow)?;

    if scale_exponent >= 0 {
        value
            .checked_mul(pow10_u128(scale_exponent as u32)?)
            .ok_or_else(|| error!(KryphosError::MathOverflow))
    } else {
        value
            .checked_div(pow10_u128((-scale_exponent) as u32)?)
            .ok_or_else(|| error!(KryphosError::MathOverflow))
    }
}

fn is_supported_quote(quote_mint: &Pubkey) -> bool {
    let wsol = Pubkey::from_str(WSOL_MINT).unwrap();
    let usdc = Pubkey::from_str(USDC_MINT).unwrap();
    *quote_mint == wsol || *quote_mint == usdc
}

fn quote_feed_id(quote_mint: &Pubkey) -> Result<[u8; 32]> {
    let wsol = Pubkey::from_str(WSOL_MINT).unwrap();
    let usdc = Pubkey::from_str(USDC_MINT).unwrap();

    if *quote_mint == wsol {
        get_feed_id_from_hex(SOL_USD_FEED_ID)
            .map_err(|_| error!(KryphosError::InvalidPriceFeed))
    } else if *quote_mint == usdc {
        get_feed_id_from_hex(USDC_USD_FEED_ID)
            .map_err(|_| error!(KryphosError::InvalidPriceFeed))
    } else {
        err!(KryphosError::UnsupportedQuoteMint)
    }
}

#[error_code]
pub enum KryphosError {
    #[msg("The token mint does not have the required 1,000,000,000 initial supply.")]
    UnexpectedInitialSupply,
    #[msg("The source token account does not contain the required 700,000,000 tokens.")]
    InsufficientSourceBalance,
    #[msg("The burn vault was not funded with exactly the required amount.")]
    VaultFundingMismatch,
    #[msg("Only SOL or USDC Pump.fun quote pairs are supported by this build.")]
    UnsupportedQuoteMint,
    #[msg("Token decimals are unsupported.")]
    UnsupportedDecimals,
    #[msg("Source token account mint mismatch.")]
    SourceMintMismatch,
    #[msg("Source token account is not owned by the payer.")]
    SourceOwnerMismatch,
    #[msg("Canonical PumpSwap pool is already bound.")]
    PoolAlreadyBound,
    #[msg("Canonical PumpSwap pool has not been bound yet.")]
    PoolNotBound,
    #[msg("Invalid canonical PumpSwap pool.")]
    InvalidCanonicalPool,
    #[msg("PumpSwap pool account is not owned by the PumpSwap program.")]
    InvalidPoolOwner,
    #[msg("PumpSwap pool account data is invalid or too short.")]
    InvalidPoolData,
    #[msg("PumpSwap pool base mint does not match KRYPHOS mint.")]
    PoolMintMismatch,
    #[msg("PumpSwap pool quote mint does not match the configured quote mint.")]
    PoolQuoteMismatch,
    #[msg("PumpSwap pool token account mismatch.")]
    PoolTokenAccountMismatch,
    #[msg("PumpSwap pool token accounts are not controlled by the pool.")]
    PoolAuthorityMismatch,
    #[msg("All ten burn stages are complete.")]
    AllStagesComplete,
    #[msg("The next market-cap milestone has not been reached.")]
    MilestoneNotReached,
    #[msg("The burn vault does not contain enough tokens for this stage.")]
    VaultBalanceTooLow,
    #[msg("Burn vault address mismatch.")]
    VaultAddressMismatch,
    #[msg("Burn vault mint mismatch.")]
    VaultMintMismatch,
    #[msg("Burn vault authority mismatch.")]
    VaultAuthorityMismatch,
    #[msg("The canonical pool has zero base reserve.")]
    EmptyBaseReserve,
    #[msg("The canonical pool has an invalid effective quote reserve.")]
    InvalidEffectiveQuoteReserve,
    #[msg("The Pyth price is invalid.")]
    InvalidOraclePrice,
    #[msg("The supplied Pyth feed does not match the quote asset.")]
    InvalidPriceFeed,
    #[msg("Arithmetic overflow or invalid division.")]
    MathOverflow,
}
