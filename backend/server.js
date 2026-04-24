import express from "express";
import cors from "cors";
import Razorpay from "razorpay";
import fetch from "node-fetch"; // 🔥 PATCH: Essential for Google Sheets communication

const app = express();
app.use(cors());
app.use(express.json());

/* ================= STORAGE & RAZORPAY ================= */

// Memory storage for immediate admin checks (Resets on server restart)
const orders = [];

const razorpay = new Razorpay({
  key_id: "rzp_test_SguP9aeomm5pPh", // 🔁 Replace with LIVE Key for launch
  key_secret: "Y9bSS39BVhfjsZznrJdeX5Y1"               // 🔁 Replace with your actual Secret Key
});

/* ================= BOOK DATA ================= */

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

/* ================= GET ROUTES ================= */

app.get("/books", (req, res) => res.json(books));
app.get("/orders", (req, res) => res.json(orders));
app.get("/", (req, res) => res.send("Backend Running ✅"));

/* ================= POST ROUTES ================= */

// 🔥 CONFIRM ORDER: MARK SOLD + GOOGLE SHEETS PERMANENT STORAGE
app.post("/confirm-order", async (req, res) => {
  const { ids, paymentId, name, phone, address, pincode, amount } = req.body;

  if (!ids || ids.length === 0) {
    return res.status(400).json({ error: "Invalid order" });
  }

  // 1. Mark as SOLD in server memory
  books = books.map(b =>
    ids.includes(b.id) ? { ...b, status: "sold" } : b
  );

  // 2. Store in local array for immediate admin view
  orders.push({ 
    id: Date.now(), 
    books: ids, 
    paymentId, 
    name, 
    phone, 
    address, 
    pincode, 
    amount, 
    time: new Date() 
  });

  try {
    // 🔸 MAP IDS TO READABLE NAMES FOR THE SHEET
    const bookNames = ids.map(id => {
      const b = books.find(x => x.id === id);
      return b ? b.name : `ID:${id}`;
    }).join(", ");

    // 3. ✅ SEND TO GOOGLE SHEET (PERMANENT STORAGE)
    const sheetRes = await fetch("https://script.google.com/macros/s/AKfycbysaH5JHd7DIl5t-2zurPEaqOHuxE-E8Af-n5K6pw8PF-rkYDuKdKtVaay_OINg6qFA/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        phone,
        address,
        pincode,
        books: bookNames,
        amount,
        paymentId
      })
    });

    // ✅ PATCH: VERIFY SUCCESSFUL WRITE
    if (!sheetRes.ok) {
        console.error("❌ Google Sheet write failed");
    } else {
        console.log("✅ Order saved to Google Sheet");
    }

  } catch (err) {
    console.error("❌ Google Sheet Relay Error:", err);
  }

  res.json({ success: true });
});

// LOCK INVENTORY
app.post("/lock-books", (req, res) => {
  const { ids } = req.body;
  let unavailable = books.filter(b => ids.includes(b.id) && b.status !== "available");
  
  if (unavailable.length > 0) return res.json({ success: false });

  books = books.map(b => 
    ids.includes(b.id) ? { ...b, status: "locked", lockedAt: Date.now() } : b
  );
  res.json({ success: true });
});

// UNLOCK INVENTORY (ON FAIL OR CANCEL)
app.post("/unlock-books", (req, res) => {
  const { ids } = req.body;
  books = books.map(b => 
    ids.includes(b.id) && b.status === "locked" ? { ...b, status: "available", lockedAt: null } : b
  );
  res.json({ success: true });
});

// RAZORPAY ORDER CREATION
app.post("/create-order", async (req, res) => {
  const { amount } = req.body;
  try {
    const order = await razorpay.orders.create({
      amount: amount * 100, // paise
      currency: "INR",
      receipt: "order_" + Date.now()
    });
    res.json(order);
  } catch (err) {
    console.error("Order creation failed:", err);
    res.status(500).json({ error: "Order creation failed" });
  }
});

/* ================= AUTO UNLOCK (3 MINUTE CLEANER) ================= */

setInterval(() => {
  books = books.map(b => {
    if (b.status === "locked" && (Date.now() - b.lockedAt > 180000)) {
      console.log(`Auto-unlocking: ${b.name}`);
      return { ...b, status: "available", lockedAt: null };
    }
    return b;
  });
}, 60000); // Check every minute

/* ================= START SERVER ================= */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});