import dotenv from "dotenv";
dotenv.config(); // Phase 1: Security initialization
import express from "express";
import cors from "cors";
import Razorpay from "razorpay";
import fetch from "node-fetch";
import fs from "fs"; // Phase 4: Persistence logic

const app = express();
app.use(cors());
app.use(express.json());

const orders = [];
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID, // Secured via Environment Variables
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Phase 4: Database Persistence
const DATA_FILE = "./books.json";
let books = JSON.parse(fs.readFileSync(DATA_FILE));

function saveBooks() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(books, null, 2));
}

// 🛒 Order Creation
app.post("/create-order", async (req, res) => {
  try {
    const { amount } = req.body;
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // Standard Razorpay Paisa conversion
      currency: "INR",
      receipt: "rcpt_" + Date.now()
    });
    res.json(order);
  } catch (err) {
    console.log("ORDER ERROR:", err);
    res.status(500).json({ error: "Order failed" });
  }
});

// ✅ Order Confirmation
app.post("/confirm-order", async (req, res) => {
  const { ids, paymentId, name, phone, address, pincode, amount } = req.body;
  if (!ids || ids.length === 0) return res.status(400).json({ error: "Invalid order" });

  // Update status and save to disk
  books = books.map(b => ids.includes(b.id) ? { ...b, status: "sold" } : b);
  saveBooks();

  const bookList = books
    .filter(b => ids.includes(b.id))
    .map(b => b.name)
    .join("\n• ");

  const receiptText = `
==============================
        SOURAV BOOKSTORE
==============================

Order Receipt

Name: ${name}
Phone: ${phone}
Address: ${address}, ${pincode}

------------------------------
Books:
• ${bookList}

------------------------------
Total Paid: Rs.${amount}

Payment ID: ${paymentId}
Date: ${new Date().toLocaleString()}

Thank you for your purchase 🙏
==============================
`;

  orders.push({ id: Date.now(), books: bookList, paymentId, name, phone, address, pincode, amount, time: new Date() });

  // Phase 3: Google Sheet Reliability
  let sheetSuccess = false;
  try {
    console.log("📡 Sending data to Google Sheet...");
    const sheetRes = await fetch("https://script.google.com/macros/s/AKfycbysaH5JHd7DIl5t-2zurPEaqOHuxE-E8Af-n5K6pw8PF-rkYDuKdKtVaay_OINg6qFA/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, address, pincode, books: bookList, amount, paymentId })
    });

    const text = await sheetRes.text();
    console.log("📊 Sheet Response:", text); 
    if (sheetRes.ok) sheetSuccess = true;
  } catch (err) {
    console.log("❌ Sheet Error:", err.message);
  }

  res.json({ success: true, receipt: receiptText });
});

// 📚 Inventory Management
app.get("/books", (req, res) => res.json(books));

app.post("/lock-books", (req, res) => {
  const { ids } = req.body;
  books = books.map(b => ids.includes(b.id) ? { ...b, status: "locked", lockedAt: Date.now() } : b);
  saveBooks();
  res.json({ success: true });
});

app.post("/unlock-books", (req, res) => {
  const { ids } = req.body;
  books = books.map(b => 
    ids.includes(b.id) && b.status === "locked" 
      ? { ...b, status: "available", lockedAt: null } 
      : b
  );
  saveBooks();
  res.json({ success: true });
});

// ⏰ Auto-Unlock Expired Locks (3 Minutes)
setInterval(() => {
  let changed = false;
  books = books.map(b => {
    if (b.status === "locked" && (Date.now() - b.lockedAt > 180000)) {
      changed = true;
      return { ...b, status: "available", lockedAt: null };
    }
    return b;
  });
  if (changed) saveBooks();
}, 60000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));