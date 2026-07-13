<?php
// backend/api/products.php
require_once '../config.php';

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        // Ambil data satu produk atau semua produk (dengan filter opsional per category)
        if (isset($_GET['id'])) {
            $stmt = $pdo->prepare("SELECT *, (stock <= min_stock) AS is_low_stock FROM products WHERE id = ?");
            $stmt->execute([$_GET['id']]);
            $product = $stmt->fetch();
            if ($product) {
                echo json_encode($product);
            } else {
                http_response_code(404);
                echo json_encode(["status" => "error", "message" => "Produk tidak ditemukan"]);
            }
        } elseif (isset($_GET['code'])) {
            $stmt = $pdo->prepare("SELECT *, (stock <= min_stock) AS is_low_stock FROM products WHERE code = ?");
            $stmt->execute([$_GET['code']]);
            $product = $stmt->fetch();
            if ($product) {
                echo json_encode($product);
            } else {
                http_response_code(404);
                echo json_encode(["status" => "error", "message" => "Produk tidak ditemukan"]);
            }
        } else {
            // Ambil semua produk; support filter ?category=menu atau ?category=gudang
            $category = isset($_GET['category']) ? $_GET['category'] : null;
            
            if ($category && in_array($category, ['menu', 'gudang'])) {
                $stmt = $pdo->prepare("SELECT *, (stock <= min_stock) AS is_low_stock FROM products WHERE category = ? ORDER BY name ASC");
                $stmt->execute([$category]);
            } else {
                $stmt = $pdo->query("SELECT *, (stock <= min_stock) AS is_low_stock FROM products ORDER BY category ASC, name ASC");
            }
            $products = $stmt->fetchAll();
            echo json_encode($products);
        }
        break;

    case 'POST':
        // Tambah produk baru
        $data = json_decode(file_get_contents("php://input"), true);
        
        if (empty($data['code']) || empty($data['name']) || !isset($data['cost_price']) || !isset($data['stock'])) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "Data tidak lengkap. Kode, nama, harga modal, dan stok wajib diisi."]);
            break;
        }

        try {
            $checkStmt = $pdo->prepare("SELECT id FROM products WHERE code = ?");
            $checkStmt->execute([$data['code']]);
            if ($checkStmt->fetch()) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "Kode produk '" . $data['code'] . "' sudah terdaftar."]);
                break;
            }

            $category  = isset($data['category'])  && in_array($data['category'], ['menu','gudang']) ? $data['category'] : 'menu';
            $unit      = isset($data['unit'])       ? trim($data['unit'])        : 'pcs';
            $min_stock = isset($data['min_stock'])  ? intval($data['min_stock']) : 5;

            $stmt = $pdo->prepare("INSERT INTO products (code, name, category, unit, cost_price, selling_price, stock, min_stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $data['code'],
                $data['name'],
                $category,
                $unit,
                floatval($data['cost_price']),
                floatval($data['selling_price'] ?? 0),
                intval($data['stock']),
                $min_stock
            ]);
            http_response_code(201);
            echo json_encode(["status" => "success", "message" => "Produk berhasil ditambahkan", "id" => $pdo->lastInsertId()]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Gagal menyimpan produk: " . $e->getMessage()]);
        }
        break;


    case 'PUT':
        // Edit produk
        $data = json_decode(file_get_contents("php://input"), true);
        
        if (empty($data['id']) || empty($data['code']) || empty($data['name']) || !isset($data['cost_price']) || !isset($data['stock'])) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "Data tidak lengkap. ID, kode, nama, harga modal, dan stok wajib diisi."]);
            break;
        }

        try {
            $checkStmt = $pdo->prepare("SELECT id FROM products WHERE code = ? AND id != ?");
            $checkStmt->execute([$data['code'], $data['id']]);
            if ($checkStmt->fetch()) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "Kode produk '" . $data['code'] . "' sudah digunakan produk lain."]);
                break;
            }

            $category  = isset($data['category'])  && in_array($data['category'], ['menu','gudang']) ? $data['category'] : 'menu';
            $unit      = isset($data['unit'])       ? trim($data['unit'])        : 'pcs';
            $min_stock = isset($data['min_stock'])  ? intval($data['min_stock']) : 5;

            $stmt = $pdo->prepare("UPDATE products SET code = ?, name = ?, category = ?, unit = ?, cost_price = ?, selling_price = ?, stock = ?, min_stock = ? WHERE id = ?");
            $stmt->execute([
                $data['code'],
                $data['name'],
                $category,
                $unit,
                floatval($data['cost_price']),
                floatval($data['selling_price'] ?? 0),
                intval($data['stock']),
                $min_stock,
                intval($data['id'])
            ]);
            echo json_encode(["status" => "success", "message" => "Produk berhasil diperbarui"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Gagal memperbarui produk: " . $e->getMessage()]);
        }
        break;

    case 'DELETE':
        // Hapus produk
        if (!isset($_GET['id'])) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "ID produk wajib disertakan"]);
            break;
        }

        try {
            $stmt = $pdo->prepare("DELETE FROM products WHERE id = ?");
            $stmt->execute([intval($_GET['id'])]);
            echo json_encode(["status" => "success", "message" => "Produk berhasil dihapus"]);
        } catch (PDOException $e) {
            http_response_code(500);
            // Memberikan pesan error yang informatif jika produk sudah terikat dengan transaksi (Foreign Key Constraint)
            echo json_encode([
                "status" => "error", 
                "message" => "Gagal menghapus produk. Produk ini kemungkinan besar sudah pernah ditransaksikan dan tidak boleh dihapus demi integritas histori laporan."
            ]);
        }
        break;

    default:
        http_response_code(405);
        echo json_encode(["status" => "error", "message" => "Metode HTTP tidak diizinkan"]);
        break;
}
