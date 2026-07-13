// ==========================================
// CORE LOGIC: POS & REAL-TIME INVENTORY
// ==========================================

const PHP_API_BASE = 'http://localhost/kewirausahaan kasir/backend/api';
let socket;

// State Aplikasi
const state = {
    products: [],    // Hanya menu/produk jual
    gudang: [],      // Hanya bahan baku gudang
    cart: [],
    transactions: [],
    activeSection: 'dashboard-section'
};

// Inisialisasi Chart.js
let salesChart = null;

// State Ekspor Excel
let exportState = {
    title: '',
    headers: [],
    rows: [],
    filename: ''
};

// DOM Elements
const sections = document.querySelectorAll('.app-section');
const navBtns = document.querySelectorAll('.nav-btn');
const pageTitle = document.getElementById('page-title');
const pageSubtitle = document.getElementById('page-subtitle');
const wsStatusDot = document.querySelector('#ws-status .status-dot');
const wsStatusText = document.querySelector('#ws-status .status-text');

// Jalankan ketika DOM siap
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupNavigation();
    setupRealtime();
    setupPOSCart();
    setupInventory();
    setupGudang();
    setupHistory();
    setupDetailedReports();
    setupExportPreviewModal();
});

// 1. INISIALISASI APLIKASI
function initApp() {
    loadDashboardData();
    loadProducts();
    
    // Shortcut keyboard global
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F8') {
            e.preventDefault();
            // Trigger checkout jika berada di POS
            if (state.activeSection === 'pos-section') {
                const checkoutBtn = document.getElementById('checkout-btn');
                if (!checkoutBtn.disabled) checkoutBtn.click();
            }
        }
    });
}

// 2. NAVIGASI SPA
function setupNavigation() {
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            switchSection(target);
            
            // Set menu active class
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

function switchSection(sectionId) {
    state.activeSection = sectionId;
    sections.forEach(sec => {
        sec.classList.remove('active');
        if (sec.id === sectionId) sec.classList.add('active');
    });

    // Update Header Text
    if (sectionId === 'dashboard-section') {
        pageTitle.innerText = "Dashboard Analisis";
        pageSubtitle.innerText = "Pantau perkembangan penjualan dan stok barang real-time";
        loadDashboardData();
    } else if (sectionId === 'pos-section') {
        pageTitle.innerText = "Kasir Terminal (POS)";
        pageSubtitle.innerText = "Transaksi penjualan barang cepat dengan hitungan otomatis";
        renderPOSProducts();
    } else if (sectionId === 'inventory-section') {
        pageTitle.innerText = "Menu & Produk Jual";
        pageSubtitle.innerText = "Kelola daftar menu, harga modal (HPP), harga jual, dan stok produk";
        loadMenuProducts().then(() => renderInventoryTable());
    } else if (sectionId === 'gudang-section') {
        pageTitle.innerText = "Gudang Bahan Baku";
        pageSubtitle.innerText = "Kelola persediaan bahan baku, kemasan, dan kebutuhan operasional kafe";
        loadGudangData().then(() => renderGudangTable());
    } else if (sectionId === 'history-section') {
        pageTitle.innerText = "Riwayat Transaksi";
        pageSubtitle.innerText = "Histori transaksi penjualan dan cetak ulang struk belanja";
        loadHistoryData();
    } else if (sectionId === 'reports-detailed-section') {
        pageTitle.innerText = "Laporan Keuangan Periodik";
        pageSubtitle.innerText = "Lihat rincian laba rugi, omset penjualan harian dan bulanan secara terperinci";
        initDetailedReports();
    }
}

// 3. FITUR REAL-TIME (SOCKET.IO)
function setupRealtime() {
    try {
        // Hubungkan ke server Node.js pada port yang sama (karena disajikan dari port 3000)
        socket = io();

        socket.on('connect', () => {
            wsStatusDot.className = 'status-dot online';
            wsStatusText.innerText = 'Real-time Terhubung';
            showToast('Koneksi real-time berhasil tersambung!', 'success');
        });

        socket.on('disconnect', () => {
            wsStatusDot.className = 'status-dot offline';
            wsStatusText.innerText = 'Terputus';
            showToast('Koneksi real-time terputus. Mode offline aktif.', 'warning');
        });

        // Event handler: Stok berkurang akibat transaksi klien lain
        socket.on('stock_updated', (data) => {
            console.log("WebSocket stok update diterima: ", data);
            
            // Update stok lokal di state
            data.stock_updates.forEach(update => {
                const product = state.products.find(p => p.id === update.product_id);
                if (product) {
                    product.stock = update.new_stock;
                    // Cek jika masuk batas kritis
                    product.is_low_stock = (product.stock <= product.min_stock) ? 1 : 0;
                    
                    if (product.is_low_stock === 1) {
                        showToast(`Stok produk '${product.name}' menipis! Sisa stok: ${product.stock}`, 'warning');
                    }
                }
            });

            // Re-render UI yang terpengaruh
            if (state.activeSection === 'pos-section') {
                renderPOSProducts();
                updateCartValidation();
            } else if (state.activeSection === 'inventory-section') {
                renderInventoryTable();
            } else if (state.activeSection === 'dashboard-section') {
                loadDashboardData();
            }
        });

        // Event handler: Barang ditambah/diedit/dihapus oleh klien lain
        socket.on('inventory_updated', (data) => {
            console.log("WebSocket inventori berubah: ", data);
            loadProducts().then(() => {
                if (state.activeSection === 'pos-section') {
                    renderPOSProducts();
                } else if (state.activeSection === 'inventory-section') {
                    renderInventoryTable();
                } else if (state.activeSection === 'dashboard-section') {
                    loadDashboardData();
                }
            });
            showToast(`Inventori diperbarui oleh admin: ${data.name} (${data.action})`, 'info');
        });

    } catch (err) {
        console.error("Gagal menginisialisasi Socket.io: ", err);
        wsStatusDot.className = 'status-dot offline';
        wsStatusText.innerText = 'Socket Error';
    }
}

// 4. KASIR POS LOGIC
function setupPOSCart() {
    const searchInput = document.getElementById('pos-search');
    const filterBtns = document.querySelectorAll('#pos-category-filters .filter-btn');
    const cartItemsList = document.getElementById('cart-items-list');
    const clearCartBtn = document.getElementById('clear-cart-btn');
    const cartDiscount = document.getElementById('cart-discount');
    const cartTaxToggle = document.getElementById('cart-tax-toggle');
    const cartPaid = document.getElementById('cart-paid');
    const checkoutBtn = document.getElementById('checkout-btn');
    const closeReceiptBtn = document.getElementById('close-receipt-btn');
    const printReceiptBtn = document.getElementById('print-receipt-btn');

    // Pencarian produk kasir
    searchInput.addEventListener('input', () => {
        renderPOSProducts(searchInput.value);
    });

    // Filter kategori kasir
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderPOSProducts(searchInput.value, btn.getAttribute('data-category'));
        });
    });

    // Bersihkan keranjang
    clearCartBtn.addEventListener('click', () => {
        state.cart = [];
        updateCartUI();
    });

    // Input diskon
    cartDiscount.addEventListener('input', () => {
        if (parseFloat(cartDiscount.value) < 0) cartDiscount.value = 0;
        calculateCart();
    });

    // Toggle Pajak PPN
    cartTaxToggle.addEventListener('change', () => {
        calculateCart();
    });

    // Input Jumlah Bayar
    cartPaid.addEventListener('input', () => {
        calculateCart();
    });

    // Quick cash buttons
    document.querySelectorAll('.quick-cash-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = parseFloat(btn.getAttribute('data-value'));
            const total = calculateCart().total;
            if (val === 0) {
                cartPaid.value = total;
            } else {
                cartPaid.value = (parseFloat(cartPaid.value || 0) + val);
            }
            calculateCart();
        });
    });

    // Checkout button click
    checkoutBtn.addEventListener('click', handleCheckout);

    // Close Receipt Modal
    closeReceiptBtn.addEventListener('click', () => {
        document.getElementById('receipt-modal').classList.remove('active');
    });

    // Print Receipt
    printReceiptBtn.addEventListener('click', () => {
        window.print();
    });
}

// Muat semua produk (menu+gudang) — untuk dashboard stats, dll.
function loadProducts() {
    return fetch(`${PHP_API_BASE}/products.php`)
        .then(res => res.json())
        .then(data => {
            state.products = data.filter(p => p.category === 'menu');
            state.gudang    = data.filter(p => p.category === 'gudang');
            return data;
        })
        .catch(err => {
            showToast('Gagal memuat produk dari server PHP API', 'error');
            console.error(err);
        });
}

// Muat hanya produk kategori menu
function loadMenuProducts() {
    return fetch(`${PHP_API_BASE}/products.php?category=menu`)
        .then(res => res.json())
        .then(data => {
            state.products = data;
            return data;
        })
        .catch(err => { console.error(err); });
}

// Muat hanya data gudang
function loadGudangData() {
    return fetch(`${PHP_API_BASE}/products.php?category=gudang`)
        .then(res => res.json())
        .then(data => {
            state.gudang = data;
            return data;
        })
        .catch(err => { console.error(err); });
}

function renderPOSProducts(searchQuery = '', filterType = 'all') {
    const grid = document.getElementById('pos-products-grid');
    grid.innerHTML = '';

    const query = searchQuery.toLowerCase();
    
    // Hanya tampilkan produk menu (bukan gudang) di kasir POS
    const menuProducts = state.products.filter(p => p.category !== 'gudang');
    
    const filtered = menuProducts.filter(prod => {
        const matchSearch = prod.name.toLowerCase().includes(query) || prod.code.toLowerCase().includes(query);
        if (!matchSearch) return false;
        if (filterType === 'stock') return prod.stock > 0;
        if (filterType === 'low')   return prod.stock <= prod.min_stock;
        return true;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;">Produk tidak ditemukan.</div>`;
        return;
    }

    filtered.forEach(prod => {
        const isLow = prod.stock <= prod.min_stock;
        const isOut = prod.stock <= 0;
        
        const card = document.createElement('div');
        card.className = `prod-card ${isOut ? 'out-of-stock' : ''}`;
        card.innerHTML = `
            <div>
                <div class="prod-card-code">${prod.code}</div>
                <div class="prod-card-name">${prod.name}</div>
            </div>
            <div class="prod-card-footer">
                <div class="prod-card-price">${formatRupiah(prod.selling_price)}</div>
                <div class="prod-card-stock ${isLow ? 'warning' : ''}">${isOut ? 'Habis' : 'Stok: ' + prod.stock}</div>
            </div>
        `;

        if (!isOut) {
            card.addEventListener('click', () => addToCart(prod));
        }
        grid.appendChild(card);
    });
}

function addToCart(product) {
    const existIndex = state.cart.findIndex(item => item.product_id === product.id);
    
    if (existIndex > -1) {
        // Cek stok limit
        if (state.cart[existIndex].quantity >= product.stock) {
            showToast(`Batas stok tercapai. Stok '${product.name}' hanya tersedia ${product.stock} pcs.`, 'error');
            return;
        }
        state.cart[existIndex].quantity++;
    } else {
        if (product.stock < 1) {
            showToast('Stok barang kosong!', 'error');
            return;
        }
        state.cart.push({
            product_id: product.id,
            code: product.code,
            name: product.name,
            cost_price: product.cost_price,
            selling_price: product.selling_price,
            quantity: 1
        });
    }

    updateCartUI();
    showToast(`Ditambahkan: ${product.name}`, 'info');
}

function updateCartUI() {
    const list = document.getElementById('cart-items-list');
    list.innerHTML = '';

    if (state.cart.length === 0) {
        list.innerHTML = `
            <div class="empty-cart-state">
                <i class="fa-solid fa-cart-plus"></i>
                <p>Keranjang kosong. Pilih barang di sebelah kiri.</p>
            </div>
        `;
        document.getElementById('checkout-btn').disabled = true;
        calculateCart();
        return;
    }

    state.cart.forEach((item, index) => {
        const subtotal = item.selling_price * item.quantity;
        
        const row = document.createElement('div');
        row.className = 'cart-item';
        row.innerHTML = `
            <div class="cart-item-row1">
                <div class="cart-item-info">
                    <h4>${item.name}</h4>
                    <span>${formatRupiah(item.selling_price)} / pcs</span>
                </div>
                <button class="cart-item-remove" onclick="removeCartItem(${index})">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="cart-item-row2">
                <div class="qty-control">
                    <button class="qty-btn" onclick="adjustQty(${index}, -1)"><i class="fa-solid fa-minus"></i></button>
                    <div class="qty-val">${item.quantity}</div>
                    <button class="qty-btn" onclick="adjustQty(${index}, 1)"><i class="fa-solid fa-plus"></i></button>
                </div>
                <div class="cart-item-price">${formatRupiah(subtotal)}</div>
            </div>
        `;
        list.appendChild(row);
    });

    document.getElementById('checkout-btn').disabled = false;
    calculateCart();
}

// Global functions for window elements
window.removeCartItem = function(index) {
    state.cart.splice(index, 1);
    updateCartUI();
};

window.adjustQty = function(index, amount) {
    const item = state.cart[index];
    const originalProduct = state.products.find(p => p.id === item.product_id);
    
    const newQty = item.quantity + amount;
    if (newQty <= 0) {
        state.cart.splice(index, 1);
    } else {
        if (originalProduct && newQty > originalProduct.stock) {
            showToast(`Stok tidak mencukupi. Stok '${item.name}' hanya sisa ${originalProduct.stock} pcs.`, 'error');
            return;
        }
        item.quantity = newQty;
    }
    updateCartUI();
};

function calculateCart() {
    let subtotal = 0;
    state.cart.forEach(item => {
        subtotal += item.selling_price * item.quantity;
    });

    const discount = parseFloat(document.getElementById('cart-discount').value) || 0;
    
    // Hitung pajak jika toggle aktif
    const taxToggle = document.getElementById('cart-tax-toggle');
    const tax = taxToggle.checked ? (subtotal - discount) * 0.11 : 0;
    
    const total = Math.max(0, subtotal - discount + tax);
    
    const paid = parseFloat(document.getElementById('cart-paid').value) || 0;
    const change = Math.max(0, paid - total);

    // Update fields
    document.getElementById('cart-subtotal').innerText = formatRupiah(subtotal);
    document.getElementById('cart-tax').innerText = formatRupiah(tax);
    document.getElementById('cart-total').innerText = formatRupiah(total);
    document.getElementById('cart-change').innerText = formatRupiah(change);

    // Validasi checkout button
    const checkoutBtn = document.getElementById('checkout-btn');
    if (state.cart.length > 0 && paid >= total) {
        checkoutBtn.disabled = false;
    } else {
        checkoutBtn.disabled = true;
    }

    return { subtotal, discount, tax, total, paid, change };
}

// Cek ulang keranjang jika ada pembaruan stok real-time
function updateCartValidation() {
    let cartChanged = false;
    
    for (let i = state.cart.length - 1; i >= 0; i--) {
        const item = state.cart[i];
        const prod = state.products.find(p => p.id === item.product_id);
        
        if (!prod || prod.stock <= 0) {
            state.cart.splice(i, 1);
            cartChanged = true;
            showToast(`Produk '${item.name}' telah habis karena dibeli di terminal lain. Keranjang disesuaikan.`, 'warning');
        } else if (item.quantity > prod.stock) {
            item.quantity = prod.stock;
            cartChanged = true;
            showToast(`Stok '${item.name}' berkurang. Jumlah di keranjang disesuaikan menjadi batas maksimal (${prod.stock} pcs).`, 'warning');
        }
    }
    
    if (cartChanged) updateCartUI();
}

function handleCheckout() {
    const calc = calculateCart();
    
    const payload = {
        cart: state.cart,
        paid_amount: calc.paid,
        discount: calc.discount,
        tax: calc.tax
    };

    fetch(`${PHP_API_BASE}/transactions.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(resData => {
        if (resData.status === 'success') {
            showToast('Transaksi berhasil!', 'success');
            
            // Tampilkan struk belanja
            showReceipt(resData.data);
            
            // Kirim broadcast real-time pembaruan stok ke WebSocket Node.js
            if (socket && socket.connected) {
                socket.emit('transaction_completed', resData.data);
            }

            // Bersihkan form & keranjang
            state.cart = [];
            document.getElementById('cart-paid').value = '';
            document.getElementById('cart-discount').value = '0';
            document.getElementById('cart-tax-toggle').checked = false;
            
            updateCartUI();
            
            // Reload data dashboard secara berkala
            loadDashboardData();
        } else {
            showToast(resData.message || 'Transaksi gagal diproses.', 'error');
        }
    })
    .catch(err => {
        showToast('Gagal memproses transaksi ke server API.', 'error');
        console.error(err);
    });
}

function showReceipt(data) {
    document.getElementById('r-invoice-no').innerText = data.invoice_no;
    document.getElementById('r-date').innerText = data.created_at;
    
    const tbody = document.getElementById('r-items-body');
    tbody.innerHTML = '';

    data.items.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td align="left">
                ${item.name}<br>
                <span class="receipt-item-detail">${item.quantity} x ${formatRupiah(item.selling_price)}</span>
            </td>
            <td align="right" style="vertical-align: bottom;">${formatRupiah(item.subtotal)}</td>
        `;
        tbody.appendChild(row);
    });

    document.getElementById('r-subtotal').innerText = formatRupiah(data.subtotal_before_discount);
    document.getElementById('r-discount').innerText = '-' + formatRupiah(data.discount);
    document.getElementById('r-tax').innerText = formatRupiah(data.tax);
    document.getElementById('r-total').innerText = formatRupiah(data.total_amount);
    document.getElementById('r-paid').innerText = formatRupiah(data.paid_amount);
    document.getElementById('r-change').innerText = formatRupiah(data.change_amount);

    // Tampilkan modal
    document.getElementById('receipt-modal').classList.add('active');
}

// 5. MANAJEMEN INVENTORI (MENU & PRODUK JUAL)
function setupInventory() {
    const openAddBtn = document.getElementById('open-add-modal-btn');
    const prodModal = document.getElementById('product-modal');
    const closeAddBtn = document.getElementById('close-product-modal');
    const cancelAddBtn = document.getElementById('cancel-product-modal');
    const prodForm = document.getElementById('product-form');
    const invSearch = document.getElementById('inventory-search');
    const catSelect = document.getElementById('prod-category');

    // Toggle tampil/sembunyikan field Harga Jual berdasar kategori
    catSelect.addEventListener('change', () => {
        const sellingWrapper = document.getElementById('prod-selling-wrapper');
        sellingWrapper.style.display = catSelect.value === 'gudang' ? 'none' : '';
    });

    // Pencarian produk inventori
    invSearch.addEventListener('input', () => {
        renderInventoryTable(invSearch.value);
    });

    // Buka modal tambah MENU
    openAddBtn.addEventListener('click', () => {
        document.getElementById('modal-title').innerText = "Tambah Menu / Produk Jual";
        prodForm.reset();
        document.getElementById('prod-id').value = '';
        document.getElementById('prod-category').value = 'menu';
        document.getElementById('prod-unit').value = 'gelas';
        document.getElementById('prod-selling-wrapper').style.display = '';
        prodModal.classList.add('active');
    });

    // Buka modal tambah GUDANG (dari tombol di halaman gudang)
    const openAddGudangBtn = document.getElementById('open-add-gudang-modal-btn');
    if (openAddGudangBtn) {
        openAddGudangBtn.addEventListener('click', () => {
            document.getElementById('modal-title').innerText = "Tambah Bahan Baku / Material Gudang";
            prodForm.reset();
            document.getElementById('prod-id').value = '';
            document.getElementById('prod-category').value = 'gudang';
            document.getElementById('prod-unit').value = 'kg';
            document.getElementById('prod-selling-wrapper').style.display = 'none';
            prodModal.classList.add('active');
        });
    }

    // Tutup modal
    const closeModal = () => prodModal.classList.remove('active');
    closeAddBtn.addEventListener('click', closeModal);
    cancelAddBtn.addEventListener('click', closeModal);

    // Submit form (Tambah / Edit)
    prodForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const id           = document.getElementById('prod-id').value;
        const code         = document.getElementById('prod-code').value.trim();
        const name         = document.getElementById('prod-name').value.trim();
        const category     = document.getElementById('prod-category').value;
        const unit         = document.getElementById('prod-unit').value.trim() || 'pcs';
        const cost_price   = parseFloat(document.getElementById('prod-cost').value) || 0;
        const selling_price = category === 'gudang' ? 0 : (parseFloat(document.getElementById('prod-selling').value) || 0);
        const stock        = parseInt(document.getElementById('prod-stock').value) || 0;
        const min_stock    = parseInt(document.getElementById('prod-min-stock').value) || 5;

        const method = id ? 'PUT' : 'POST';
        const payload = { code, name, category, unit, cost_price, selling_price, stock, min_stock };
        if (id) payload.id = parseInt(id);

        fetch(`${PHP_API_BASE}/products.php`, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                showToast(id ? 'Produk berhasil diupdate!' : 'Produk berhasil dibuat!', 'success');
                closeModal();
                
                if (socket && socket.connected) {
                    socket.emit('inventory_changed', { name, action: id ? 'edit' : 'tambah' });
                }

                // Refresh sesuai kategori yang diubah
                if (category === 'gudang') {
                    loadGudangData().then(() => renderGudangTable());
                } else {
                    loadMenuProducts().then(() => renderInventoryTable());
                }
            } else {
                showToast(data.message || 'Gagal menyimpan produk.', 'error');
            }
        })
        .catch(err => {
            showToast('Kesalahan sistem database backend API.', 'error');
            console.error(err);
        });
    });
}

function renderInventoryTable(searchQuery = '') {
    const tbody = document.getElementById('inventory-table-body');
    tbody.innerHTML = '';

    const query = searchQuery.toLowerCase();
    // Hanya tampilkan produk kategori menu
    const filtered = state.products.filter(prod =>
        (prod.category === 'menu' || !prod.category) &&
        (prod.name.toLowerCase().includes(query) || prod.code.toLowerCase().includes(query))
    );

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted);">Tidak ada menu/produk ditemukan.</td></tr>`;
        return;
    }

    filtered.forEach(prod => {
        const margin    = prod.selling_price - prod.cost_price;
        const marginPct = prod.cost_price > 0 ? ((margin / prod.cost_price) * 100).toFixed(0) : 0;
        const unit      = prod.unit || 'pcs';

        let statusBadge = `<span class="badge badge-success">Aman</span>`;
        if (prod.stock <= 0) {
            statusBadge = `<span class="badge badge-danger">Habis</span>`;
        } else if (prod.stock <= prod.min_stock) {
            statusBadge = `<span class="badge badge-warning">Kritis</span>`;
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${prod.code}</strong></td>
            <td>${prod.name}</td>
            <td><span style="font-size:11px;background:rgba(99,102,241,0.15);color:#818cf8;padding:2px 7px;border-radius:4px;">${unit}</span></td>
            <td>${formatRupiah(prod.cost_price)}</td>
            <td>${formatRupiah(prod.selling_price)}</td>
            <td>
                <span class="text-green">${formatRupiah(margin)}</span>
                <span style="font-size: 10px; color: var(--text-muted); display:block">${marginPct}%</span>
            </td>
            <td><strong>${prod.stock}</strong></td>
            <td>${prod.min_stock}</td>
            <td>${statusBadge}</td>
            <td style="text-align: center;">
                <div class="table-actions">
                    <button class="action-btn action-btn-edit" onclick="editProduct(${prod.id})" title="Edit"><i class="fa-solid fa-pencil"></i></button>
                    <button class="action-btn action-btn-delete" onclick="deleteProduct(${prod.id}, '${prod.name.replace(/'/g, "\\'")}')"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 5b. MANAJEMEN GUDANG (BAHAN BAKU)
function setupGudang() {
    const gudangSearch = document.getElementById('gudang-search');
    gudangSearch.addEventListener('input', () => renderGudangTable(gudangSearch.value));

    // Ekspor laporan gudang ke PDF
    document.getElementById('gudang-export-btn').addEventListener('click', () => {
        const data = state.gudang;
        if (!data || data.length === 0) {
            showToast('Tidak ada data gudang untuk diekspor.', 'warning');
            return;
        }
        const headers = ["Kode Gudang", "Nama Bahan", "Satuan", "Harga Modal (Rp)", "Stok", "Min. Stok", "Nilai Total (Rp)", "Status"];
        const rows = data.map(p => [
            p.code,
            p.name,
            p.unit || '-',
            parseFloat(p.cost_price),
            p.stock,
            p.min_stock,
            parseFloat(p.cost_price) * parseInt(p.stock),
            parseInt(p.stock) <= 0 ? 'HABIS' : (parseInt(p.stock) <= parseInt(p.min_stock) ? 'KRITIS' : 'Aman')
        ]);
        openExportPreview('Laporan Stok Gudang', new Date().toLocaleDateString('id-ID'), null, headers, rows, `Laporan_Gudang_${new Date().toISOString().slice(0,10)}.pdf`);
    });
}

function renderGudangTable(searchQuery = '') {
    const tbody = document.getElementById('gudang-table-body');
    tbody.innerHTML = '';

    const query = searchQuery.toLowerCase();
    const filtered = state.gudang.filter(p =>
        p.name.toLowerCase().includes(query) || p.code.toLowerCase().includes(query)
    );

    // Update KPI stats
    const totalItems = state.gudang.length;
    const lowItems   = state.gudang.filter(p => parseInt(p.stock) <= parseInt(p.min_stock)).length;
    const okItems    = totalItems - lowItems;
    const totalValue = state.gudang.reduce((sum, p) => sum + (parseFloat(p.cost_price) * parseInt(p.stock)), 0);

    const elTotal = document.getElementById('gudang-total-items');
    const elLow   = document.getElementById('gudang-low-items');
    const elOk    = document.getElementById('gudang-ok-items');
    const elVal   = document.getElementById('gudang-total-value');
    if (elTotal) elTotal.innerText = totalItems;
    if (elLow)   elLow.innerText   = lowItems;
    if (elOk)    elOk.innerText    = okItems;
    if (elVal)   elVal.innerText   = formatRupiah(totalValue);

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);">Tidak ada bahan di gudang.</td></tr>`;
        return;
    }

    filtered.forEach(p => {
        const totalItemVal = parseFloat(p.cost_price) * parseInt(p.stock);
        const unit = p.unit || '-';

        let statusBadge = `<span class="badge badge-success">Aman</span>`;
        if (parseInt(p.stock) <= 0) {
            statusBadge = `<span class="badge badge-danger">Habis</span>`;
        } else if (parseInt(p.stock) <= parseInt(p.min_stock)) {
            statusBadge = `<span class="badge badge-warning">Kritis</span>`;
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${p.code}</strong></td>
            <td>${p.name}</td>
            <td><span style="font-size:11px;background:rgba(245,158,11,0.15);color:#f59e0b;padding:2px 7px;border-radius:4px;">${unit}</span></td>
            <td>${formatRupiah(p.cost_price)}</td>
            <td><strong>${p.stock}</strong> ${unit}</td>
            <td>${p.min_stock} ${unit}</td>
            <td>${formatRupiah(totalItemVal)}</td>
            <td>${statusBadge}</td>
            <td style="text-align:center;">
                <div class="table-actions">
                    <button class="action-btn action-btn-edit" onclick="editProduct(${p.id})" title="Edit"><i class="fa-solid fa-pencil"></i></button>
                    <button class="action-btn action-btn-delete" onclick="deleteProduct(${p.id}, '${p.name.replace(/'/g, "\\'")}')"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

window.editProduct = function(id) {
    // Cari di state menu atau gudang
    const prod = [...state.products, ...state.gudang].find(p => p.id === id);
    if (!prod) return;

    const catSelect     = document.getElementById('prod-category');
    const sellingWrapper = document.getElementById('prod-selling-wrapper');

    document.getElementById('modal-title').innerText = prod.category === 'gudang' ? "Edit Bahan Baku Gudang" : "Edit Menu / Produk Jual";
    document.getElementById('prod-id').value           = prod.id;
    document.getElementById('prod-code').value         = prod.code;
    document.getElementById('prod-name').value         = prod.name;
    catSelect.value                                     = prod.category || 'menu';
    document.getElementById('prod-unit').value         = prod.unit || 'pcs';
    document.getElementById('prod-cost').value         = prod.cost_price;
    document.getElementById('prod-selling').value      = prod.selling_price;
    document.getElementById('prod-stock').value        = prod.stock;
    document.getElementById('prod-min-stock').value    = prod.min_stock;

    sellingWrapper.style.display = prod.category === 'gudang' ? 'none' : '';

    document.getElementById('product-modal').classList.add('active');
};

window.deleteProduct = function(id, name) {
    if (confirm(`Apakah Anda yakin ingin menghapus '${name}'?\n\nCatatan: Barang tidak dapat dihapus jika sudah digunakan dalam histori transaksi belanja.`)) {
        fetch(`${PHP_API_BASE}/products.php?id=${id}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                showToast('Berhasil dihapus!', 'success');
                if (socket && socket.connected) {
                    socket.emit('inventory_changed', { name, action: 'hapus' });
                }
                // Tentukan dari mana produk ini berasal
                const isGudang = state.gudang.some(p => p.id === id);
                if (isGudang) {
                    loadGudangData().then(() => renderGudangTable());
                } else {
                    loadMenuProducts().then(() => renderInventoryTable());
                }
            } else {
                showToast(data.message || 'Gagal menghapus.', 'error');
            }
        })
        .catch(err => {
            showToast('Kesalahan server saat memproses hapus.', 'error');
            console.error(err);
        });
    }
};

// 6. DASHBOARD METRICS & ANALYTICS CHARTS
function loadDashboardData() {
    fetch(`${PHP_API_BASE}/reports.php`)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                const s = data.summary;
                
                // Update KPI Cards
                document.getElementById('val-revenue').innerText = formatRupiah(s.net_revenue);
                document.getElementById('val-profit').innerText = formatRupiah(s.net_profit);
                document.getElementById('val-transactions').innerText = s.total_transactions;
                document.getElementById('val-lowstock').innerText = s.low_stock_count;

                // Color code KPI cards warning
                const lowStockCard = document.getElementById('kpi-lowstock');
                if (s.low_stock_count > 0) {
                    lowStockCard.classList.add('glass-warning'); // Cth penanda khusus visual
                } else {
                    lowStockCard.classList.remove('glass-warning');
                }

                // Render Grafik Tren
                renderSalesTrendChart(data.chart);

                // Render Low Stock alerts panel
                renderLowStockPanel(data.low_stock_details);

                // Render Top products leaderboard
                renderTopProductsPanel(data.top_products);
            }
        })
        .catch(err => console.error("Error loading dashboard data: ", err));
}

function renderSalesTrendChart(chartData) {
    const ctx = document.getElementById('salesTrendChart').getContext('2d');
    
    // Persiapkan labels & dataset
    const labels = chartData.map(item => {
        const d = new Date(item.date);
        return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' });
    });
    
    const revenues = chartData.map(item => parseFloat(item.revenue));
    const profits = chartData.map(item => parseFloat(item.profit));

    if (salesChart) {
        // Update existing chart
        salesChart.data.labels = labels;
        salesChart.data.datasets[0].data = revenues;
        salesChart.data.datasets[1].data = profits;
        salesChart.update();
        return;
    }

    salesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Pendapatan (Revenue)',
                    data: revenues,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.15)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: '#6366f1',
                    pointRadius: 4
                },
                {
                    label: 'Keuntungan Bersih (Profit)',
                    data: profits,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: '#10b981',
                    pointRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#8a99ad',
                        font: { family: 'Plus Jakarta Sans', weight: '600', size: 12 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + formatRupiah(context.raw);
                        }
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#8a99ad',
                        callback: function(val) { return 'Rp ' + val / 1000 + 'k'; }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#8a99ad' }
                }
            }
        }
    });
}

function renderLowStockPanel(lowStockDetails) {
    const list = document.getElementById('low-stock-list');
    list.innerHTML = '';

    if (!lowStockDetails || lowStockDetails.length === 0) {
        list.innerHTML = `<div class="empty-state">Stok semua barang aman <i class="fa-regular fa-circle-check text-green"></i></div>`;
        return;
    }

    lowStockDetails.forEach(item => {
        const div = document.createElement('div');
        div.className = 'panel-item';
        div.innerHTML = `
            <div class="panel-item-left">
                <i class="fa-solid fa-triangle-exclamation text-orange"></i>
                <div>
                    <span class="panel-item-name">${item.name}</span>
                    <span class="panel-item-sub" style="display: block;">Kode: ${item.code}</span>
                </div>
            </div>
            <span class="stock-badge-low">${item.stock === 0 ? 'Habis' : 'Sisa: ' + item.stock}</span>
        `;
        list.appendChild(div);
    });
}

function renderTopProductsPanel(topProducts) {
    const list = document.getElementById('top-products-list');
    list.innerHTML = '';

    if (!topProducts || topProducts.length === 0) {
        list.innerHTML = `<div class="empty-state">Belum ada transaksi terekam.</div>`;
        return;
    }

    topProducts.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'panel-item';
        div.innerHTML = `
            <div class="panel-item-left">
                <div class="top-prod-rank">${index + 1}</div>
                <div>
                    <span class="panel-item-name">${item.name}</span>
                    <span class="panel-item-sub" style="display: block;">Terjual: ${item.total_sold} pcs</span>
                </div>
            </div>
            <strong style="color: #34d399">${formatRupiah(item.total_revenue)}</strong>
        `;
        list.appendChild(div);
    });
}

// 7. RIWAYAT TRANSAKSI HISTORI & EKSPOR
function loadHistoryData() {
    fetch(`${PHP_API_BASE}/transactions.php`)
        .then(res => res.json())
        .then(data => {
            state.transactions = data;
            renderHistoryTable();
        })
        .catch(err => {
            showToast('Gagal memuat histori transaksi', 'error');
            console.error(err);
        });
}

function renderHistoryTable(searchQuery = '') {
    const tbody = document.getElementById('history-table-body');
    tbody.innerHTML = '';

    const query = searchQuery.toLowerCase();
    const filtered = state.transactions.filter(t => t.invoice_no.toLowerCase().includes(query));

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Tidak ada transaksi terekam.</td></tr>`;
        return;
    }

    filtered.forEach(t => {
        const d = new Date(t.created_at);
        const formattedDate = d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${t.invoice_no}</strong></td>
            <td>${formattedDate}</td>
            <td><strong>${formatRupiah(t.total_amount)}</strong></td>
            <td>${formatRupiah(t.discount)}</td>
            <td>${formatRupiah(t.tax)}</td>
            <td>${formatRupiah(t.paid_amount)}</td>
            <td>${formatRupiah(t.change_amount)}</td>
            <td style="text-align: center;">
                <button class="action-btn action-btn-view" onclick="reprintReceipt(${t.id})" title="Cetak Ulang Struk"><i class="fa-solid fa-print"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

window.reprintReceipt = function(id) {
    fetch(`${PHP_API_BASE}/transactions.php?id=${id}`)
        .then(res => res.json())
        .then(resData => {
            if (resData.id) {
                // Tampilkan kembali struk belanja menggunakan data terformat
                const structuredData = {
                    invoice_no: resData.invoice_no,
                    created_at: resData.created_at,
                    total_amount: parseFloat(resData.total_amount),
                    subtotal_before_discount: parseFloat(resData.total_amount) + parseFloat(resData.discount) - parseFloat(resData.tax),
                    paid_amount: parseFloat(resData.paid_amount),
                    change_amount: parseFloat(resData.change_amount),
                    discount: parseFloat(resData.discount),
                    tax: parseFloat(resData.tax),
                    items: resData.items.map(item => ({
                        name: item.name,
                        quantity: parseInt(item.quantity),
                        selling_price: parseFloat(item.selling_price),
                        subtotal: parseFloat(item.subtotal)
                    }))
                };
                showReceipt(structuredData);
            } else {
                showToast('Gagal memuat struk penjualan.', 'error');
            }
        })
        .catch(err => {
            showToast('Koneksi API database bermasalah.', 'error');
            console.error(err);
        });
};

function setupHistory() {
    const historySearch = document.getElementById('history-search');
    const exportBtn = document.getElementById('export-csv-btn');

    historySearch.addEventListener('input', () => {
        renderHistoryTable(historySearch.value);
    });

    exportBtn.addEventListener('click', () => {
        exportTransactionsToCSV();
    });
}

function exportTransactionsToCSV() {
    if (state.transactions.length === 0) {
        showToast('Tidak ada transaksi yang dapat diekspor.', 'warning');
        return;
    }

    const headers = ["No. Invoice", "Tanggal & Waktu", "Total Belanja (Rp)", "Diskon (Rp)", "Pajak (Rp)", "Uang Tunai (Rp)", "Kembalian (Rp)"];
    const rows = state.transactions.map(t => [
        t.invoice_no,
        t.created_at,
        parseFloat(t.total_amount),
        parseFloat(t.discount),
        parseFloat(t.tax),
        parseFloat(t.paid_amount),
        parseFloat(t.change_amount)
    ]);
    
    const dateToday = new Date().toISOString().slice(0, 10);
    const filename = `Laporan_Transaksi_KopiTech_${dateToday}.pdf`;
    
    openExportPreview("Laporan Transaksi Kasir", dateToday, null, headers, rows, filename);
}

// 8. UTILITY UTILS
function formatRupiah(value) {
    const num = parseFloat(value) || 0;
    return 'Rp ' + num.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-circle-xmark';
    if (type === 'warning') iconClass = 'fa-triangle-exclamation';

    toast.innerHTML = `
        <i class="fa-solid ${iconClass}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    // Hapus setelah 4 detik
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ==========================================
// 9. LAPORAN KEUANGAN DETAIL (HARIAN & BULANAN)
// ==========================================
let detailedReportState = {
    type: 'monthly',
    data: null
};

function setupDetailedReports() {
    const periodType = document.getElementById('report-period-type');
    const filterMonthWrapper = document.getElementById('filter-month-wrapper');
    const filterDateWrapper = document.getElementById('filter-date-wrapper');
    const reportMonth = document.getElementById('report-month');
    const reportDate = document.getElementById('report-date');
    const viewReportBtn = document.getElementById('btn-view-report');
    const exportReportBtn = document.getElementById('export-report-csv-btn');

    // Set default values for inputs
    const today = new Date();
    reportMonth.value = today.toISOString().slice(0, 7);
    reportDate.value = today.toISOString().slice(0, 10);

    // Toggle filter input based on select
    periodType.addEventListener('change', () => {
        if (periodType.value === 'monthly') {
            filterMonthWrapper.style.display = 'flex';
            filterDateWrapper.style.display = 'none';
        } else {
            filterMonthWrapper.style.display = 'none';
            filterDateWrapper.style.display = 'flex';
        }
    });

    viewReportBtn.addEventListener('click', () => {
        loadDetailedReportData();
    });

    exportReportBtn.addEventListener('click', () => {
        exportDetailedReportCSV();
    });
}

function initDetailedReports() {
    loadDetailedReportData();
}

function loadDetailedReportData() {
    const periodType = document.getElementById('report-period-type').value;
    const month = document.getElementById('report-month').value;
    const date = document.getElementById('report-date').value;

    let url = `${PHP_API_BASE}/reports.php?type=${periodType}`;
    if (periodType === 'monthly') {
        url += `&month=${month}`;
    } else {
        url += `&date=${date}`;
    }

    fetch(url)
        .then(res => res.json())
        .then(resData => {
            if (resData.status === 'success') {
                detailedReportState.type = periodType;
                detailedReportState.data = resData;

                // Update summaries
                const s = resData.summary;
                document.getElementById('rep-val-revenue').innerText = formatRupiah(s.net_revenue);
                document.getElementById('rep-val-cogs').innerText = formatRupiah(s.total_cogs);
                document.getElementById('rep-val-profit').innerText = formatRupiah(s.net_profit);

                // Margin percent = (profit / cogs) * 100
                const marginPct = s.total_cogs > 0 ? ((s.net_profit / s.total_cogs) * 100).toFixed(0) : 0;
                document.getElementById('rep-val-margin').innerText = marginPct + '%';

                // Desc text updates
                document.getElementById('rep-desc-revenue').innerText = periodType === 'monthly' ? `Pendapatan bersih bulan ini` : `Pendapatan bersih hari ini`;

                // Render table breakdown
                renderDetailedReportTable(resData);
            } else {
                showToast(resData.message || 'Gagal memproses laporan.', 'error');
            }
        })
        .catch(err => {
            showToast('Kesalahan koneksi ke server laporan keuangan.', 'error');
            console.error(err);
        });
}

function renderDetailedReportTable(resData) {
    const tableTitle = document.getElementById('report-table-title');
    const thead = document.getElementById('report-breakdown-thead');
    const tbody = document.getElementById('report-breakdown-tbody');

    thead.innerHTML = '';
    tbody.innerHTML = '';

    if (resData.type === 'monthly') {
        tableTitle.innerText = `Breakdown Penjualan Harian - ${resData.period}`;
        
        thead.innerHTML = `
            <tr>
                <th>Tanggal</th>
                <th>Transaksi</th>
                <th>Pendapatan (Omset)</th>
                <th>Modal (HPP)</th>
                <th>Laba Bersih</th>
                <th>Margin Laba</th>
                <th style="text-align: center;">Tindakan</th>
            </tr>
        `;

        if (resData.breakdown.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Tidak ada aktivitas transaksi pada bulan ini.</td></tr>`;
            return;
        }

        resData.breakdown.forEach(row => {
            const marginPct = parseFloat(row.cogs) > 0 ? ((parseFloat(row.profit) / parseFloat(row.cogs)) * 100).toFixed(0) : 0;
            const d = new Date(row.date);
            const formattedDate = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${formattedDate}</strong></td>
                <td>${row.transactions_count} transaksi</td>
                <td>${formatRupiah(row.revenue)}</td>
                <td>${formatRupiah(row.cogs)}</td>
                <td><strong class="text-green">${formatRupiah(row.profit)}</strong></td>
                <td>${marginPct}%</td>
                <td style="text-align: center;">
                    <button class="action-btn action-btn-view" onclick="viewDailyFromMonthly('${row.date}')" title="Lihat Detail Harian">
                        <i class="fa-solid fa-arrow-right"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } else {
        tableTitle.innerText = `Breakdown Penjualan Produk - ${resData.period}`;
        
        thead.innerHTML = `
            <tr>
                <th>Kode / SKU</th>
                <th>Nama Produk</th>
                <th>Jumlah Terjual</th>
                <th>Total Pendapatan</th>
                <th>Estimasi Laba Bersih</th>
                <th>Margin Laba</th>
            </tr>
        `;

        if (resData.products.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Tidak ada barang terjual pada tanggal ini.</td></tr>`;
            return;
        }

        resData.products.forEach(p => {
            const totalCogs = parseFloat(p.total_revenue) - parseFloat(p.total_profit);
            const marginPct = totalCogs > 0 ? ((parseFloat(p.total_profit) / totalCogs) * 100).toFixed(0) : 0;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${p.code}</strong></td>
                <td>${p.name}</td>
                <td><strong>${p.quantity_sold} pcs</strong></td>
                <td>${formatRupiah(p.total_revenue)}</td>
                <td><strong class="text-green">${formatRupiah(p.total_profit)}</strong></td>
                <td>${marginPct}%</td>
            `;
            tbody.appendChild(tr);
        });
    }
}

window.viewDailyFromMonthly = function(dateString) {
    document.getElementById('report-period-type').value = 'daily';
    document.getElementById('filter-month-wrapper').style.display = 'none';
    document.getElementById('filter-date-wrapper').style.display = 'flex';
    document.getElementById('report-date').value = dateString;
    loadDetailedReportData();
};

function exportDetailedReportCSV() {
    const stateType = detailedReportState.type;
    const data = detailedReportState.data;

    if (!data) {
        showToast('Tidak ada data laporan untuk diekspor.', 'warning');
        return;
    }

    let headers = [];
    let rows = [];
    let filename = '';

    if (stateType === 'monthly') {
        headers = ["Tanggal", "Jumlah Transaksi", "Total Omset (Rp)", "Total HPP (Rp)", "Laba Bersih (Rp)"];
        rows = data.breakdown.map(row => [
            row.date,
            row.transactions_count + ' transaksi',
            parseFloat(row.revenue),
            parseFloat(row.cogs),
            parseFloat(row.profit)
        ]);
        filename = `Laporan_Keuangan_Bulanan_${data.period}.pdf`;
    } else {
        headers = ["Kode SKU", "Nama Produk", "Kuantitas Terjual", "Total Pendapatan (Rp)", "Laba Bersih (Rp)"];
        rows = data.products.map(p => [
            p.code,
            p.name,
            p.quantity_sold + ' pcs',
            parseFloat(p.total_revenue),
            parseFloat(p.total_profit)
        ]);
        filename = `Laporan_Keuangan_Harian_${data.period}.pdf`;
    }

    const summary = {
        net_revenue: data.summary.net_revenue,
        total_cogs: data.summary.total_cogs,
        net_profit: data.summary.net_profit
    };

    openExportPreview(
        `Laporan Keuangan ${stateType === 'monthly' ? 'Bulanan' : 'Harian'}`, 
        data.period, 
        summary, 
        headers, 
        rows, 
        filename
    );
}

function setupExportPreviewModal() {
    const modal = document.getElementById('export-preview-modal');
    const closeBtn = document.getElementById('close-export-preview-modal');
    const cancelBtn = document.getElementById('cancel-export-preview-modal');
    const confirmBtn = document.getElementById('confirm-export-excel-btn');

    const closeModal = () => modal.classList.remove('active');

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    confirmBtn.addEventListener('click', () => {
        if (exportState.rows.length === 0) return;

        const element = document.getElementById('export-pdf-area');
        
        // Simpan style tinggi maksimal agar html2pdf dapat men-render seluruh data (tidak terpotong scroll)
        const originalMaxHeight = element.style.maxHeight;
        const originalOverflowY = element.style.overflowY;
        element.style.maxHeight = 'none';
        element.style.overflowY = 'visible';

        const opt = {
            margin:       12,
            filename:     exportState.filename,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: false },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        // Buat PDF dan unduh otomatis
        html2pdf().set(opt).from(element).save().then(() => {
            // Kembalikan style semula
            element.style.maxHeight = originalMaxHeight;
            element.style.overflowY = originalOverflowY;
            closeModal();
            showToast('Dokumen PDF berhasil diunduh!', 'success');
        }).catch(err => {
            element.style.maxHeight = originalMaxHeight;
            element.style.overflowY = originalOverflowY;
            showToast('Gagal memproses ekspor PDF.', 'error');
            console.error(err);
        });
    });
}

function openExportPreview(title, period, summary, headers, rows, filename) {
    exportState.title = title;
    exportState.headers = headers;
    exportState.rows = rows;
    exportState.filename = filename;

    // 1. Update Judul & Periode Laporan di Dokumen PDF
    document.getElementById('pdf-report-title').innerText = title;
    document.getElementById('pdf-report-period').innerText = period;
    document.getElementById('pdf-report-printed-at').innerText = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

    // 2. Update KPI Summary di Dokumen PDF
    if (summary) {
        document.getElementById('pdf-summary-revenue').innerText = formatRupiah(summary.net_revenue);
        document.getElementById('pdf-summary-cogs').innerText = formatRupiah(summary.total_cogs);
        document.getElementById('pdf-summary-profit').innerText = formatRupiah(summary.net_profit);
        
        const marginPct = summary.total_cogs > 0 ? ((summary.net_profit / summary.total_cogs) * 100).toFixed(0) : 0;
        document.getElementById('pdf-summary-margin').innerText = marginPct + '%';
        
        // Tampilkan baris summary KPI
        document.getElementById('pdf-summary-revenue').parentNode.parentNode.style.display = 'grid';
    } else {
        // Sembunyikan summary KPI jika data transaksi biasa
        document.getElementById('pdf-summary-revenue').parentNode.parentNode.style.display = 'none';
    }

    // 3. Render Judul Kolom (Headers)
    const theadRow = document.getElementById('pdf-table-thead-row');
    theadRow.innerHTML = '';
    headers.forEach(h => {
        const th = document.createElement('th');
        th.style.padding = '8px 12px';
        th.style.borderBottom = '1px solid #cbd5e1';
        th.style.textAlign = 'left';
        th.innerText = h;
        theadRow.appendChild(th);
    });

    // 4. Render Baris Data
    const tbody = document.getElementById('pdf-table-tbody');
    tbody.innerHTML = '';

    rows.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');
        
        // Warna baris belang agar mudah dibaca di kertas print
        if (rowIndex % 2 === 1) {
            tr.style.background = '#f8fafc';
        }
        
        row.forEach((val, colIndex) => {
            const td = document.createElement('td');
            td.style.padding = '8px 12px';
            td.style.borderBottom = '1px solid #e2e8f0';
            
            // Format nominal uang otomatis jika judul kolomnya bertanda (Rp)
            const colHeader = headers[colIndex];
            if (colHeader.includes('(Rp)') && typeof val === 'number') {
                td.innerText = formatRupiah(val);
            } else {
                td.innerText = val !== null ? val.toString() : '';
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    document.getElementById('export-preview-modal').classList.add('active');
}
