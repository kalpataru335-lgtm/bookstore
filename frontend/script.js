// ===== STATE =====
let selected = JSON.parse(localStorage.getItem("selectedBooks")) || [];
let booksData = [];
let bundleApplied = localStorage.getItem("bundleApplied") === "true";

// ===== LOAD BOOKS =====
async function loadBooks(){

  try{
    const res = await fetch("http://127.0.0.1:3000/books");

    if(!res.ok) throw new Error("Server error");

    const data = await res.json();
    booksData = data;

    // ===== REMOVE UNAVAILABLE ITEMS FROM SELECTION =====
    selected = selected.filter(id=>{
      const b = data.find(x=>x.id === id);
      return b && b.status === "available";
    });

    localStorage.setItem("selectedBooks", JSON.stringify(selected));

    renderBooks(data);

  }catch(err){
    console.log(err);
    document.getElementById("books").innerHTML = "❌ Cannot load books";
  }
}

// ===== RENDER =====
function renderBooks(books){

  const container = document.getElementById("books");
  container.innerHTML = "";

  books.forEach(b=>{

    const card = document.createElement("div");
    card.className = "card";

    // ===== HIGHLIGHT =====
    let highlight = "";
    if(b.name.toLowerCase().includes("lilamrit")){
      highlight = `<div class="highlight">7 Vol Set • Sealed (Vol 1 open)</div>`;
    }

    const mrp = b.price * 4;

    // ===== LOCKED / SOLD =====
    if(b.status !== "available"){

      card.classList.add("locked");

      card.innerHTML = `
        ${highlight}
        <b>${b.name}</b>
        <div class="strike">₹${mrp}</div>
        <div>₹${b.price}</div>
        <small>${b.status.toUpperCase()}</small>
      `;
    }

    // ===== AVAILABLE =====
    else{

      card.innerHTML = `
        ${highlight}
        <b>${b.name}</b>
        <div class="strike">₹${mrp}</div>
        <div class="price">₹${b.price}</div>
      `;

      if(selected.includes(b.id)){
        card.classList.add("selected");
      }

      card.onclick = ()=>toggleSelection(b.id);
    }

    container.appendChild(card);
  });

  updateTotal();
}

// ===== TOGGLE =====
function toggleSelection(id){

  if(selected.includes(id)){
    selected = selected.filter(x=>x!==id);
  }else{
    selected.push(id);
  }

  // 🔥 RESET BUNDLE ON ANY MANUAL CHANGE
  bundleApplied = false;
  localStorage.setItem("bundleApplied","false");

  localStorage.setItem("selectedBooks", JSON.stringify(selected));
  renderBooks(booksData);
}

// ===== TOTAL =====
function updateTotal(){

  let rawTotal = 0;
  let total = 0;

  selected.forEach(id=>{
    const b = booksData.find(x=>x.id === id);
    if(b) rawTotal += b.price;
  });

  total = rawTotal;

  const availableCount = booksData.filter(b => b.status === "available").length;

  if(bundleApplied && selected.length === availableCount && availableCount > 0){
    total -= 100;
  }

  document.getElementById("total").innerText = total;

  const msg = document.getElementById("msg");

  if(rawTotal <= 0){
    msg.innerText = "Minimum ₹160 required";
  }
  else if(rawTotal < 160){
    msg.innerText = `Add ₹${160 - rawTotal} more to order`;
  }
  else{
    msg.innerText = "Ready to proceed";
  }
}

// ===== CONTINUE =====
function goNext(){

  let rawTotal = 0;

  selected.forEach(id=>{
    const b = booksData.find(x=>x.id === id);
    if(b) rawTotal += b.price;
  });

  if(rawTotal < 160){
    alert("Minimum ₹160 required");
    return;
  }

  window.location.href = "details.html";
}

// ===== AUTO REFRESH (IMPORTANT FIX) =====
setInterval(()=>{
  loadBooks();
}, 10000); // 10 sec refresh

// ===== INIT =====
loadBooks();