import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import Razorpay from "razorpay";
import fetch from "node-fetch";

// 🟢 HYBRID CACHE (Phase 1)
let booksCache = [];
let lastFetchTime = 0;
const CACHE_TTL = 10000; // 10 seconds

async function fetchBooksFromSheet() {
  try {
    const r = await fetch(SHEET_API + "?type=books");
    const data = await r.json();

    booksCache = data;
    lastFetchTime = Date.now();

    console.log("✅ Cache refreshed from sheet");
  } catch (err) {
    console.log("❌ Sheet fetch failed:", err.message);
  }
}

async function safeSheetUpdate(payload, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(SHEET_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const text = await res.text();

      if (res.ok && text.includes("SUCCESS")) {
        console.log("✅ Sheet update success");
        return true;
      }

      throw new Error("Invalid response: " + text);

    } catch (err) {
      console.log(`❌ Sheet attempt ${i + 1} failed:`, err.message);

      if (i === retries) {
        console.log("🚨 FINAL FAILURE: Sheet update failed");
        return false;
      }

      // wait before retry
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

function processLocks(data) {
  const now = Date.now();

  return data.map(b => {
    if (b.status === "locked" && b.lockedAt) {
      if (now - b.lockedAt > 180000) {
        return { ...b, status: "available", lockedAt: "" };
      }
    }
    return b;
  });
}

const app = express();
app.use(cors());
app.use(express.json());

// 🔴 REPLACE WITH YOUR NEW DEPLOYED APP SCRIPT URL
const SHEET_API = "https://script.google.com/macros/s/AKfycbysaH5JHd7DIl5t-2zurPEaqOHuxE-E8Af-n5K6pw8PF-rkYDuKdKtVaay_OINg6qFA/exec"; 

const orders = [];
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

app.post("/create-order", async (req, res) => {
  try {
    const { amount } = req.body;
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: "rcpt_" + Date.now()
    });
    res.json(order);
  } catch (err) {
    console.log("ORDER ERROR:", err);
    res.status(500).json({ error: "Order failed" });
  }
});

app.post("/confirm-order", async (req, res) => {
  const { ids, paymentId, name, phone, address, pincode } = req.body;
  if (!ids || ids.length === 0) return res.status(400).json({ error: "Invalid order" });

  // ❌ Prevent buying already sold/locked by others (🟢 FIX 1: TYPE MISMATCH)
  const invalid = booksCache.filter(b =>
    ids.map(Number).includes(Number(b.id)) && b.status !== "locked"
  );

  if (invalid.length > 0) {
    return res.status(400).json({
      error: "Some books are no longer available"
    });
  }

  // 🟢 FIX 2: REMOVE EXTRA SHEET FETCH (Use Cache)
  const currentBooks = booksCache;

  let total = 0;
  ids.forEach(id => {
    const b = currentBooks.find(x => Number(x.id) === Number(id));
    if (b) total += Number(b.price);
  });

  const amount = total; // Securely calculated backend amount

  console.log("📦 Order received:", {
    name,
    phone,
    amount,
    paymentId
  });

  // Update Sold status via Sheet 
  const updates = ids.map(id => ({ id, status: "sold", lockedAt: "" }));
  
  // 🟢 Update cache instantly (🟢 FIX 1: TYPE MISMATCH)
  booksCache = booksCache.map(b =>
    ids.map(Number).includes(Number(b.id))
      ? { ...b, status: "sold", lockedAt: "" }
      : b
  );

  await safeSheetUpdate({ type: "updateBooks", updates });

  const bookList = currentBooks.filter(b => ids.map(Number).includes(Number(b.id))).map(b => b.name).join("\n• ");

  const receiptText = `
====================================
        SOURAV BOOKSTORE
====================================

🧾 ORDER RECEIPT

Name: ${name}
Phone: ${phone}
Address: ${address}, ${pincode}

------------------------------------
📚 Books Purchased:
• ${bookList}

------------------------------------
💰 Total Paid: Rs.${amount}

🧾 Payment ID: ${paymentId}
🆔 Order ID: ${paymentId.slice(-6).toUpperCase()}
📅 Date: ${new Date().toLocaleString()}

------------------------------------
✔ Order Confirmed
✔ Delivery date will be updated soon

Thank you for your purchase!
====================================
`;

  // Log order to Sheet3
  const saved = await safeSheetUpdate({
    name,
    phone,
    address,
    pincode,
    books: bookList,
    amount,
    paymentId
  });

  if (!saved) {
    console.log("⚠️ Order saved failed — manual check needed");
  }

  res.json({ success: true, receipt: receiptText });
});

// Sheet Inventory Route 
app.get("/books", async (req, res) => {
  try {
    const now = Date.now();

    // 🟢 If cache empty OR expired → refresh
    if (!booksCache.length || (now - lastFetchTime > CACHE_TTL)) {
      await fetchBooksFromSheet();
    }

    // 🟢 Auto-unlock in cache
    booksCache = processLocks(booksCache);

    res.json(booksCache);
  } catch (e) {
    res.status(500).json({ error: "cache fetch failed" });
  }
});

app.post("/lock-books", async (req, res) => {
  const { ids } = req.body;

  // ❌ Prevent locking already locked/sold books (🟢 FIX 1: TYPE MISMATCH)
  const invalid = booksCache.filter(b =>
    ids.map(Number).includes(Number(b.id)) && b.status !== "available"
  );

  if (invalid.length > 0) {
    return res.json({
      success: false,
      message: "Some books already locked or sold"
    });
  }

  // 🟢 FIX 3: LOCK TIMESTAMP CONSISTENCY
  const now = Date.now();

  // 🟢 Update cache instantly (🟢 FIX 1: TYPE MISMATCH)
  booksCache = booksCache.map(b =>
    ids.map(Number).includes(Number(b.id))
      ? { ...b, status: "locked", lockedAt: now }
      : b
  );

  // 🟢 Async update to sheet
  safeSheetUpdate({
    type: "updateBooks",
    updates: ids.map(id => ({
      id,
      status: "locked",
      lockedAt: now
    }))
  });

  res.json({ success: true });
});

app.post("/unlock-books", async (req, res) => {
  const { ids } = req.body;

  // 🟢 Update cache instantly (🟢 FIX 1: TYPE MISMATCH)
  booksCache = booksCache.map(b =>
    ids.map(Number).includes(Number(b.id))
      ? { ...b, status: "available", lockedAt: "" }
      : b
  );

  // 🟢 Async sheet update
  safeSheetUpdate({
    type: "updateBooks",
    updates: ids.map(id => ({
      id,
      status: "available",
      lockedAt: ""
    }))
  });

  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

async function syncExpiredLocks() {
  const now = Date.now();

  const expired = booksCache.filter(b =>
    b.status === "locked" &&
    b.lockedAt &&
    (now - b.lockedAt > 180000)
  );

  if (expired.length === 0) return;

  await safeSheetUpdate({
    type: "updateBooks",
    updates: expired.map(b => ({
      id: b.id,
      status: "available",
      lockedAt: ""
    }))
  });

  console.log("🔄 Synced expired locks to sheet");
}

// 🟢 Background sync every 15 sec
setInterval(async () => {
  await fetchBooksFromSheet();
  booksCache = processLocks(booksCache);
  await syncExpiredLocks();
}, 15000);