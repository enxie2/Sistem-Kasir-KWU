-- =====================================================
-- SISTEM KASIR KOPITECH - RESET & FULL RE-INITIALIZATION
-- =====================================================
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS kewirausahaan_kasir CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE kewirausahaan_kasir;

DROP TABLE IF EXISTS transaction_details;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS products;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================
-- TABEL 1: PRODUCTS (Menu + Gudang dengan kolom category & unit)
-- =====================================================
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    category ENUM('menu','gudang') NOT NULL DEFAULT 'menu' COMMENT 'menu=produk jual, gudang=bahan baku',
    unit VARCHAR(30) NOT NULL DEFAULT 'pcs' COMMENT 'Satuan: pcs, gram, kg, liter, ml, lembar, botol, dll',
    cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    selling_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    stock INT NOT NULL DEFAULT 0,
    min_stock INT NOT NULL DEFAULT 5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- TABEL 2: TRANSACTIONS
-- =====================================================
CREATE TABLE transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_no VARCHAR(50) NOT NULL UNIQUE,
    total_amount DECIMAL(10,2) NOT NULL,
    paid_amount DECIMAL(10,2) NOT NULL,
    change_amount DECIMAL(10,2) NOT NULL,
    discount DECIMAL(10,2) DEFAULT 0.00,
    tax DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- TABEL 3: TRANSACTION DETAILS
-- =====================================================
CREATE TABLE transaction_details (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    cost_price DECIMAL(10,2) NOT NULL,
    selling_price DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    profit DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- DATA PRODUK: KATEGORI MENU (Produk Jual di Kasir)
-- =====================================================
INSERT INTO products (code, name, category, unit, cost_price, selling_price, stock, min_stock) VALUES
-- MINUMAN KOPI
('MNU-KOP-001', 'Espresso Single Shot',       'menu', 'gelas', 5000.00,  12000.00, 45, 10),
('MNU-KOP-002', 'Espresso Double Shot',        'menu', 'gelas', 8000.00,  18000.00, 40, 10),
('MNU-KOP-003', 'Americano Hot',               'menu', 'gelas', 6000.00,  16000.00, 60, 10),
('MNU-KOP-004', 'Americano Ice',               'menu', 'gelas', 7000.00,  18000.00, 55, 10),
('MNU-KOP-005', 'Cappuccino Hot',              'menu', 'gelas', 9000.00,  22000.00, 40, 8),
('MNU-KOP-006', 'Cappuccino Ice',              'menu', 'gelas', 10000.00, 25000.00, 50, 8),
('MNU-KOP-007', 'Latte Hot',                   'menu', 'gelas', 10000.00, 22000.00, 45, 8),
('MNU-KOP-008', 'Latte Ice',                   'menu', 'gelas', 11000.00, 25000.00, 60, 8),
('MNU-KOP-009', 'Kopi Susu Aren Hot',          'menu', 'gelas', 8000.00,  20000.00, 80, 15),
('MNU-KOP-010', 'Kopi Susu Aren Ice',          'menu', 'gelas', 9500.00,  22000.00, 100, 15),
('MNU-KOP-011', 'Vietnam Drip Coffee',         'menu', 'gelas', 8000.00,  20000.00, 30, 8),
('MNU-KOP-012', 'Cold Brew Original',          'menu', 'gelas', 10000.00, 28000.00, 25, 5),
('MNU-KOP-013', 'Cold Brew Tonic',             'menu', 'gelas', 12000.00, 32000.00, 20, 5),
('MNU-KOP-014', 'Caramel Macchiato',           'menu', 'gelas', 12000.00, 30000.00, 35, 5),
('MNU-KOP-015', 'Kopi Tubruk Tradisional',     'menu', 'gelas', 3500.00,  10000.00, 50, 10),

-- MINUMAN NON-KOPI
('MNU-TEH-001', 'Matcha Latte Hot',            'menu', 'gelas', 10000.00, 25000.00, 30, 8),
('MNU-TEH-002', 'Matcha Latte Ice',            'menu', 'gelas', 11000.00, 28000.00, 40, 8),
('MNU-TEH-003', 'Teh Tarik Panas',             'menu', 'gelas', 4000.00,  10000.00, 50, 10),
('MNU-TEH-004', 'Teh Tarik Dingin',            'menu', 'gelas', 5000.00,  12000.00, 60, 10),
('MNU-TEH-005', 'Thai Tea Original',           'menu', 'gelas', 6000.00,  15000.00, 40, 8),
('MNU-TEH-006', 'Lemon Tea Ice',               'menu', 'gelas', 5000.00,  13000.00, 35, 8),
('MNU-TCK-001', 'Coklat Panas Belgia',         'menu', 'gelas', 9000.00,  22000.00, 30, 5),
('MNU-TCK-002', 'Coklat Dingin Belgia',        'menu', 'gelas', 10000.00, 25000.00, 35, 5),
('MNU-JUS-001', 'Jus Alpukat Segar',           'menu', 'gelas', 8000.00,  18000.00, 25, 5),
('MNU-JUS-002', 'Jus Mangga Segar',            'menu', 'gelas', 7000.00,  15000.00, 30, 5),
('MNU-AIR-001', 'Air Mineral 600ml',           'menu', 'botol', 1500.00,  5000.00, 120, 20),
('MNU-AIR-002', 'Sparkling Water 330ml',       'menu', 'botol', 5000.00,  12000.00, 48, 10),

-- MAKANAN BERAT
('MNU-MKN-001', 'Nasi Goreng Kampung Telur',   'menu', 'porsi', 12000.00, 28000.00, 20, 5),
('MNU-MKN-002', 'Mie Goreng Jawa Special',     'menu', 'porsi', 10000.00, 25000.00, 25, 5),
('MNU-MKN-003', 'Nasi Ayam Geprek Sambal',     'menu', 'porsi', 14000.00, 30000.00, 15, 5),
('MNU-MKN-004', 'Sandwich Keju Daging Asap',   'menu', 'porsi', 15000.00, 35000.00, 10, 3),
('MNU-MKN-005', 'Pasta Carbonara Creamy',      'menu', 'porsi', 18000.00, 40000.00, 8, 3),

-- MAKANAN RINGAN & SNACK
('MNU-SNK-001', 'Roti Bakar Nutella Keju',     'menu', 'porsi', 8000.00,  18000.00, 20, 5),
('MNU-SNK-002', 'Roti Bakar Srikaya Butter',   'menu', 'porsi', 6000.00,  15000.00, 20, 5),
('MNU-SNK-003', 'Kentang Goreng Crispy',       'menu', 'porsi', 6000.00,  15000.00, 25, 5),
('MNU-SNK-004', 'Kentang Goreng Cheese Sauce', 'menu', 'porsi', 8000.00,  20000.00, 20, 5),
('MNU-SNK-005', 'Pisang Goreng Crispy Keju',   'menu', 'porsi', 7000.00,  16000.00, 15, 5),
('MNU-SNK-006', 'Singkong Goreng Pedas Manis', 'menu', 'porsi', 5000.00,  12000.00, 18, 5),
('MNU-SNK-007', 'Croissant Butter Almond',     'menu', 'pcs', 10000.00, 22000.00, 12, 5),
('MNU-SNK-008', 'Brownies Coklat Premium',     'menu', 'slice', 8000.00,  20000.00, 10, 3);

-- =====================================================
-- DATA PRODUK: KATEGORI GUDANG (Bahan Baku & Kebutuhan Operasional)
-- =====================================================
INSERT INTO products (code, name, category, unit, cost_price, selling_price, stock, min_stock) VALUES
-- BAHAN KOPI
('GDG-KOP-001', 'Biji Kopi Arabika Gayo 1kg',   'gudang', 'kg',    250000.00, 0.00, 15, 3),
('GDG-KOP-002', 'Biji Kopi Robusta Lampung 1kg', 'gudang', 'kg',    120000.00, 0.00, 20, 5),
('GDG-KOP-003', 'Kopi Bubuk Siap Saji 500gr',    'gudang', 'sachet', 45000.00, 0.00, 30, 10),
('GDG-KOP-004', 'Kopi Instan Sachetan Box 20s',  'gudang', 'box',    35000.00, 0.00, 10, 3),

-- BAHAN SUSU & KRIM
('GDG-SUS-001', 'Susu Full Cream 1 Liter',       'gudang', 'liter',  20000.00, 0.00, 40, 10),
('GDG-SUS-002', 'Susu Skim Bubuk 400gr',          'gudang', 'pack',   30000.00, 0.00, 15, 5),
('GDG-SUS-003', 'Krim Kental Manis Kaleng 385gr', 'gudang', 'kaleng', 14000.00, 0.00, 25, 8),
('GDG-SUS-004', 'Heavy Whipping Cream 1 Liter',  'gudang', 'liter',  45000.00, 0.00, 8, 2),
('GDG-SUS-005', 'Oat Milk 1 Liter',              'gudang', 'liter',  35000.00, 0.00, 10, 3),

-- BAHAN GULA & SIRUP
('GDG-GUL-001', 'Gula Pasir 1kg',                'gudang', 'kg',     15000.00, 0.00, 30, 10),
('GDG-GUL-002', 'Gula Aren Cair 1 Liter',        'gudang', 'liter',  25000.00, 0.00, 20, 5),
('GDG-GUL-003', 'Sirup Simple Syrup 1 Liter',    'gudang', 'liter',  18000.00, 0.00, 15, 5),
('GDG-GUL-004', 'Caramel Sauce 500gr',           'gudang', 'botol',  45000.00, 0.00, 6, 2),
('GDG-GUL-005', 'Vanilla Syrup 700ml',           'gudang', 'botol',  55000.00, 0.00, 4, 2),
('GDG-GUL-006', 'Brown Sugar 500gr',             'gudang', 'pack',   12000.00, 0.00, 12, 4),

-- BAHAN TEH & MATCHA
('GDG-TEH-001', 'Teh Hitam Kualitas Premium 100gr', 'gudang', 'pack', 18000.00, 0.00, 10, 3),
('GDG-TEH-002', 'Matcha Powder Grade A 100gr',   'gudang', 'pack',   80000.00, 0.00, 5, 2),
('GDG-TEH-003', 'Thai Tea Mix 400gr',            'gudang', 'pack',   35000.00, 0.00, 8, 3),
('GDG-TEH-004', 'Lemon Segar (per kg)',          'gudang', 'kg',     20000.00, 0.00, 3, 1),

-- BAHAN COKLAT
('GDG-CKL-001', 'Dark Chocolate Powder 500gr',  'gudang', 'pack',   55000.00, 0.00, 6, 2),
('GDG-CKL-002', 'Nutella 750gr',                'gudang', 'jar',    95000.00, 0.00, 4, 2),
('GDG-CKL-003', 'Coklat Batang Couverture 1kg', 'gudang', 'kg',    150000.00, 0.00, 3, 1),
('GDG-CKL-004', 'Chocolate Sauce 600ml',        'gudang', 'botol',  45000.00, 0.00, 5, 2),

-- BAHAN MAKANAN & SNACK
('GDG-MKN-001', 'Beras Premium 5kg',            'gudang', 'karung', 75000.00, 0.00, 3, 1),
('GDG-MKN-002', 'Mie Telur Kering 1kg',         'gudang', 'kg',     18000.00, 0.00, 5, 2),
('GDG-MKN-003', 'Tepung Terigu Protein Tinggi 1kg','gudang','kg',   14000.00, 0.00, 8, 3),
('GDG-MKN-004', 'Telur Ayam 1 Papan (30 btr)',  'gudang', 'papan',  55000.00, 0.00, 3, 1),
('GDG-MKN-005', 'Kentang Segar 1kg',            'gudang', 'kg',     18000.00, 0.00, 5, 2),
('GDG-MKN-006', 'Pisang Raja Satu Sisir',       'gudang', 'sisir',  25000.00, 0.00, 2, 1),
('GDG-MKN-007', 'Roti Tawar Kupas 1 Loaf',      'gudang', 'loaf',   22000.00, 0.00, 4, 2),
('GDG-MKN-008', 'Keju Cheddar Slice 1kg',       'gudang', 'kg',    120000.00, 0.00, 2, 1),
('GDG-MKN-009', 'Ayam Potong Segar 1kg',        'gudang', 'kg',     38000.00, 0.00, 4, 2),
('GDG-MKN-010', 'Daging Asap (Smoked Beef) 500gr','gudang','pack',  55000.00, 0.00, 3, 1),
('GDG-MKN-011', 'Singkong Segar 1kg',           'gudang', 'kg',      8000.00, 0.00, 6, 2),

-- KEMASAN & OPERASIONAL
('GDG-OPR-001', 'Cup Plastik 16oz (isi 50pcs)', 'gudang', 'pack',   25000.00, 0.00, 8, 3),
('GDG-OPR-002', 'Cup Kertas Hot 12oz (isi 50pcs)','gudang','pack',  30000.00, 0.00, 6, 3),
('GDG-OPR-003', 'Tutup Cup Dome (isi 50pcs)',   'gudang', 'pack',   15000.00, 0.00, 8, 3),
('GDG-OPR-004', 'Sedotan Paper (isi 200pcs)',   'gudang', 'pack',   22000.00, 0.00, 5, 2),
('GDG-OPR-005', 'Kantong Plastik HD Medium (isi 100pcs)', 'gudang','pack', 18000.00, 0.00, 4, 2),
('GDG-OPR-006', 'Tisu Meja 1 Box',              'gudang', 'box',    15000.00, 0.00, 10, 3),
('GDG-OPR-007', 'Sabun Cuci Piring 800ml',      'gudang', 'botol',  22000.00, 0.00, 5, 2),
('GDG-OPR-008', 'Gas LPG 3kg',                  'gudang', 'tabung', 26000.00, 0.00, 4, 2),
('GDG-OPR-009', 'Es Batu Balok 5kg',            'gudang', 'balok',  10000.00, 0.00, 6, 2),
('GDG-OPR-010', 'Minyak Goreng 2 Liter',        'gudang', 'botol',  35000.00, 0.00, 5, 2);

-- =====================================================
-- DATA TRANSAKSI HISTORIS (3 BULAN TERAKHIR)
-- Data dibuat dengan procedural INSERT menggunakan stored procedure
-- =====================================================

DROP PROCEDURE IF EXISTS generate_dummy_transactions;
DELIMITER $$

CREATE PROCEDURE generate_dummy_transactions()
BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE i INT DEFAULT 1;
    DECLARE j INT DEFAULT 1;
    DECLARE t_date DATE;
    DECLARE t_datetime DATETIME;
    DECLARE daily_count INT;
    DECLARE invoice_num VARCHAR(50);
    DECLARE txn_id INT;
    DECLARE p_id INT;
    DECLARE p_cost DECIMAL(10,2);
    DECLARE p_sell DECIMAL(10,2);
    DECLARE qty INT;
    DECLARE subtotal DECIMAL(10,2);
    DECLARE profit_val DECIMAL(10,2);
    DECLARE total_all DECIMAL(10,2);
    DECLARE discount_val DECIMAL(10,2);
    DECLARE paid_val DECIMAL(10,2);
    DECLARE change_val DECIMAL(10,2);
    DECLARE num_items INT;
    DECLARE k INT;
    DECLARE item_offset INT;
    DECLARE random_hour INT;
    DECLARE random_minute INT;
    DECLARE inv_count INT DEFAULT 0;

    -- Buat transaksi dari 90 hari lalu hingga kemarin
    -- Hari ini (2026-07-13), jadi mulai dari 2026-04-14
    SET t_date = DATE_SUB(CURDATE(), INTERVAL 89 DAY);

    WHILE t_date < CURDATE() DO
        -- Setiap hari transaksi 5-15 kali
        SET daily_count = FLOOR(5 + RAND() * 11);
        SET j = 1;

        WHILE j <= daily_count DO
            -- Tentukan jam random (07:00 - 21:00)
            SET random_hour   = FLOOR(7 + RAND() * 15);
            SET random_minute = FLOOR(RAND() * 60);
            SET t_datetime    = TIMESTAMP(t_date, MAKETIME(random_hour, random_minute, 0));

            SET inv_count = inv_count + 1;
            SET invoice_num = CONCAT('INV-', DATE_FORMAT(t_date,'%Y%m%d'), '-', LPAD(inv_count, 4, '0'));

            -- Jumlah jenis item per transaksi (1-5 item)
            SET num_items  = FLOOR(1 + RAND() * 5);
            SET total_all  = 0;
            SET discount_val = 0;

            -- Insert transaksi header dulu dengan total = 0 (akan di-update)
            INSERT INTO transactions (invoice_no, total_amount, paid_amount, change_amount, discount, tax, created_at)
            VALUES (invoice_num, 0, 0, 0, 0, 0, t_datetime);
            SET txn_id = LAST_INSERT_ID();

            -- Insert detail item; pilih produk menu secara acak (id menu mulai dari 1 s.d. 45)
            SET k = 1;
            WHILE k <= num_items DO
                -- Pilih produk menu secara acak (menu products)
                SELECT id, cost_price, selling_price
                INTO p_id, p_cost, p_sell
                FROM products
                WHERE category = 'menu' AND selling_price > 0
                ORDER BY RAND()
                LIMIT 1;

                SET qty        = FLOOR(1 + RAND() * 3);
                SET subtotal   = p_sell * qty;
                SET profit_val = (p_sell - p_cost) * qty;
                SET total_all  = total_all + subtotal;

                INSERT INTO transaction_details
                    (transaction_id, product_id, quantity, cost_price, selling_price, subtotal, profit)
                VALUES
                    (txn_id, p_id, qty, p_cost, p_sell, subtotal, profit_val);

                SET k = k + 1;
            END WHILE;

            -- Hitung diskon acak (0, 5%, atau 10%) untuk simulasi promo
            SET discount_val = IF(RAND() < 0.15, FLOOR(total_all * 0.1 / 1000) * 1000, 0);
            SET total_all    = total_all - discount_val;
            SET paid_val     = CEIL(total_all / 5000) * 5000 + (FLOOR(RAND() * 2) * 5000);
            SET change_val   = paid_val - total_all;

            -- Update transaksi dengan total yang benar
            UPDATE transactions
            SET total_amount = total_all, paid_amount = paid_val, change_amount = change_val, discount = discount_val
            WHERE id = txn_id;

            SET j = j + 1;
        END WHILE;

        SET t_date = DATE_ADD(t_date, INTERVAL 1 DAY);
    END WHILE;
END$$

DELIMITER ;

-- Jalankan prosedur generate data dummy
CALL generate_dummy_transactions();

-- Hapus prosedur setelah dipakai
DROP PROCEDURE IF EXISTS generate_dummy_transactions;
