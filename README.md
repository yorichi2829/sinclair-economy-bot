# Sinclair Discord Economy Bot

Virtual-credit Discord bot with:
- Bank account creation
- Private balance/account information
- Deposit / withdraw
- User-to-user transfer
- Virtual-credit games: Bingo, Lucky 9, Poker, Sabong, Color Game, Roulette, Blackjack
- Economy leaderboard
- Moderation: role, kick, ban, mute
- Bot-admin money generation/removal/reset
- Web dashboard
- SQLite persistence

## Important
All balances are **virtual in-server credits only**. This project does not process real-money gambling, deposits, withdrawals, cash-outs, or payments.

## Install
1. Install Node.js 20+.
2. Copy `.env.example` to `.env`.
3. Put your Discord bot token, application client ID, guild ID, dashboard admin Discord user IDs, and a strong session secret in `.env`.
4. Run:
   `npm install`
5. Run:
   `npm start`

## Discord permissions
Enable the bot's Server Members Intent in the Discord Developer Portal.
Give the bot only the permissions it needs. For moderation commands, its role must be above the roles it manages.

## Commands
- `/bank create`
- `/bank balance`
- `/bank deposit amount`
- `/bank withdraw amount`
- `/bank transfer user amount`
- `/game blackjack amount`
- `/game roulette amount color`
- `/game color amount color`
- `/game lucky9 amount`
- `/game poker amount`
- `/game bingo amount`
- `/game sabong amount`
- `/leaderboard`
- `/mod role user role`
- `/mod kick user reason`
- `/mod ban user reason`
- `/mod mute user duration reason`
- `/admin money add user amount`
- `/admin money remove user amount`
- `/admin money reset user`

The bot always replies to account/balance commands ephemerally, so one user cannot use those commands to view another user's private balance.

## Dashboard
Open:
`http://localhost:3000`

Dashboard access is restricted to the Discord IDs listed in `DASHBOARD_ADMIN_IDS`. The dashboard provides account/economy administration and a leaderboard view.

For production deployment, put the dashboard behind HTTPS and use a strong random session secret.

### Dashboard search
Bot admins can search accounts by Discord username or Discord User ID. Search results are dashboard-admin-only.
