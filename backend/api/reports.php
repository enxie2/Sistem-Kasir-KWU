<?php
// backend/api/reports.php
require_once '../config.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'GET') {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Metode HTTP tidak diizinkan"]);
    exit();
}

try {
    // Cek apakah meminta laporan detail (Harian / Bulanan)
    if (isset($_GET['type'])) {
        $type = $_GET['type'];
        
        if ($type === 'monthly') {
            // Laporan Bulanan
            $month = isset($_GET['month']) ? $_GET['month'] : date('Y-m');
            
            // 1. KPI Ringkasan Bulanan
            $summaryStmt = $pdo->prepare("
                SELECT 
                    SUM(t.total_amount) as net_revenue, 
                    SUM(t.discount) as total_discount,
                    SUM(t.tax) as total_tax,
                    SUM(td.total_cogs) as total_cogs,
                    SUM(td.total_profit) as gross_profit
                FROM transactions t
                LEFT JOIN (
                    SELECT transaction_id, SUM(cost_price * quantity) as total_cogs, SUM(profit) as total_profit
                    FROM transaction_details
                    GROUP BY transaction_id
                ) td ON t.id = td.transaction_id
                WHERE DATE_FORMAT(t.created_at, '%Y-%m') = ?
            ");
            $summaryStmt->execute([$month]);
            $summary = $summaryStmt->fetch();
            
            $net_revenue = floatval($summary['net_revenue'] ?? 0);
            $total_discount = floatval($summary['total_discount'] ?? 0);
            $total_tax = floatval($summary['total_tax'] ?? 0);
            $total_cogs = floatval($summary['total_cogs'] ?? 0);
            $gross_profit = floatval($summary['gross_profit'] ?? 0);
            $net_profit = $gross_profit - $total_discount;
            
            // 2. Breakdown Penjualan Harian dalam Bulan Tersebut
            $breakdownStmt = $pdo->prepare("
                SELECT 
                    DATE(t.created_at) as date,
                    COUNT(t.id) as transactions_count,
                    SUM(t.total_amount) as revenue,
                    SUM(td.daily_cogs) as cogs,
                    SUM(td.daily_profit - t.discount) as profit
                FROM transactions t
                LEFT JOIN (
                    SELECT transaction_id, SUM(cost_price * quantity) as daily_cogs, SUM(profit) as daily_profit
                    FROM transaction_details
                    GROUP BY transaction_id
                ) td ON t.id = td.transaction_id
                WHERE DATE_FORMAT(t.created_at, '%Y-%m') = ?
                GROUP BY DATE(t.created_at)
                ORDER BY DATE(t.created_at) ASC
            ");
            $breakdownStmt->execute([$month]);
            $breakdown = $breakdownStmt->fetchAll();
            
            echo json_encode([
                "status" => "success",
                "type" => "monthly",
                "period" => $month,
                "summary" => [
                    "net_revenue" => $net_revenue,
                    "total_cogs" => $total_cogs,
                    "net_profit" => $net_profit,
                    "total_discount" => $total_discount,
                    "total_tax" => $total_tax
                ],
                "breakdown" => $breakdown
            ]);
            exit();
            
        } elseif ($type === 'daily') {
            // Laporan Harian
            $date = isset($_GET['date']) ? $_GET['date'] : date('Y-m-d');
            
            // 1. KPI Ringkasan Harian
            $summaryStmt = $pdo->prepare("
                SELECT 
                    SUM(t.total_amount) as net_revenue, 
                    SUM(t.discount) as total_discount,
                    SUM(t.tax) as total_tax,
                    SUM(td.total_cogs) as total_cogs,
                    SUM(td.total_profit) as gross_profit
                FROM transactions t
                LEFT JOIN (
                    SELECT transaction_id, SUM(cost_price * quantity) as total_cogs, SUM(profit) as total_profit
                    FROM transaction_details
                    GROUP BY transaction_id
                ) td ON t.id = td.transaction_id
                WHERE DATE(t.created_at) = ?
            ");
            $summaryStmt->execute([$date]);
            $summary = $summaryStmt->fetch();
            
            $net_revenue = floatval($summary['net_revenue'] ?? 0);
            $total_discount = floatval($summary['total_discount'] ?? 0);
            $total_tax = floatval($summary['total_tax'] ?? 0);
            $total_cogs = floatval($summary['total_cogs'] ?? 0);
            $gross_profit = floatval($summary['gross_profit'] ?? 0);
            $net_profit = $gross_profit - $total_discount;
            
            // 2. Daftar Transaksi Terjadi Hari Itu
            $transStmt = $pdo->prepare("
                SELECT * FROM transactions 
                WHERE DATE(created_at) = ? 
                ORDER BY created_at ASC
            ");
            $transStmt->execute([$date]);
            $transactions = $transStmt->fetchAll();
            
            // 3. Breakdown Produk Terjual Hari Itu
            $productsStmt = $pdo->prepare("
                SELECT 
                    p.name, 
                    p.code,
                    SUM(td.quantity) as quantity_sold, 
                    SUM(td.subtotal) as total_revenue,
                    SUM(td.profit) as total_profit
                FROM transaction_details td
                JOIN products p ON td.product_id = p.id
                JOIN transactions t ON td.transaction_id = t.id
                WHERE DATE(t.created_at) = ?
                GROUP BY td.product_id
                ORDER BY quantity_sold DESC
            ");
            $productsStmt->execute([$date]);
            $products = $productsStmt->fetchAll();
            
            echo json_encode([
                "status" => "success",
                "type" => "daily",
                "period" => $date,
                "summary" => [
                    "net_revenue" => $net_revenue,
                    "total_cogs" => $total_cogs,
                    "net_profit" => $net_profit,
                    "total_discount" => $total_discount,
                    "total_tax" => $total_tax
                ],
                "transactions" => $transactions,
                "products" => $products
            ]);
            exit();
        }
    }

    // DEFAULT: RINGKASAN DASHBOARD UTAMA (JIKA TANPA PARAMETER ?type)
    
    // a. Total Transaksi Penjualan
    $stmt = $pdo->query("SELECT COUNT(*) as count FROM transactions");
    $total_transactions = intval($stmt->fetch()['count']);

    // b. Total Pendapatan Bersih (Revenue), Diskon, & Pajak dari table transactions
    $stmt = $pdo->query("
        SELECT 
            SUM(total_amount) as net_revenue, 
            SUM(discount) as total_discount, 
            SUM(tax) as total_tax 
        FROM transactions
    ");
    $trans_summary = $stmt->fetch();
    $net_revenue = floatval($trans_summary['net_revenue'] ?? 0);
    $total_discount = floatval($trans_summary['total_discount'] ?? 0);
    $total_tax = floatval($trans_summary['total_tax'] ?? 0);

    // c. Total HPP (Harga Pokok Penjualan) & Laba Kotor dari table transaction_details
    $stmt = $pdo->query("
        SELECT 
            SUM(cost_price * quantity) as total_cogs,
            SUM(profit) as gross_profit
        FROM transaction_details
    ");
    $details_summary = $stmt->fetch();
    $total_cogs = floatval($details_summary['total_cogs'] ?? 0);
    $gross_profit = floatval($details_summary['gross_profit'] ?? 0);

    // Laba Bersih = Laba Kotor Barang - Total Diskon
    $net_profit = $gross_profit - $total_discount;

    // d. Jumlah Produk dengan Stok Kritis (di bawah min_stock)
    $stmt = $pdo->query("SELECT COUNT(*) as count FROM products WHERE stock <= min_stock");
    $low_stock_count = intval($stmt->fetch()['count']);

    // e. Total Jenis Produk di Inventori
    $stmt = $pdo->query("SELECT COUNT(*) as count FROM products");
    $total_products = intval($stmt->fetch()['count']);

    // DATA TREN PENJUALAN (7 Hari Terakhir untuk Grafik)
    $stmt = $pdo->query("
        SELECT 
            DATE(t.created_at) as date,
            SUM(t.total_amount) as revenue,
            SUM(COALESCE(td.daily_profit, 0) - t.discount) as profit
        FROM transactions t
        LEFT JOIN (
            SELECT transaction_id, SUM(profit) as daily_profit
            FROM transaction_details
            GROUP BY transaction_id
        ) td ON t.id = td.transaction_id
        WHERE t.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        GROUP BY DATE(t.created_at)
        ORDER BY DATE(t.created_at) ASC
    ");
    $chart_data = $stmt->fetchAll();

    // TOP 5 PRODUK TERLARIS
    $stmt = $pdo->query("
        SELECT 
            p.name, 
            SUM(td.quantity) as total_sold, 
            SUM(td.subtotal) as total_revenue
        FROM transaction_details td
        JOIN products p ON td.product_id = p.id
        GROUP BY td.product_id
        ORDER BY total_sold DESC
        LIMIT 5
    ");
    $top_products = $stmt->fetchAll();

    // DAFTAR BARANG YANG HAMPIR HABIS (DETAIL)
    $stmt = $pdo->query("
        SELECT id, code, name, stock, min_stock 
        FROM products 
        WHERE stock <= min_stock 
        ORDER BY stock ASC 
        LIMIT 10
    ");
    $low_stock_details = $stmt->fetchAll();

    // Respon JSON Lengkap
    echo json_encode([
        "status" => "success",
        "summary" => [
            "total_transactions" => $total_transactions,
            "total_products" => $total_products,
            "net_revenue" => $net_revenue,
            "total_cogs" => $total_cogs,
            "net_profit" => $net_profit,
            "low_stock_count" => $low_stock_count
        ],
        "chart" => $chart_data,
        "top_products" => $top_products,
        "low_stock_details" => $low_stock_details
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Gagal memproses data laporan: " . $e->getMessage()]);
}
