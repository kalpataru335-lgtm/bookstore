const API = "https://bookstore-backend-971c.onrender.com";
let selected = JSON.parse(localStorage.getItem("selectedBooks")) || [];
// Enforce numeric types from storage
selected = selected.map(Number);
let booksData = [];
const CACHE_KEY = "booksCache";

// Clear any stale bundle state on load
localStorage.setItem("bundleApplied", "false");

async function loadBooks() {
  const container = document.getElementById("books");

  // 🟢 PHASE 7A FIX: Load from local cache with 15s expiry check
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    const parsed = JSON.parse(cached);
    if (Date.now() - parsed.time < 15000) {
      booksData = parsed.data;
      renderBooks(booksData);
    }
  }

  try {
    const res = await fetch(API + "/books", { cache: "no-store" });
    const data = await res.json();
    booksData = data;
    
    // Auto-clean selection: Remove items that were sold/locked by others
    selected = selected.filter(id => {
      // 🔒 CRITICAL FIX: Strict Type matching
      const b = data.find(x => Number(x.id) === Number(id));
      return b && b.status === "available";
    });
    localStorage.setItem("selectedBooks", JSON.stringify(selected));

    // 🟢 Save to cache with timestamp
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      data: data,
      time: Date.now()
    }));

    renderBooks(data);
  } catch (err) {
    if (!booksData.length) {
      container.innerHTML = "❌ Connection failed. <button onclick='loadBooks()'>Retry</button>";
    }
  }
}

function renderBooks(books) {
  const container = document.getElementById("books");
  container.innerHTML = "";
  
  books.forEach(b => {
    const card = document.createElement("div");
    
    const mrp = b.price * 4; // Phase 4 UI logic

    let highlight = "";
    if (b.name.toLowerCase().includes("lilamrit")) {
      highlight = `<div class="highlight">7 Vol Set • Sealed (Vol 1 open)</div>`;
    }

    if (b.status === "locked") {
      let remaining = 180 - Math.floor((Date.now() - b.lockedAt) / 1000);
      if (remaining < 0) remaining = 0;

      card.className = "card locked";
      card.innerHTML = `
        ${highlight}
        <b>${b.name}</b>
        <div class="strike">₹${mrp}</div>
        <div class="price">₹${b.price}</div>
        <small style="color:#facc15;">⏳ LOCKED (${remaining}s)</small>
      `;

    } else if (b.status === "sold") {
      card.className = "card locked";
      card.innerHTML = `
        ${highlight}
        <b>${b.name}</b>
        <div class="strike">₹${mrp}</div>
        <div class="price">₹${b.price}</div>
        <small style="color:#ef4444;">❌ SOLD</small>
      `;

    } else {
      card.className = "card";
      if (selected.includes(Number(b.id))) card.classList.add("selected");

      card.innerHTML = `
        ${highlight}
        <b>${b.name}</b>
        <div class="strike">₹${mrp}</div>
        <div class="price">₹${b.price}</div>
      `;

      card.onclick = () => toggleSelection(Number(b.id));
    }
    
    container.appendChild(card);
  });
  
  updateTotal();
}

function toggleSelection(id) {
  const numId = Number(id);
  selected = selected.includes(numId) ? selected.filter(x => Number(x) !== numId) : [...selected, numId];
  localStorage.setItem("selectedBooks", JSON.stringify(selected));
  renderBooks(booksData);
}

function updateTotal() {
  let rawTotal = 0;
  let total = 0;

  selected.forEach(id => {
    // 🔒 CRITICAL FIX: Strict Type matching
    const b = booksData.find(x => Number(x.id) === Number(id));
    if (b) rawTotal += Number(b.price);
  });

  total = rawTotal;
  const availableCount = booksData.filter(b => b.status === "available").length;
  const isBundle = selected.length === availableCount && availableCount > 0;

  if (isBundle) {
    total -= 100; // Bundle discount
  }

  document.getElementById("total").innerText = total;
  const msg = document.getElementById("msg");

  if (msg) {
    if (rawTotal <= 0) {
      msg.innerText = "Minimum ₹160 required";
    } else if (rawTotal < 160) {
      msg.innerText = `Add ₹${160 - rawTotal} more to order`;
    } else {
      msg.innerText = "Ready to proceed";
    }
  }
}

function goNext() {
  // 🟢 PHASE 7A FIX: Removed redundant checks for faster navigation
  window.location.href = "details.html";
}

// Live Countdown Interval
setInterval(() => {
  document.querySelectorAll(".locked small").forEach(el => {
    let match = el.innerText.match(/(\d+)s/);
    if (!match) return;

    let t = parseInt(match[1]);
    if (t > 0) {
      el.innerText = `⏳ LOCKED (${t - 1}s)`;
    } else {
      el.innerText = "⏳ Release pending...";
      if (t === 0) loadBooks(); 
    }
  });
}, 1000);

// Initialize
loadBooks();