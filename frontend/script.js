// ===== STATE =====
let selected = JSON.parse(localStorage.getItem("selectedBooks")) || [];
let booksData = [];
let bundleApplied = localStorage.getItem("bundleApplied") === "true";

// 🔥 FORCE CLEAN STATE ON LOAD
bundleApplied = false;
localStorage.setItem("bundleApplied", "false");

// ===== LOAD BOOKS =====
async function loadBooks() {
  // FEEDBACK FOR RENDER SLEEP (UX)
  const container = document.getElementById("books");
  if (container.innerHTML === "") {
    container.innerHTML = "<div style='text-align:center; padding:20px;'>⏳ Loading fresh inventory...</div>";
  }

  try {
    // 🔥 DISABLE CACHE TO ENSURE REAL-TIME STATUS
    const res = await fetch("https://bookstore-backend-971c.onrender.com/books", {
      cache: "no-store"
    });

    if (!res.ok) throw new Error("Server error");

    const data = await res.json();
    booksData = data;
    
    console.log("REFRESHED DATA", new Date().toLocaleTimeString());

    // ===== REMOVE UNAVAILABLE ITEMS FROM SELECTION =====
    selected = selected.filter(id => {
      const b = data.find(x => x.id === id);
      return b && b.status === "available";
    });

    localStorage.setItem("selectedBooks", JSON.stringify(selected));

    // FORCE CLEAN RE-RENDER
    container.innerHTML = "";
    renderBooks(data);

  } catch (err) {
    console.log(err);
    container.innerHTML = 
      "<div style='text-align:center; padding:20px;'>❌ Failed to load. <button onclick='loadBooks()'>Retry</button></div>";
  }
}

// ===== RENDER =====
function renderBooks(books) {
  const container = document.getElementById("books");
  container.innerHTML = "";

  books.forEach(b => {
    const card = document.createElement("div");
    card.className = "card";

    // ===== HIGHLIGHT SPECIAL ITEMS =====
    let highlight = "";
    if (b.name.toLowerCase().includes("lilamrit")) {
      highlight = `<div class="highlight">7 Vol Set • Sealed (Vol 1 open)</div>`;
    }

    const mrp = b.price * 4;

    // ===== LOCKED / SOLD STATUS =====
    if (b.status !== "available") {
      card.classList.add("locked");
      card.innerHTML = `
        ${highlight}
        <b>${b.name}</b>
        <div class="strike">₹${mrp}</div>
        <div>₹${b.price}</div>
        <small style="color:#ef4444; font-weight:bold; display:block; margin-top:5px;">
          ${b.status.toUpperCase()}
        </small>
      `;
    }
    // ===== AVAILABLE STATUS =====
    else {
      card.innerHTML = `
        ${highlight}
        <b>${b.name}</b>
        <div class="strike">₹${mrp}</div>
        <div class="price">₹${b.price}</div>
      `;

      if (selected.includes(b.id)) {
        card.classList.add("selected");
      }
      card.onclick = () => toggleSelection(b.id);
    }
    container.appendChild(card);
  });
  updateTotal();
}

// ===== TOGGLE SELECTION =====
function toggleSelection(id) {
  if (selected.includes(id)) {
    selected = selected.filter(x => x !== id);
  } else {
    selected.push(id);
  }

  // RESET BUNDLE ON MANUAL CHANGE
  bundleApplied = false;
  localStorage.setItem("bundleApplied", "false");

  localStorage.setItem("selectedBooks", JSON.stringify(selected));
  renderBooks(booksData);
}

// ===== UPDATE UI TOTALS =====
function updateTotal() {
  let rawTotal = 0;
  let total = 0;

  selected.forEach(id => {
    const b = booksData.find(x => x.id === id);
    if (b) rawTotal += b.price;
  });

  total = rawTotal;
  const availableCount = booksData.filter(b => b.status === "available").length;
  
  // BUNDLE CALCULATION
  const isBundle = selected.length === availableCount && availableCount > 0;

  if (isBundle) {
    total -= 100;
  }

  bundleApplied = isBundle;
  localStorage.setItem("bundleApplied", isBundle ? "true" : "false");

  document.getElementById("total").innerText = total;
  const msg = document.getElementById("msg");

  if (rawTotal <= 0) {
    msg.innerText = "Minimum ₹160 required";
  }
  else if (rawTotal < 160) {
    msg.innerText = `Add ₹${160 - rawTotal} more to order`;
  }
  else {
    msg.innerText = "Ready to proceed";
  }
}

// ===== NAVIGATION =====
function goNext() {
  let rawTotal = 0;
  selected.forEach(id => {
    const b = booksData.find(x => x.id === id);
    if (b) rawTotal += b.price;
  });

  if (rawTotal < 160) {
    alert("Minimum ₹160 required");
    return;
  }
  window.location.href = "details.html";
}

// ===== REAL-TIME SYNC (5 SECONDS) =====
setInterval(async () => {
  await loadBooks();
}, 5000);

// INITIAL LOAD
loadBooks();