const express = require("express");

const fetch = global.fetch;

const app = express();
const PORT = 3000;

// ================= CONFIG =================
const JSONBIN_ID = "6955a364d0ea881f404c7f60";
const JSONBIN_API_KEY = "$2a$10$nCBLclxfTfVHOJVQH1rRSOq.M/Ds19fpLw1sEX7k9IREVmxidVeBS";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_ID}`;
const CODE_EXPIRY_HOURS = 24;
// ========================================

// MIDDLEWARE
app.use(express.json());
app.use(express.static("public"));

// ---------- JSONBIN ----------
const readDB = async () => {
  const res = await fetch(JSONBIN_URL + "/latest", {
    headers: {
      "X-Master-Key": JSONBIN_API_KEY
    }
  });
  const data = await res.json();
  return data.record || [];
};

const writeDB = async (data) => {
  await fetch(JSONBIN_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": JSONBIN_API_KEY
    },
    body: JSON.stringify(data)
  });
};

// ---------- UTILS ----------
const generateECode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let c = "";
  for (let i = 0; i < 16; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c.replace(/(.{4})/g, "$1-").slice(0, -1);
};

const isExpired = (expiresAt) =>
  expiresAt && Date.now() > new Date(expiresAt).getTime();

// ================= ROUTES =================

// GENERATE
app.post("/generate", async (req, res) => {
  const { crypto, usd, amount, expiresAt } = req.body;
  if (!crypto || !usd || !amount) return res.json({ error: "Invalid data" });

  const db = await readDB();
  let code;

  do {
    code = generateECode();
  } while (db.some(x => x.code === code));

  db.push({
    code,
    crypto,
    usd,
    amount,
    expiresAt: expiresAt || new Date(Date.now() + CODE_EXPIRY_HOURS * 3600000).toISOString(),
    redeemed: false,
    revoked: false,
    createdAt: new Date().toISOString(),
    redeemedAt: null
  });

  await writeDB(db);
  res.json({ success: true, code });
});

// CHECK
app.post("/check", async (req, res) => {
  const { code } = req.body;
  const db = await readDB();
  const c = db.find(x => x.code === code);

  if (!c) return res.json({ error: "Invalid code" });
  if (c.revoked) return res.json({ error: "Code revoked" });
  if (c.redeemed) return res.json({ error: "Already redeemed" });
  if (isExpired(c.expiresAt)) return res.json({ error: "Code expired" });

  res.json({
    success: true,
    code: c.code,
    crypto: c.crypto,
    amount: c.amount,
    usd: c.usd,
    expiresAt: c.expiresAt
  });
});

// REDEEM
app.post("/redeem", async (req, res) => {
  const { code } = req.body;
  const db = await readDB();
  const i = db.findIndex(x => x.code === code);

  if (i === -1) return res.json({ error: "Invalid code" });
  if (db[i].redeemed || db[i].revoked) return res.json({ error: "Unavailable" });
  if (isExpired(db[i].expiresAt)) return res.json({ error: "Expired" });

  db[i].redeemed = true;
  db[i].redeemedAt = new Date().toISOString();

  await writeDB(db);
  res.json({ success: true, receipt: db[i] });
});

// ADMIN
app.get("/codes", async (req, res) => {
  const db = await readDB();
  res.json(db);
});

// UPDATE
app.post("/update", async (req, res) => {
  const { code, crypto, usd, amount, expiresAt } = req.body;
  const db = await readDB();
  const c = db.find(x => x.code === code);

  if (!c) return res.json({ error: "Not found" });

  if (crypto) c.crypto = crypto;
  if (usd) c.usd = usd;
  if (amount) c.amount = amount;
  if (expiresAt) c.expiresAt = expiresAt;

  await writeDB(db);
  res.json({ success: true });
});

// REVOKE
app.post("/revoke", async (req, res) => {
  const { code } = req.body;
  const db = await readDB();
  const c = db.find(x => x.code === code);

  if (!c) return res.json({ error: "Not found" });

  c.revoked = true;
  await writeDB(db);

  res.json({ success: true });
});

// START SERVER
app.listen(PORT, () => {
  console.log(`🚀 Running http://localhost:${PORT}`);
});