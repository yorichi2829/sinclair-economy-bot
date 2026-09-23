const Database = require("better-sqlite3");
const fs = require("fs");
fs.mkdirSync("data", { recursive: true });
const db = new Database("data/economy.db");

db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS accounts (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

function getOrCreateAccount(user_id, username, starting) {
  let row = db.prepare("SELECT * FROM accounts WHERE user_id=?").get(user_id);
  if (!row) {
    db.prepare("INSERT INTO accounts(user_id,username,balance) VALUES(?,?,?)").run(user_id, username, starting);
    row = db.prepare("SELECT * FROM accounts WHERE user_id=?").get(user_id);
  } else if (row.username !== username) {
    db.prepare("UPDATE accounts SET username=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?").run(username, user_id);
    row.username = username;
  }
  return row;
}

function record(user_id, type, amount, note) {
  db.prepare("INSERT INTO transactions(user_id,type,amount,note) VALUES(?,?,?,?)").run(user_id,type,amount,note || "");
}

function deposit(user_id, amount) {
  const tx = db.transaction(() => {
    const a = db.prepare("SELECT balance FROM accounts WHERE user_id=?").get(user_id);
    if (!a) return {ok:false,error:"Create your bank account first."};
    const balance = a.balance + amount;
    db.prepare("UPDATE accounts SET balance=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?").run(balance,user_id);
    record(user_id,"deposit",amount,"Deposit");
    return {ok:true,balance};
  });
  return tx();
}

function withdraw(user_id, amount) {
  const tx = db.transaction(() => {
    const a = db.prepare("SELECT balance FROM accounts WHERE user_id=?").get(user_id);
    if (!a) return {ok:false,error:"Create your bank account first."};
    if (a.balance < amount) return {ok:false,error:"Insufficient balance."};
    const balance = a.balance - amount;
    db.prepare("UPDATE accounts SET balance=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?").run(balance,user_id);
    record(user_id,"withdraw",amount,"Withdraw");
    return {ok:true,balance};
  });
  return tx();
}

function transfer(from, to, username, amount) {
  const tx = db.transaction(() => {
    if (!Number.isInteger(amount) || amount <= 0) return {ok:false,error:"Invalid amount."};
    const a = db.prepare("SELECT balance FROM accounts WHERE user_id=?").get(from);
    if (!a) return {ok:false,error:"Create your bank account first."};
    if (a.balance < amount) return {ok:false,error:"Insufficient balance."};
    getOrCreateAccount(to, username, 0);
    db.prepare("UPDATE accounts SET balance=balance-?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?").run(amount,from);
    db.prepare("UPDATE accounts SET balance=balance+?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?").run(amount,to);
    record(from,"transfer_out",-amount,`Transfer to ${to}`);
    record(to,"transfer_in",amount,`Transfer from ${from}`);
    const updated = db.prepare("SELECT balance FROM accounts WHERE user_id=?").get(from);
    return {ok:true,fromBalance:updated.balance};
  });
  return tx();
}

function applyDelta(user_id, delta, username="user") {
  const tx = db.transaction(() => {
    getOrCreateAccount(user_id, username, 0);
    const a = db.prepare("SELECT balance FROM accounts WHERE user_id=?").get(user_id);
    const balance = Math.max(0, a.balance + delta);
    db.prepare("UPDATE accounts SET balance=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?").run(balance,user_id);
    record(user_id, delta >= 0 ? "credit" : "debit", delta, "Economy operation");
    return {ok:true,balance};
  });
  return tx();
}

function resetBalance(user_id, username="user") {
  const tx = db.transaction(() => {
    getOrCreateAccount(user_id, username, 0);
    db.prepare("UPDATE accounts SET balance=0,updated_at=CURRENT_TIMESTAMP WHERE user_id=?").run(user_id);
    record(user_id,"reset",0,"Admin reset");
    return {ok:true,balance:0};
  });
  return tx();
}

function leaderboard(limit=10) {
  return db.prepare("SELECT user_id,username,balance FROM accounts ORDER BY balance DESC LIMIT ?").all(limit);
}

module.exports = { getOrCreateAccount, deposit, withdraw, transfer, applyDelta, resetBalance, leaderboard };
