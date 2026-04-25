import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import Razorpay from "razorpay";
import fetch from "node-fetch";

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
  // 🔒 CRITICAL FIX 2: Removed amount from req.body to prevent manipulation
  const { ids, paymentId, name, phone, address, pincode } = req.body;
  if (!ids || ids.length === 0) return res.status(400).json({ error: "Invalid order" });

  // 🔒 CRITICAL FIX 2: Recalculate amount directly from the authoritative sheet
  const r = await fetch(SHEET_API + "?type=books");
  const currentBooks = await r.json();

  let total = 0;
  ids.forEach(id => {
    // 🔒 CRITICAL FIX 1: Strict Type matching
    const b = currentBooks.find(x => Number(x.id) === Number(id));
    if (b) total += Number(b.price);
  });

  const amount = total; // Securely calculated backend amount

  // Update Sold status via Sheet 
  const updates = ids.map(id => ({ id, status: "sold", lockedAt: "" }));
  
  // 🔒 CRITICAL FIX 3: Added Headers to prevent silent JSON parse failures
  await fetch(SHEET_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "updateBooks", updates })
  });

  const bookList = currentBooks.filter(b => ids.includes(b.id)).map(b => b.name).join("\n• ");

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
✔ Delivery in 4–7 days

Thank you for your purchase!
====================================
`;

  try {
    // Log order to Sheet3
    await fetch(SHEET_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, address, pincode, books: bookList, amount, paymentId })
    });
  } catch (err) {
    console.log("❌ Sheet Error:", err.message);
  }

  res.json({ success: true, receipt: receiptText });
});

// Sheet Inventory Route 
app.get("/books", async (req, res) => {
  try {
    const r = await fetch(SHEET_API + "?type=books");
    const data = await r.json();
    const now = Date.now();

    // Auto-unlock calculation based on Sheet timestamps
    data.forEach(b => {
      if (b.status === "locked" && b.lockedAt) {
        if (now - b.lockedAt > 180000) {
          b.status = "available";
          b.lockedAt = "";
        }
      }
    });

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "sheet fetch failed" });
  }
});

app.post("/lock-books", async (req, res) => {
  const { ids } = req.body;
  const updates = ids.map(id => ({ id, status: "locked", lockedAt: Date.now() }));
  
  await fetch(SHEET_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "updateBooks", updates })
  });

  res.json({ success: true });
});

app.post("/unlock-books", async (req, res) => {
  const { ids } = req.body;
  const updates = ids.map(id => ({ id, status: "available", lockedAt: "" }));
  
  await fetch(SHEET_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "updateBooks", updates })
  });

  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));