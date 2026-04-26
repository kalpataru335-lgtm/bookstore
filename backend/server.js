import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import Razorpay from "razorpay";
import fetch from "node-fetch";

// 🟢 HYBRID CACHE & FAIL-SAFE QUEUE
let booksCache = [];
let lastFetchTime = 0;
const CACHE_TTL = 10000; // 10 seconds
let pendingSheetFailures = []; 

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

async function safeSheetUpdate(payload, retries = 3) {
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
        console.log("🚨 FINAL FAILURE: Saving for retry later");
        pendingSheetFailures.push(payload);
        return false;
      }

      await new Promise(r => setTimeout(r, 700));
    }
  }
}

function processLocks(data) {
  const now = Date.now();
  return data.map(b => {
    if (b.status === "locked" && b.lockedAt) {
      if (now - b.lockedAt > 180000) {
        return { ...b, status: "available", lockedAt: "", lockedBy: "" };
      }
    }
    return b;
  });
}

function verifyPayment({ order_id, payment_id, signature }) {
  const body = order_id + "|" + payment_id;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest("hex");

  return expectedSignature === signature;
}

const app = express();
app.use(cors());
app.use(express.json());

const SHEET_API = "https://script.google.com/macros/s/AKfycbysaH5JHd7DIl5t-2zurPEaqOHuxE-E8Af-n5K6pw8PF-rkYDuKdKtVaay_OINg6qFA/exec"; 

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

app.post("/create-order", async (req, res) => {
  try {
    const { ids, shipping = 0, discount = 0 } = req.body;

    let booksTotal = 0;

    ids.forEach(id => {
      const b = booksCache.find(x => Number(x.id) === Number(id));
      if (b) booksTotal += Number(b.price);
    });

    let calculatedTotal = booksTotal + Number(shipping) - Number(discount);

    if (calculatedTotal < 1) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(calculatedTotal * 100),
      currency: "INR",
      receipt: "rcpt_" + Date.now()
    });

    res.json({ ...order, calculatedAmount: calculatedTotal });

  } catch (err) {
    console.log("ORDER ERROR:", err);
    res.status(500).json({ error: "Order failed" });
  }
});

app.post("/confirm-order", async (req, res) => {
  const { ids, paymentId, orderId, signature, name, phone, address, pincode, sessionId, shipping = 0, discount = 0 } = req.body;

  if (!paymentId || !orderId || !signature) {
    return res.status(400).json({ error: "Incomplete payment data" });
  }

  if (!ids || ids.length === 0) {
    return res.status(400).json({ error: "Invalid order" });
  }

  const missing = ids.filter(id =>
    !booksCache.find(b => Number(b.id) === Number(id))
  );

  if (missing.length > 0) {
    return res.status(400).json({ error: "Some books not found" });
  }

  const isValid = verifyPayment({
    order_id: orderId,
    payment_id: paymentId,
    signature
  });

  if (!isValid) {
    return res.status(400).json({ error: "Payment verification failed" });
  }

  try {
    const razorpayOrder = await razorpay.orders.fetch(orderId);

    let backendTotal = 0;
    ids.forEach(id => {
      const b = booksCache.find(x => Number(x.id) === Number(id));
      if (b) backendTotal += Number(b.price);
    });

    const expectedAmount = Math.round((backendTotal + Number(shipping) - Number(discount)) * 100);

    if (razorpayOrder.amount !== expectedAmount) {
      return res.status(400).json({ error: "Amount mismatch detected" });
    }

  } catch (err) {
    console.log("Amount verification failed:", err.message);
    return res.status(400).json({ error: "Payment validation failed" });
  }

  const invalid = booksCache.filter(b =>
    ids.map(Number).includes(Number(b.id)) &&
    (b.status !== "locked" || b.lockedBy !== sessionId)
  );

  if (invalid.length > 0) {
    return res.status(400).json({ error: "Books locked by another user or expired" });
  }

  const currentBooks = booksCache;

  let booksTotal = 0;
  ids.forEach(id => {
    const b = currentBooks.find(x => Number(x.id) === Number(id));
    if (b) booksTotal += Number(b.price);
  });

  const amount = booksTotal + Number(shipping) - Number(discount); 

  booksCache = booksCache.map(b =>
    ids.map(Number).includes(Number(b.id))
      ? { ...b, status: "sold", lockedAt: "", lockedBy: "" }
      : b
  );

  const updates = ids.map(id => ({ id, status: "sold", lockedAt: "", lockedBy: "" }));
  const sheetOk = await safeSheetUpdate({ type: "updateBooks", updates });

  if (!sheetOk) {
    console.log("⚠️ Warning: Sheet not updated, but cache is updated (queued for retry)");
  }

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

  const saved = await safeSheetUpdate({
    type: "order", 
    name,
    phone,
    address,
    pincode,
    books: bookList,
    amount,
    paymentId
  });

  if (!saved) console.log("⚠️ Order log to Sheet1 failed but queued for retry");

  res.json({ success: true, receipt: receiptText });
});

app.get("/books", async (req, res) => {
  try {
    const now = Date.now();
    if (!booksCache.length || (now - lastFetchTime > CACHE_TTL)) {
      await fetchBooksFromSheet();
    }
    booksCache = processLocks(booksCache);
    res.json(booksCache);
  } catch (e) {
    res.status(500).json({ error: "cache fetch failed" });
  }
});

app.post("/lock-books", async (req, res) => {
  const { ids, sessionId } = req.body;
  
  const invalid = booksCache.filter(b =>
    ids.map(Number).includes(Number(b.id)) && b.status !== "available"
  );

  if (invalid.length > 0) {
    return res.json({ success: false, message: "Books unavailable" });
  }

  const now = Date.now();

  booksCache = booksCache.map(b =>
    ids.map(Number).includes(Number(b.id))
      ? { ...b, status: "locked", lockedAt: now, lockedBy: sessionId }
      : b
  );

  safeSheetUpdate({
    type: "updateBooks",
    updates: ids.map(id => ({ id, status: "locked", lockedAt: now, lockedBy: sessionId }))
  });

  res.json({ success: true });
});

app.post("/unlock-books", async (req, res) => {
  const { ids } = req.body;

  booksCache = booksCache.map(b =>
    ids.map(Number).includes(Number(b.id))
      ? { ...b, status: "available", lockedAt: "", lockedBy: "" }
      : b
  );

  safeSheetUpdate({
    type: "updateBooks",
    updates: ids.map(id => ({ id, status: "available", lockedAt: "", lockedBy: "" }))
  });

  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

async function syncExpiredLocks() {
  const now = Date.now();
  const expired = booksCache.filter(b =>
    b.status === "locked" && b.lockedAt && (now - b.lockedAt > 180000)
  );
  if (expired.length === 0) return;

  await safeSheetUpdate({
    type: "updateBooks",
    updates: expired.map(b => ({ id: b.id, status: "available", lockedAt: "", lockedBy: "" }))
  });
}

setInterval(async () => {
  await fetchBooksFromSheet();
  booksCache = processLocks(booksCache);
  await syncExpiredLocks();
}, 15000);

setInterval(async () => {
  if (pendingSheetFailures.length === 0) return;

  console.log("🔄 Retrying failed sheet updates...");

  const retryQueue = [...pendingSheetFailures];
  pendingSheetFailures = [];

  for (const payload of retryQueue) {
    const success = await safeSheetUpdate(payload, 1);
    if (!success) {
      pendingSheetFailures.push(payload);
    }
  }
}, 15000);