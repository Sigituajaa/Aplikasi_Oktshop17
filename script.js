// --- CONFIG FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyBIEWYrwHKFaDMDM6hs-1iE_OxPCmjtoFA",
  authDomain: "toko-online-oktshop17.firebaseapp.com",
  projectId: "toko-online-oktshop17",
  storageBucket: "toko-online-oktshop17.appspot.com",
  messagingSenderId: "191593492765",
  appId: "1:191593492765:web:673089bd829250865ff1f4"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(), db = firebase.firestore(), storage = firebase.storage();

let cartItemsData = [], currentTotal = 0, modeAuth = 'login';

// --- SISTEM VIEW ---
function showView(viewId, el) {
  document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active-view'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + viewId).classList.add('active-view');
  if(el) el.classList.add('active');
}

// --- AUTHENTICATION ---
function openAuth(mode) {
  modeAuth = mode;
  document.getElementById("modalAuth").style.display = "flex";
  document.getElementById("authTitle").innerText = mode === 'login' ? 'Masuk' : 'Daftar Member';
  document.getElementById("authNama").style.display = mode === 'daftar' ? 'block' : 'none';
}
function closeAuth() { document.getElementById("modalAuth").style.display = "none"; }
function toggleAuthMode() { modeAuth = (modeAuth === 'login') ? 'daftar' : 'login'; openAuth(modeAuth); }

async function submitAuth() {
  const email = document.getElementById("authEmail").value, pass = document.getElementById("authPass").value, nama = document.getElementById("authNama").value;
  if(!email || !pass) return alert("Isi email & password!");
  showLoader(true);
  try {
    if(modeAuth === 'daftar') {
      const res = await auth.createUserWithEmailAndPassword(email, pass);
      await db.collection("users").doc(res.user.uid).set({ nama, role: "pembeli", hp: "", alamat: "", createdAt: new Date() });
    } else { await auth.signInWithEmailAndPassword(email, pass); }
    closeAuth();
  } catch (err) { alert(err.message); }
  showLoader(false);
}

auth.onAuthStateChanged(user => {
  if(user) {
    document.getElementById("login-to-checkout").style.display = "none";
    document.getElementById("checkout-form").style.display = "block";
    db.collection("users").doc(user.uid).onSnapshot(doc => {
      const d = doc.data();
      if(!d) return;
      document.getElementById("user-status").innerText = "Hi, " + d.nama;
      document.getElementById("profNama").value = d.nama || "";
      document.getElementById("profHp").value = d.hp || "";
      document.getElementById("profAlamat").value = d.alamat || "";
      if(d.role === 'admin') document.getElementById("admin-panel").style.display = "block";
    });
    loadCart(user.uid);
    loadUserOrders(user.uid);
  } else {
    document.getElementById("user-status").innerText = "Login / Daftar";
    document.getElementById("login-to-checkout").style.display = "block";
    document.getElementById("checkout-form").style.display = "none";
  }
});

// --- PROFILE ---
async function updateProfile() {
    const user = auth.currentUser;
    const nama = document.getElementById("profNama").value;
    const hp = document.getElementById("profHp").value;
    const alamat = document.getElementById("profAlamat").value;
    showLoader(true);
    await db.collection("users").doc(user.uid).update({ nama, hp, alamat });
    alert("Profil diperbarui!");
    showLoader(false);
}

// --- CATALOG & CART ---
function loadKatalog() {
  db.collection("produk").orderBy("createdAt", "desc").onSnapshot(snap => {
    const list = document.getElementById("listProduk"); list.innerHTML = "";
    snap.forEach(doc => {
      const p = doc.data();
      list.innerHTML += `<div class="card">
        <img src="${p.gambar || 'https://via.placeholder.com/150'}">
        <div class="card-info">
            <div class="card-title">${p.nama}</div>
            <div class="card-price">Rp${p.harga.toLocaleString()}</div>
            <button class="btn-buy" onclick="addToCart('${doc.id}', '${p.nama}', ${p.harga})">Tambah 🛒</button>
        </div>
      </div>`;
    });
  });
}

async function addToCart(id, n, h) {
  if(!auth.currentUser) return openAuth('login');
  await db.collection("cart").doc(auth.currentUser.uid).collection("items").add({ productId: id, nama: n, harga: h });
  alert("Masuk keranjang!");
}

function loadCart(uid) {
  db.collection("cart").doc(uid).collection("items").onSnapshot(snap => {
    const list = document.getElementById("cartItems");
    currentTotal = 0; cartItemsData = [];
    list.innerHTML = snap.empty ? "Kosong" : "";
    snap.forEach(doc => {
      const item = doc.data(); currentTotal += item.harga; cartItemsData.push(item);
      list.innerHTML += `<div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:5px;">
        <span>${item.nama}</span><b>Rp${item.harga.toLocaleString()}</b>
      </div>`;
    });
    document.getElementById("cartTotal").innerText = "Total: Rp" + currentTotal.toLocaleString();
  });
}

// --- CHECKOUT & AUTO-CANCEL LOGIC ---
function toggleBuktiTransfer() {
    const pay = document.getElementById("payMethod").value;
    document.getElementById("boxBuktiTransfer").style.display = (pay === 'Transfer Bank') ? 'block' : 'none';
}

async function processCheckout() {
    const user = auth.currentUser;
    const file = document.getElementById("buktiFile").files[0];
    const pay = document.getElementById("payMethod").value;
    const ship = document.getElementById("shipMethod").value;
    
    // Ambil data profil terbaru untuk dikunci di pesanan
    const userDoc = await db.collection("users").doc(user.uid).get();
    const uData = userDoc.data();

    if(!uData.hp || !uData.alamat) return alert("Lengkapi No.HP dan Alamat di menu Profil dulu!");
    if(cartItemsData.length === 0) return alert("Keranjang kosong!");
    if(pay === 'Transfer Bank' && !file) return alert("Wajib upload bukti transfer untuk metode Bank!");

    showLoader(true);
    try {
        let buktiUrl = "";
        if(file) {
            const ref = storage.ref(`bukti/${user.uid}_${Date.now()}`);
            await ref.put(file);
            buktiUrl = await ref.getDownloadURL();
        }

        const orderID = "OKT" + Date.now().toString().slice(-6);
        await db.collection("orders").add({
            orderID, uid: user.uid, items: cartItemsData, total: currentTotal,
            penerima: uData.nama, alamat: uData.alamat, hp: uData.hp,
            metodeBayar: pay, metodeKirim: ship, status: "proses", resi: "",
            buktiTransfer: buktiUrl, createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Hapus Keranjang
        const items = await db.collection("cart").doc(user.uid).collection("items").get();
        items.forEach(d => d.ref.delete());

        alert("Pesanan Berhasil Dibuat!");
        showView('profile', document.querySelectorAll('.nav-item')[2]);
    } catch (e) { alert(e.message); }
    showLoader(false);
}

// --- LOAD ORDERS & EXPIRY CHECK ---
function loadUserOrders(uid) {
    db.collection("orders").where("uid", "==", uid).orderBy("createdAt", "desc").onSnapshot(snap => {
        const list = document.getElementById("userOrders");
        list.innerHTML = snap.empty ? "Belum ada pesanan." : "";
        
        snap.forEach(async (doc) => {
            const o = doc.data();
            if(!o.createdAt) return;

            // --- FITUR AUTO CANCEL (60 MENIT) ---
            const now = new Date();
            const orderTime = o.createdAt.toDate();
            const diffMinutes = Math.floor((now - orderTime) / 1000 / 60);

            let displayStatus = o.status;
            if(o.metodeBayar === 'Transfer Bank' && !o.buktiTransfer && diffMinutes >= 60 && o.status !== 'gagal') {
                await db.collection("orders").doc(doc.id).update({ status: 'gagal' });
                displayStatus = 'gagal';
            }

            const s = displayStatus;
            const tgl = orderTime.toLocaleDateString('id-ID');
            const jam = orderTime.toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'});

            let content = `
                <div class="order-card">
                    <div class="order-meta">
                        <b>ID: #${o.orderID}</b> | ${tgl} ${jam}
                    </div>
                    <div style="font-size:12px;">Resi: <b style="color:var(--blue)">${o.resi || 'Menunggu...'}</b></div>
            `;

            if(s === 'gagal') {
                content += `<div class="order-fail">PESANAN GAGAL (Batas waktu bayar habis)</div>`;
            } else {
                content += `
                    <div class="status-steps">
                        <div class="step-box ${s==='proses'||s==='kirim'||s==='selesai'?'active':''}">Proses</div>
                        <div class="step-box kirim ${s==='kirim'||s==='selesai'?'active':''}">Kirim</div>
                        <div class="step-box selesai ${s==='selesai'?'active':''}">Selesai</div>
                    </div>
                    ${s === 'kirim' ? `<button class="btn-outline" onclick="confirmOrder('${doc.id}')">Klik Jika Sudah Sampai</button>` : ''}
                `;
            }
            content += `</div>`;
            list.innerHTML += content;
        });
    });
}

// --- HELPERS ---
async function confirmOrder(id) { await db.collection("orders").doc(id).update({ status: 'selesai' }); }
function showLoader(show) { document.getElementById("loader").style.display = show ? "flex" : "none"; }
function logout() { auth.signOut().then(() => location.reload()); }
function toggleMenu(id) { document.getElementById(id).classList.toggle('active'); }

// --- INIT ---
loadKatalog();
// Banner Dummy logic
const banner = document.getElementById("bannerSlider");
if(banner) banner.innerHTML = `<div class="banner-slide"><img src="https://via.placeholder.com/600x200/ee4d2d/ffffff?text=DISKON+RESELLER+OKTSHOP17"></div>`;
