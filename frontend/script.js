const API = "https://bookstore-backend-971c.onrender.com";
let selected = JSON.parse(localStorage.getItem("selectedBooks")) || [];
selected = selected.map(Number);
let booksData = [];
const CACHE_KEY = "booksCache";

// 🟢 FIX 2: INTERACTION GUARD
let isInteracting = false;
document.addEventListener("click", () => {
  isInteracting = true;
  setTimeout(() => (isInteracting = false), 2000); // 2-second buffer after interaction
});

localStorage.setItem("bundleApplied", "false");

async function loadBooks() {
  const container = document.getElementById("books");

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
    
    selected = selected.filter(id => {
      const b = data.find(x => Number(x.id) === Number(id));
      return b && b.status === "available";
    });
    localStorage.setItem("selectedBooks", JSON.stringify(selected));

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

// 🟢 SMART REFRESH (With Selection Sync & Interaction Guard)
async function refreshBooks() {
  try {
    const res = await fetch(API + "/books", { cache: "no-store" });
    const newData = await res.json();

    const oldStr = JSON.stringify(booksData);
    const latestStr = JSON.stringify(newData);

    // 🟢 FIX 1 & 2: Only refresh if data changed AND user isn't clicking
    if (!isInteracting && oldStr !== latestStr) {
      
      // 🟢 Keep selection synced with new inventory data
      selected = selected.filter(id => {
        const b = newData.find(x => Number(x.id) === Number(id));
        return b && b.status === "available";
      });
      localStorage.setItem("selectedBooks", JSON.stringify(selected));

      booksData = newData;

      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: newData,
        time: Date.now()
      }));

      renderBooks(newData);
      console.log("🔄 Inventory & Selection synced");
    }

  } catch (err) {
    console.log("Refresh failed:", err.message);
  }
}

function renderBooks(books) {
  const container = document.getElementById("books");
  container.innerHTML = "";
  
  books.forEach(b => {
    const card = document.createElement("div");
    const mrp = b.price * 4; 

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
    const b = booksData.find(x => Number(x.id) === Number(id));
    if (b) rawTotal += Number(b.price);
  });

  total = rawTotal;
  const availableCount = booksData.filter(b => b.status === "available").length;
  const isBundle = selected.length === availableCount && availableCount > 0;

  if (isBundle) total -= 100; 

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
  window.location.href = "details.html";
}

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

loadBooks();

// 🟢 Auto refresh every 10 sec
setInterval(() => {
  refreshBooks();
}, 10000);