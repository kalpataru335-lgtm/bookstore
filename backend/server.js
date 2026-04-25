import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import Razorpay from "razorpay";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

const orders = [];
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

let books = [
  { id:1, name:"Srila Prabhupada lilamrit (7 Volumes)", price:360, weight:4, status:"available" },
  { id:2, name:"The Hare Krishna Explosion", price:84, weight:0.5, status:"available" },
  { id:3, name:"Sri Navadvipa-dhama Mahatmya", price:36, weight:0.3, status:"available" },
  { id:4, name:"Prabhupada: Messenger of the Supreme Lord", price:36, weight:0.3, status:"available" },
  { id:5, name:"Teachings of Queen Kunti", price:24, weight:0.25, status:"available" },
  { id:6, name:"Divine Instructions", price:24, weight:0.15, status:"available" },
  { id:7, name:"Japa", price:36, weight:0.3, status:"available" },
  { id:8, name:"Teachings of Lord Caitanya", price:24, weight:0.25, status:"available" },
  { id:9, name:"The Path of Perfection", price:14, weight:0.2, status:"available" },
  { id:10, name:"Message of Godhead", price:6, weight:0.2, status:"available" },
  { id:11, name:"Matchless Gift", price:12, weight:0.2, status:"available" },
  { id:12, name:"Transcendental Teachings of Prahlada Maharaja", price:12, weight:0.2, status:"available" },
  { id:13, name:"Modern Times in Vedic Perspective", price:12, weight:0.2, status:"available" },
  { id:14, name:"Beyond Birth and Death", price:8, weight:0.2, status:"available" },
  { id:15, name:"Life Comes From Life", price:20, weight:0.3, status:"available" },
  { id:16, name:"Easy Journey to Other Planets", price:12, weight:0.2, status:"available" },
  { id:17, name:"Civilization and Transcendence", price:12, weight:0.2, status:"available" },
  { id:18, name:"The Nectar of Instruction", price:12, weight:0.2, status:"available" },
  { id:19, name:"The Hare Krishna Challenge", price:12, weight:0.2, status:"available" },
  { id:20, name:"Raja Vidya: King of Knowledge", price:12, weight:0.2, status:"available" },
  { id:21, name:"Consciousness: The Missing Link", price:12, weight:0.2, status:"available" },
  { id:22, name:"The Laws of Nature", price:20, weight:0.3, status:"available" }
];

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
  const { ids, paymentId, name, phone, address, pincode, amount } = req.body;
  if (!ids || ids.length === 0) return res.status(400).json({ error: "Invalid order" });

  books = books.map(b => ids.includes(b.id) ? { ...b, status: "sold" } : b);
  const bookList = books.filter(b => ids.includes(b.id)).map(b => b.name).join("\n• ");

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
Total Paid: ₹${amount}
Payment ID: ${paymentId}
Date: ${new Date().toLocaleString()}
Thank you for your purchase 🙏
==============================
`;

  orders.push({ id: Date.now(), books: bookList, paymentId, name, phone, address, pincode, amount, time: new Date() });

  let sheetSuccess = false;
  try {
    const sheetRes = await fetch("https://script.google.com/macros/s/AKfycbysaH5JHd7DIl5t-2zurPEaqOHuxE-E8Af-n5K6pw8PF-rkYDuKdKtVaay_OINg6qFA/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, address, pincode, books: bookList, amount, paymentId })
    });
    const text = await sheetRes.text();
    if (sheetRes.ok) sheetSuccess = true;
    console.log("📊 Sheet Response:", text);
  } catch (err) { console.log("❌ Sheet Error:", err.message); }

  res.json({ success: true, receipt: receiptText });
});

app.get("/books", (req, res) => res.json(books));
app.post("/lock-books", (req, res) => {
  const { ids } = req.body;
  books = books.map(b => ids.includes(b.id) ? { ...b, status: "locked", lockedAt: Date.now() } : b);
  res.json({ success: true });
});
app.post("/unlock-books", (req, res) => {
  const { ids } = req.body;
  books = books.map(b => ids.includes(b.id) && b.status === "locked" ? { ...b, status: "available", lockedAt: null } : b);
  res.json({ success: true });
});

setInterval(() => {
  books = books.map(b => (b.status === "locked" && (Date.now() - b.lockedAt > 180000)) ? { ...b, status: "available", lockedAt: null } : b);
}, 60000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));