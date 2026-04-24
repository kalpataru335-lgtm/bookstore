
const express = require("express");
const cors = require("cors");
const Razorpay = require("razorpay");

const app = express();

app.use(cors());
app.use(express.json());

/* ================= RAZORPAY ================= */

const razorpay = new Razorpay({
  key_id: "rzp_test_SguP9aeomm5pPh",        // 🔁 REPLACE
  key_secret: "Y9bSS39BVhfjsZznrJdeX5Y1"           // 🔁 REPLACE
});

/* ================= BOOK DATA ================= */

let books = [
  { id:1, name:"Srila Prabhupada Lilamrit (7 Volumes)", price:360, weight:4, status:"available" },
  { id:2, name:"Hare Krishna Explosion", price:84, weight:0.5, status:"available" },
  { id:3, name:"Navadvipa Mahatmya", price:36, weight:0.3, status:"available" },
  { id:4, name:"Messenger of Supreme Lord", price:36, weight:0.3, status:"available" },
  { id:5, name:"Teachings of Queen Kunti", price:24, weight:0.25, status:"available" },
  { id:6, name:"Divine Instructions", price:24, weight:0.15, status:"available" },
  { id:7, name:"Japa", price:36, weight:0.3, status:"available" },
  { id:8, name:"Teachings of Lord Caitanya", price:24, weight:0.25, status:"available" },
  { id:9, name:"Path of Perfection", price:14, weight:0.2, status:"available" },
  { id:10, name:"Message of Godhead", price:6, weight:0.2, status:"available" },
  { id:11, name:"Matchless Gift", price:12, weight:0.2, status:"available" },
  { id:12, name:"Prahlada Maharaja Teachings", price:12, weight:0.2, status:"available" },
  { id:13, name:"Modern Times Vedic", price:12, weight:0.2, status:"available" },
  { id:14, name:"Beyond Birth & Death", price:8, weight:0.2, status:"available" },
  { id:15, name:"Life Comes From Life", price:20, weight:0.3, status:"available" },
  { id:16, name:"Easy Journey to Other Planets", price:12, weight:0.2, status:"available" },
  { id:17, name:"Civilization & Transcendence", price:12, weight:0.2, status:"available" },
  { id:18, name:"Nectar of Instruction", price:12, weight:0.2, status:"available" },
  { id:19, name:"Hare Krishna Challenge", price:12, weight:0.2, status:"available" },
  { id:20, name:"Raja Vidya", price:12, weight:0.2, status:"available" },
  { id:21, name:"Consciousness Missing Link", price:12, weight:0.2, status:"available" },
  { id:22, name:"Laws of Nature", price:20, weight:0.3, status:"available" }
];

/* ================= GET BOOKS ================= */

app.get("/books", (req,res)=>{
  res.json(books);
});

/* ================= LOCK BOOKS ================= */

app.post("/lock-books", (req,res)=>{

  const { ids } = req.body;

  let unavailable = books.filter(b =>
    ids.includes(b.id) && b.status !== "available"
  );

  if(unavailable.length > 0){
    return res.json({ success:false });
  }

  books.forEach(b=>{
    if(ids.includes(b.id)){
      b.status = "locked";
      b.lockedAt = Date.now();
    }
  });

  res.json({ success:true });
});

/* ================= UNLOCK BOOKS ================= */

app.post("/unlock-books", (req,res)=>{

  const { ids } = req.body;

  books.forEach(b=>{
    if(ids.includes(b.id) && b.status === "locked"){
      b.status = "available";
      delete b.lockedAt;
    }
  });

  res.json({ success:true });
});

/* ================= AUTO UNLOCK ================= */

setInterval(()=>{
  books.forEach(b=>{
    if(b.status === "locked"){
      let diff = Date.now() - b.lockedAt;

      if(diff > 180000){ // 3 min
        b.status = "available";
        delete b.lockedAt;
      }
    }
  });
}, 60000);

/* ================= CREATE ORDER ================= */

app.post("/create-order", async (req,res)=>{

  const { amount } = req.body;

  try{
    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "order_" + Date.now()
    });

    res.json(order);

  }catch(err){
    console.log(err);
    res.status(500).json({ error:"Order creation failed" });
  }
});

/* ================= VERIFY PAYMENT ================= */

app.post("/verify-payment", (req,res)=>{

  const { books: ids } = req.body;

  books.forEach(b=>{
    if(ids.includes(b.id)){
      b.status = "sold";
      delete b.lockedAt;
    }
  });

  res.json({ success:true });
});

/* ================= ROOT ================= */

app.get("/", (req,res)=>{
  res.send("Backend Running ✅");
});

/* ================= START ================= */

app.listen(3000, ()=>{
  console.log("Server running on port 3000");
});