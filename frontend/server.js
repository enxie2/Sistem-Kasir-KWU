const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Inisialisasi Socket.io dengan CORS diaktifkan
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Sajikan index.html sebagai entri utama Single Page Application (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Penanganan WebSocket (Real-time Broadcast)
io.on('connection', (socket) => {
  console.log(`[WebSocket] Klien terhubung: ${socket.id}`);

  // 1. Terima event transaksi selesai dari kasir
  socket.on('transaction_completed', (data) => {
    console.log(`[WebSocket] Transaksi baru ${data.invoice_no} selesai. Menyiarkan pembaruan stok ke semua klien...`);
    // Broadcast ke SEMUA klien TERMASUK pengirim (atau broadcast.emit untuk selain pengirim, tapi kita gunakan emit ke semua agar sinkron)
    io.emit('stock_updated', data);
  });

  // 2. Terima event perubahan inventori dari halaman manajemen produk
  socket.on('inventory_changed', (data) => {
    console.log(`[WebSocket] Inventori berubah (${data.action}). Menyiarkan pembaruan ke semua klien...`);
    io.emit('inventory_updated', data);
  });

  socket.on('disconnect', () => {
    console.log(`[WebSocket] Klien terputus: ${socket.id}`);
  });
});

// Jalankan server
server.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(` Server Node.js berjalan di http://localhost:${PORT}`);
  console.log(` Mode real-time Socket.io aktif.`);
  console.log(`=================================================`);
});
