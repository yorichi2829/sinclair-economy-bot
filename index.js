require("dotenv").config();

const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, EmbedBuilder
} = require("discord.js");
const express = require("express");
const session = require("express-session");
const db = require("./db");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const PORT = Number(process.env.DASHBOARD_PORT || 3000);
const STARTING = Number(process.env.STARTING_BALANCE || 1000);
const adminIds = new Set((process.env.DASHBOARD_ADMIN_IDS || "").split(",").map(x => x.trim()).filter(Boolean));

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("Missing DISCORD_TOKEN, CLIENT_ID or GUILD_ID in .env");
  process.exit(1);
}

function money(n) { return Math.floor(Number(n)); }
function validAmount(n) { return Number.isInteger(Number(n)) && Number(n) > 0; }

function ensureAccount(user) {
  return db.getOrCreateAccount(user.id, user.username, STARTING);
}

function privateReply(content) {
  return { content, ephemeral: true };
}

const commands = [
  new SlashCommandBuilder().setName("bank").setDescription("Virtual bank commands")
    .addSubcommand(s => s.setName("create").setDescription("Create your bank account"))
    .addSubcommand(s => s.setName("balance").setDescription("View your own balance"))
    .addSubcommand(s => s.setName("deposit").setDescription("Deposit virtual cash into your bank")
      .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName("withdraw").setDescription("Withdraw virtual cash from your bank")
      .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName("transfer").setDescription("Transfer from your bank to another user")
      .addUserOption(o => o.setName("user").setDescription("Recipient").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1))),

  new SlashCommandBuilder().setName("game").setDescription("Play virtual-credit games")
    .addSubcommand(s => s.setName("blackjack").setDescription("Play blackjack")
      .addIntegerOption(o => o.setName("amount").setDescription("Bet").setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName("roulette").setDescription("Bet on red, black or green")
      .addIntegerOption(o => o.setName("amount").setDescription("Bet").setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName("color").setDescription("Your color").setRequired(true)
        .addChoices({name:"Red",value:"red"},{name:"Black",value:"black"},{name:"Green",value:"green"})))
    .addSubcommand(s => s.setName("color").setDescription("Color game")
      .addIntegerOption(o => o.setName("amount").setDescription("Bet").setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName("color").setDescription("Your color").setRequired(true)
        .addChoices({name:"Red",value:"red"},{name:"Blue",value:"blue"},{name:"Green",value:"green"})))
    .addSubcommand(s => s.setName("lucky9").setDescription("Play Lucky 9")
      .addIntegerOption(o => o.setName("amount").setDescription("Bet").setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName("poker").setDescription("Play a simple poker hand")
      .addIntegerOption(o => o.setName("amount").setDescription("Bet").setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName("bingo").setDescription("Play a quick bingo draw")
      .addIntegerOption(o => o.setName("amount").setDescription("Bet").setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName("sabong").setDescription("Virtual sabong game")
      .addIntegerOption(o => o.setName("amount").setDescription("Bet").setRequired(true).setMinValue(1))),

  new SlashCommandBuilder().setName("leaderboard").setDescription("Show the server economy leaderboard"),

  new SlashCommandBuilder().setName("mod").setDescription("Moderation commands")
    .addSubcommand(s => s.setName("role").setDescription("Add a role to a member")
      .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
      .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true)))
    .addSubcommand(s => s.setName("kick").setDescription("Kick a member")
      .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason")))
    .addSubcommand(s => s.setName("ban").setDescription("Ban a member")
      .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason")))
    .addSubcommand(s => s.setName("mute").setDescription("Timeout a member")
      .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
      .addIntegerOption(o => o.setName("duration").setDescription("Minutes").setRequired(true).setMinValue(1).setMaxValue(40320))
      .addStringOption(o => o.setName("reason").setDescription("Reason"))),

  new SlashCommandBuilder().setName("admin").setDescription("Bot-admin economy commands")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName("money").setDescription("Manage virtual money")
      .addStringOption(o => o.setName("action").setDescription("Action").setRequired(true)
        .addChoices({name:"Add",value:"add"},{name:"Remove",value:"remove"},{name:"Reset",value:"reset"}))
      .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setDescription("Amount; ignored for reset").setMinValue(1)))
].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log("Slash commands registered.");
}

function gameResult(type, bet) {
  const roll = Math.random();
  if (type === "blackjack") {
    if (roll < 0.42) return { delta: bet, text: "Blackjack win! Payout: 2× your bet." };
    if (roll < 0.78) return { delta: 0, text: "Push. Your bet was returned." };
    return { delta: -bet, text: "Dealer wins." };
  }
  if (type === "roulette") {
    if (roll < 0.05) return { delta: bet * 14, text: "Green hit! Payout: 15× total return." };
    if (roll < 0.50) return { delta: bet, text: "Color hit! Payout: 2× total return." };
    return { delta: -bet, text: "Color missed." };
  }
  if (type === "color") {
    if (roll < 0.333) return { delta: bet * 2, text: "Color hit! Payout: 3× total return." };
    return { delta: -bet, text: "Color missed." };
  }
  if (type === "lucky9") {
    if (roll < 0.46) return { delta: bet, text: "Lucky 9 win! Payout: 2× total return." };
    return { delta: -bet, text: "Lucky 9 lost." };
  }
  if (type === "poker") {
    if (roll < 0.12) return { delta: bet * 4, text: "Strong poker hand! Payout: 5× total return." };
    if (roll < 0.48) return { delta: 0, text: "Tie/return." };
    return { delta: -bet, text: "Hand lost." };
  }
  if (type === "bingo") {
    if (roll < 0.08) return { delta: bet * 7, text: "BINGO! Payout: 8× total return." };
    return { delta: -bet, text: "No bingo this round." };
  }
  if (type === "sabong") {
    if (roll < 0.48) return { delta: bet, text: "Your virtual rooster won! Payout: 2× total return." };
    return { delta: -bet, text: "Your virtual rooster lost." };
  }
}

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const cmd = interaction.commandName;

    if (cmd === "bank") {
      const sub = interaction.options.getSubcommand();
      const acct = ensureAccount(interaction.user);

      if (sub === "create") return interaction.reply(privateReply(`Bank account ready. Your current balance is **${acct.balance}** virtual credits.`));
      if (sub === "balance") return interaction.reply(privateReply(`Your balance: **${acct.balance}** virtual credits.`));

      if (sub === "deposit" || sub === "withdraw") {
        const amount = interaction.options.getInteger("amount");
        if (!validAmount(amount)) return interaction.reply(privateReply("Invalid amount."));
        const result = sub === "deposit"
          ? db.deposit(acct.user_id, amount)
          : db.withdraw(acct.user_id, amount);
        if (!result.ok) return interaction.reply(privateReply(result.error));
        return interaction.reply(privateReply(`${sub === "deposit" ? "Deposited" : "Withdrew"} **${amount}**. New balance: **${result.balance}**.`));
      }

      if (sub === "transfer") {
        const target = interaction.options.getUser("user");
        const amount = interaction.options.getInteger("amount");
        if (target.bot || target.id === interaction.user.id) return interaction.reply(privateReply("Choose another non-bot user."));
        const result = db.transfer(interaction.user.id, target.id, target.username, amount);
        if (!result.ok) return interaction.reply(privateReply(result.error));
        return interaction.reply(privateReply(`Transferred **${amount}** virtual credits. Your new balance: **${result.fromBalance}**.`));
      }
    }

    if (cmd === "game") {
      const type = interaction.options.getSubcommand();
      const amount = interaction.options.getInteger("amount");
      const acct = ensureAccount(interaction.user);
      if (!validAmount(amount)) return interaction.reply(privateReply("Invalid bet."));
      if (acct.balance < amount) return interaction.reply(privateReply("Insufficient balance."));
      const result = gameResult(type, amount);
      const updated = db.applyDelta(interaction.user.id, result.delta);
      return interaction.reply(privateReply(`🎲 **${type.toUpperCase()}**\n${result.text}\nBalance: **${updated.balance}** virtual credits.`));
    }

    if (cmd === "leaderboard") {
      const rows = db.leaderboard(10);
      const lines = rows.length ? rows.map((r,i) => `**${i+1}.** <@${r.user_id}> — ${r.balance}`).join("\n") : "No accounts yet.";
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle("Economy Leaderboard").setDescription(lines)] });
    }

    if (cmd === "mod") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
          !interaction.member.permissions.has(PermissionFlagsBits.KickMembers) &&
          !interaction.member.permissions.has(PermissionFlagsBits.BanMembers) &&
          !interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply(privateReply("You do not have permission."));
      }
      const sub = interaction.options.getSubcommand();
      const target = interaction.options.getMember("user");
      if (!target) return interaction.reply(privateReply("Member not found."));

      if (sub === "role") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) return interaction.reply(privateReply("Manage Roles permission required."));
        const role = interaction.options.getRole("role");
        if (role.position >= interaction.guild.members.me.roles.highest.position) return interaction.reply(privateReply("That role is at/above my highest role."));
        await target.roles.add(role);
        return interaction.reply(`Role **${role.name}** added to ${target}.`);
      }
      if (sub === "kick") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) return interaction.reply(privateReply("Kick Members permission required."));
        await target.kick(interaction.options.getString("reason") || "No reason provided");
        return interaction.reply(`Kicked **${target.user.username}**.`);
      }
      if (sub === "ban") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) return interaction.reply(privateReply("Ban Members permission required."));
        await target.ban({ reason: interaction.options.getString("reason") || "No reason provided" });
        return interaction.reply(`Banned **${target.user.username}**.`);
      }
      if (sub === "mute") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return interaction.reply(privateReply("Moderate Members permission required."));
        const minutes = interaction.options.getInteger("duration");
        await target.timeout(minutes * 60 * 1000, interaction.options.getString("reason") || "No reason provided");
        return interaction.reply(`Timed out **${target.user.username}** for ${minutes} minutes.`);
      }
    }

    if (cmd === "admin") {
      if (!adminIds.has(interaction.user.id) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply(privateReply("Bot admin access required."));
      }
      const action = interaction.options.getString("action");
      const target = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");
      ensureAccount(target);

      let result;
      if (action === "add") {
        if (!validAmount(amount)) return interaction.reply(privateReply("Enter a valid amount."));
        result = db.applyDelta(target.id, amount, target.username);
      } else if (action === "remove") {
        if (!validAmount(amount)) return interaction.reply(privateReply("Enter a valid amount."));
        result = db.applyDelta(target.id, -amount, target.username);
      } else {
        result = db.resetBalance(target.id, target.username);
      }
      return interaction.reply(privateReply(`Admin action **${action}** completed for <@${target.id}>. New balance: **${result.balance}**.`));
    }
  } catch (e) {
    console.error(e);
    if (!interaction.replied) await interaction.reply(privateReply("An error occurred. Check bot logs."));
  }
});

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || "CHANGE_ME",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: false }
}));

function dashboardGuard(req, res, next) {
  const id = req.headers["x-discord-admin-id"] || req.body.adminId || req.query.adminId || req.session.adminId;
  if (!id || !adminIds.has(String(id))) return res.status(403).json({ error: "Dashboard admin access required." });
  req.session.adminId = String(id);
  next();
}

app.get("/", (req,res) => res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sinclair Economy Dashboard</title>
<style>body{font-family:Arial;margin:0;background:#111;color:#eee}main{max-width:1000px;margin:auto;padding:20px}.card{background:#1d1d1d;padding:18px;border-radius:12px;margin:12px 0}input,button{padding:10px;margin:4px;border-radius:8px;border:0}button{cursor:pointer}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #444}</style></head>
<body><main><h1>Sinclair Economy Dashboard</h1><div class="card"><h3>Admin Login</h3><input id="adminId" placeholder="Discord Admin ID"><button onclick="login()">Login</button><span id="msg"></span></div>
<div class="card"><h3>Account Management</h3><input id="uid" placeholder="Discord User ID"><input id="amount" type="number" placeholder="Amount"><button onclick="money('add')">Add</button><button onclick="money('remove')">Remove</button><button onclick="money('reset')">Reset</button><pre id="result"></pre></div>
<div class="card"><h3>Search Accounts</h3>
<input id="search" placeholder="Search username or Discord User ID" onkeydown="if(event.key==='Enter') searchAccounts()">
<button onclick="searchAccounts()">Search</button><button onclick="document.getElementById('search').value='';searchAccounts()">Clear</button>
<table><thead><tr><th>User</th><th>Discord ID</th><th>Balance</th></tr></thead><tbody id="results"></tbody></table></div>
<div class="card"><h3>Leaderboard</h3><button onclick="loadLB()">Refresh</button><table><thead><tr><th>#</th><th>User ID</th><th>Balance</th></tr></thead><tbody id="lb"></tbody></table></div>
<script>
let aid="";
async function login(){aid=document.getElementById('adminId').value.trim(); document.getElementById('msg').textContent=' Admin ID stored for this session.'; loadLB();}
async function money(action){const r=await fetch('/api/money',{method:'POST',headers:{'Content-Type':'application/json','x-discord-admin-id':aid},body:JSON.stringify({action,userId:document.getElementById('uid').value,amount:Number(document.getElementById('amount').value)})});document.getElementById('result').textContent=JSON.stringify(await r.json(),null,2);loadLB();}
async function loadLB(){const r=await fetch('/api/leaderboard?adminId='+encodeURIComponent(aid));const d=await r.json();document.getElementById('lb').innerHTML=(d.rows||[]).map((x,i)=>'<tr><td>'+(i+1)+'</td><td>'+x.user_id+'</td><td>'+x.balance+'</td></tr>').join('');}
async function searchAccounts(){const q=document.getElementById('search').value.trim();if(!q){document.getElementById('results').innerHTML='';return;}const r=await fetch('/api/search?q='+encodeURIComponent(q)+'&adminId='+encodeURIComponent(aid));const d=await r.json();document.getElementById('results').innerHTML=(d.rows||[]).map(x=>'<tr><td>'+escapeHtml(x.username)+'</td><td>'+escapeHtml(x.user_id)+'</td><td>'+x.balance+'</td></tr>').join('') || '<tr><td colspan="3">No matching accounts.</td></tr>';}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
</script></main></body></html>`));

app.get("/api/leaderboard", dashboardGuard, (req,res) => res.json({ rows: db.leaderboard(50) }));

app.get("/api/search", dashboardGuard, (req,res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ rows: [] });
  res.json({ rows: db.searchAccounts(q, 50) });
});

app.post("/api/money", dashboardGuard, (req,res) => {
  const { action, userId, amount } = req.body;
  if (!userId) return res.status(400).json({error:"userId required"});
  const user = client.users.cache.get(userId);
  const username = user?.username || "dashboard-user";
  ensureAccount({id:userId, username});
  let result;
  if (action === "add" || action === "remove") {
    if (!validAmount(amount)) return res.status(400).json({error:"valid amount required"});
    result = db.applyDelta(userId, action === "add" ? amount : -amount, username);
  } else if (action === "reset") result = db.resetBalance(userId, username);
  else return res.status(400).json({error:"invalid action"});
  res.json(result);
});

app.listen(PORT, () => console.log(`Dashboard listening on port ${PORT}`));

client.login(TOKEN);
