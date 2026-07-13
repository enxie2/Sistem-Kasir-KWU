<?php
// backend/api/transactions.php
require_once '../config.php';

// Set timezone to Local Time Jakarta (WIB) or UTC as default
date_default_timezone_set('Asia/Jakarta');

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        // Ambil riwayat transaksi
        try {
            // Ambil semua transaksi diurutkan dari yang terbaru
            if (isset($_GET['id'])) {
                $stmt = $pdo->prepare("SELECT * FROM transactions WHERE id = ?");
                $stmt->execute([intval($_GET['id'])]);
                $transaction = $stmt->fetch();
                
                if ($transaction) {
                    // Ambil detail item dalam transaksi
                    $detailStmt = $pdo->prepare("
                        SELECT td.*, p.name, p.code 
                        FROM transaction_details td 
                        JOIN products p ON td.product_id = p.id 
                        WHERE td.transaction_id = ?
                    ");
                    $detailStmt->execute([$transaction['id']]);
                    $transaction['items'] = $detailStmt->fetchAll();
                    
                    echo json_encode($transaction);
                } else {
                    http_response_code(404);
                    echo json_encode(["status" => "error", "message" => "Transaksi tidak ditemukan"]);
                }
            } else {
                $stmt = $pdo->query("SELECT * FROM transactions ORDER BY created_at DESC LIMIT 100");
                $transactions = $stmt->fetchAll();
                echo json_encode($transactions);
            }
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Gagal mengambil transaksi: " . $e->getMessage()]);
        }
        break;

    case 'POST':
        // Proses checkout transaksi baru
        $data = json_decode(file_get_contents("php://input"), true);
        
        if (empty($data['cart']) || !isset($data['paid_amount'])) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "Data transaksi tidak lengkap. Keranjang belanja dan jumlah bayar wajib diisi."]);
            break;
        }

        $cart = $data['cart'];
        $paid_amount = floatval($data['paid_amount']);
        $discount = isset($data['discount']) ? floatval($data['discount']) : 0.00;
        $tax = isset($data['tax']) ? floatval($data['tax']) : 0.00;

        // Mulai database transaction untuk menjamin ACID
        $pdo->beginTransaction();

        try {
            $total_amount = 0.00;
            $items_to_save = [];

            // 1. Validasi setiap produk di keranjang dan cek stoknya
            foreach ($cart as $item) {
                if (empty($item['product_id']) || empty($item['quantity'])) {
                    throw new Exception("Format data keranjang tidak valid.");
                }

                $product_id = intval($item['product_id']);
                $quantity = intval($item['quantity']);

                // Mengunci baris produk (FOR UPDATE) agar tidak terjadi race condition saat stok dikurangi
                $pStmt = $pdo->prepare("SELECT * FROM products WHERE id = ? FOR UPDATE");
                $pStmt->execute([$product_id]);
                $product = $pStmt->fetch();

                if (!$product) {
                    throw new Exception("Produk dengan ID {$product_id} tidak ditemukan di database.");
                }

                if ($product['stock'] < $quantity) {
                    throw new Exception("Stok untuk produk '{$product['name']}' tidak cukup (Tersedia: {$product['stock']}, Dibeli: {$quantity}).");
                }

                $cost_price = floatval($product['cost_price']);
                $selling_price = floatval($product['selling_price']);
                $subtotal = $selling_price * $quantity;
                $profit = ($selling_price - $cost_price) * $quantity; // Laba bersih per item

                $total_amount += $subtotal;

                $items_to_save[] = [
                    "product_id" => $product_id,
                    "name" => $product['name'],
                    "code" => $product['code'],
                    "quantity" => $quantity,
                    "cost_price" => $cost_price,
                    "selling_price" => $selling_price,
                    "subtotal" => $subtotal,
                    "profit" => $profit,
                    "new_stock" => $product['stock'] - $quantity
                ];
            }

            // Hitung total akhir (dikurangi diskon + pajak)
            $net_total = $total_amount - $discount + $tax;

            if ($paid_amount < $net_total) {
                throw new Exception("Uang pembayaran kurang! Total belanja: Rp " . number_format($net_total, 0, ',', '.') . ", dibayar: Rp " . number_format($paid_amount, 0, ',', '.'));
            }

            $change_amount = $paid_amount - $net_total;

            // Membuat Nomor Invoice otomatis (INV-YYYYMMDD-XXXX)
            $dateStr = date('Ymd');
            $invStmt = $pdo->prepare("SELECT COUNT(*) as count FROM transactions WHERE DATE(created_at) = CURRENT_DATE");
            $invStmt->execute();
            $invCount = $invStmt->fetch()['count'];
            $invoice_no = "INV-" . $dateStr . "-" . str_pad($invCount + 1, 4, '0', STR_PAD_LEFT);

            // 2. Simpan ke tabel transactions
            $tStmt = $pdo->prepare("INSERT INTO transactions (invoice_no, total_amount, paid_amount, change_amount, discount, tax) VALUES (?, ?, ?, ?, ?, ?)");
            $tStmt->execute([
                $invoice_no,
                $net_total,
                $paid_amount,
                $change_amount,
                $discount,
                $tax
            ]);
            $transaction_id = $pdo->lastInsertId();

            // 3. Simpan detail transaksi dan kurangi stok produk
            $dStmt = $pdo->prepare("INSERT INTO transaction_details (transaction_id, product_id, quantity, cost_price, selling_price, subtotal, profit) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $sStmt = $pdo->prepare("UPDATE products SET stock = ? WHERE id = ?");

            $stock_updates = [];

            foreach ($items_to_save as $item) {
                // Simpan item detail
                $dStmt->execute([
                    $transaction_id,
                    $item['product_id'],
                    $item['quantity'],
                    $item['cost_price'],
                    $item['selling_price'],
                    $item['subtotal'],
                    $item['profit']
                ]);

                // Kurangi stok di tabel products
                $sStmt->execute([$item['new_stock'], $item['product_id']]);

                // Kumpulkan data pembaruan stok untuk dikirim ke WebSocket (Node.js)
                $stock_updates[] = [
                    "product_id" => $item['product_id'],
                    "new_stock" => $item['new_stock'],
                    "name" => $item['name']
                ];
            }

            // Commit transaksi jika semua sukses
            $pdo->commit();

            // Respon sukses dengan detail struk transaksi
            echo json_encode([
                "status" => "success",
                "message" => "Transaksi checkout berhasil dilakukan.",
                "data" => [
                    "id" => $transaction_id,
                    "invoice_no" => $invoice_no,
                    "total_amount" => $net_total,
                    "subtotal_before_discount" => $total_amount,
                    "paid_amount" => $paid_amount,
                    "change_amount" => $change_amount,
                    "discount" => $discount,
                    "tax" => $tax,
                    "created_at" => date('Y-m-d H:i:s'),
                    "items" => $items_to_save,
                    "stock_updates" => $stock_updates // Digunakan Node.js untuk broadcast
                ]
            ]);

        } catch (Exception $e) {
            // Batalkan transaksi jika terjadi kesalahan
            $pdo->rollBack();
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => $e->getMessage()]);
        }
        break;

    default:
        http_response_code(405);
        echo json_encode(["status" => "error", "message" => "Metode HTTP tidak diizinkan"]);
        break;
}
