const API = "https://bookstore-backend-971c.onrender.com";
let selected = JSON.parse(localStorage.getItem("selectedBooks")) || [];
// Enforce numeric types from storage
selected = selected.map(Number);
let booksData = [];

// Clear any stale bundle state on load
localStorage.setItem("bundleApplied", "false");

async function loadBooks() {
  const container = document.getElementById("books");
  try {
    const res = await fetch(API + "/books", { cache: "no-store" });
    const data = await res.json();
    booksData = data;
    
    // Auto-clean selection: Remove items that were sold/locked by others
    selected = selected.filter(id => {
      // 🔒 CRITICAL FIX 1: Strict Type matching
      const b = data.find(x => Number(x.id) === Number(id));
      return b && b.status === "available";
    });
    localStorage.setItem("selectedBooks", JSON.stringify(selected));

    renderBooks(data);
  } catch (err) {
    container.innerHTML = "❌ Connection failed. <button onclick='loadBooks()'>Retry</button>";
  }
}

function renderBooks(books) {
  const container = document.getElementById("books");
  container.innerHTML = "";
  
  books.forEach(b => {
    const card = document.createElement("div");
    
    // Locked Card with Live Timer
    if (b.status === "locked") {
      card.className = "card locked";
      
      let remaining = 180 - Math.floor((Date.now() - b.lockedAt) / 1000);
      if (remaining < 0) remaining = 0;

      card.innerHTML = `
        <b>${b.name}</b>
        <div class="price">₹${b.price}</div>
        <small style="color:#facc15; display:block; margin-top:6px;">
          ⏳ LOCKED (${remaining}s)
        </small>
      `;
    } else if (b.status === "sold") {
      // 🟡 MINOR FIX 2: Explicitly show SOLD UI
      card.className = "card sold";
      // 🔒 CRITICAL FIX 1: Strict Type matching
      if (selected.includes(Number(b.id))) card.classList.add("selected");
      
      card.innerHTML = `
        <b>${b.name}</b>
        <div class="price">₹${b.price}</div>
        <small style="color:#ef4444; display:block; margin-top:6px;">❌ SOLD</small>
      `;
    } else {
      // Available Card
      card.className = "card";
      // 🔒 CRITICAL FIX 1: Strict Type matching
      if (selected.includes(Number(b.id))) card.classList.add("selected");
      
      card.innerHTML = `<b>${b.name}</b><div class="price">₹${b.price}</div>`;
      card.onclick = () => toggleSelection(b.id);
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
    // 🔒 CRITICAL FIX 1: Strict Type matching
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
  let rawTotal = 0;
  selected.forEach(id => {
    // 🔒 CRITICAL FIX 1: Strict Type matching
    const b = booksData.find(x => Number(x.id) === Number(id));
    if (b) rawTotal += Number(b.price);
  });
  
  if (rawTotal < 160) {
    alert("Minimum ₹160 required"); 
    return;
  }
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