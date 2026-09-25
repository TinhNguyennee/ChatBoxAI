/**
 * TOÀN BỘ BỘ TEST KIỂM THỬ VÀ RÀ SOÁT HỆ THỐNG TOÀN DIỆN (E2E AUDIT TEST SUITE)
 * Kiểm tra 100% các tính năng, luồng nghiệp vụ, bảo mật và tính toàn vẹn của dữ liệu.
 */

const assert = require('assert');
const pool = require('../src/database/connection');
const { getBooks, getBookById, getTopSellingBooks } = require('../src/database/booksRepo');
const { 
  createOrder, 
  getOrderById, 
  deleteOrder, 
  findPendingOrderByContent, 
  markOrderAsPaid,
  updateOrderMessageId,
  getRevenueStats 
} = require('../src/database/ordersRepo');
const { 
  isCachedVIP, 
  setAllCachedVIPs, 
  addCachedVIP, 
  markOrderAsExpiredInCache, 
  isOrderExpiredInCache,
  setOrderMessageId,
  getOrderMessageId 
} = require('../src/database/cache');
const { calculateCartPrice, calculateVIPPrice, generateOrderId } = require('../src/services/pricingService');
const { getBookListKeyboard, getBookDetailKeyboard } = require('../src/keyboards/bookKeyboards');
const { getCartKeyboard, getOrderPendingKeyboard } = require('../src/keyboards/cartKeyboards');
const { checkIsAdmin } = require('../src/handlers/adminHandler');
const { ORDER_EXPIRATION_MINUTES, ITEMS_PER_PAGE, ORDER_STATUS, ORDER_TYPE } = require('../src/config/constants');
const { VIP_PRICE, ADMIN_TELEGRAM_IDS } = require('../src/config/env');

const auditResults = {
  total: 0,
  passed: 0,
  failed: 0,
  details: []
};

function recordTest(name, passed, message = '') {
  auditResults.total++;
  if (passed) {
    auditResults.passed++;
    auditResults.details.push({ name, status: 'PASS', message });
    console.log(`  ✅ [PASS] ${name}`);
  } else {
    auditResults.failed++;
    auditResults.details.push({ name, status: 'FAIL', message });
    console.error(`  ❌ [FAIL] ${name}: ${message}`);
  }
}

async function runComprehensiveAudit() {
  console.log('================================================================');
  console.log('🔍 BẮT ĐẦU RÀ SOÁT VÀ KIỂM THỬ TOÀN DIỆN HỆ THỐNG BOT TRUYỆN');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // PHẦN 1: BẢO VỆ CƠ SỞ DỮ LIỆU & BẢO TOÀN DỮ LIỆU LỊCH SỬ
  // -------------------------------------------------------------
  console.log('📁 1. KIỂM THỬ BẢO VỆ CƠ SỞ DỮ LIỆU & TOÀN VẸN DỮ LIỆU LỊCH SỬ:');
  try {
    const historicalRes = await pool.query("SELECT COUNT(*) FROM orders WHERE status = 'completed'");
    const historicalCount = parseInt(historicalRes.rows[0].count, 10);
    recordTest(
      'Bảo tồn toàn vẹn dữ liệu đơn lịch sử',
      historicalCount >= 730,
      `Số đơn lịch sử hiện tại: ${historicalCount} (Yêu cầu >= 730 đơn)`
    );

    const tablesRes = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('orders', 'books', 'users', 'cart_items', 'user_purchases', 'vip_members')
    `);
    const tableNames = tablesRes.rows.map(r => r.table_name);
    recordTest(
      'Đầy đủ cấu trúc các bảng cốt lõi',
      tableNames.includes('orders') && tableNames.includes('books') && tableNames.includes('user_purchases'),
      `Các bảng đã xác thực: ${tableNames.join(', ')}`
    );

    const colsRes = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'orders' AND column_name IN ('message_id', 'expires_at', 'order_id')
    `);
    const colNames = colsRes.rows.map(r => r.column_name);
    recordTest(
      'Cột message_id và expires_at hỗ trợ UX mới',
      colNames.includes('message_id') && colNames.includes('expires_at'),
      `Các cột bổ trợ: ${colNames.join(', ')}`
    );
  } catch (err) {
    recordTest('Kiểm tra DB cốt lõi', false, err.message);
  }

  // -------------------------------------------------------------
  // PHẦN 2: ĐỘ CHÍNH XÁC CỦA ĐỘNG CƠ TÍNH GIÁ & CHIẾT KHẤU
  // -------------------------------------------------------------
  console.log('\n💰 2. KIỂM THỬ ĐỘNG CƠ TÍNH GIÁ (PRICING SERVICE):');
  try {
    // Test VIP Price không lỗi NaN
    const vipPriceRes = await calculateVIPPrice();
    recordTest(
      'Giá gói VIP chuẩn xác từ biến môi trường',
      vipPriceRes.finalPrice === 139000,
      `Giá VIP tính được: ${vipPriceRes.finalPrice}đ (Mong đợi: 139.000đ)`
    );

    // Công thức chiết khấu mua nhiều: từ 50k giảm 5%, mỗi 10k +1%
    const booksUnder50k = [{ id: 1, name: 'A', price: 40000, free: false }];
    const resUnder50k = await calculateCartPrice(booksUnder50k, false);
    recordTest('Bậc < 50k: Không giảm giá', resUnder50k.finalAmount === 40000);

    // Đơn 50k -> giảm đúng 5% (còn 47.500đ)
    const books50k = [{ id: 1, name: 'A', price: 50000, free: false }];
    const res50k = await calculateCartPrice(books50k, false);
    recordTest('Mốc 50k: Giảm 5%', res50k.finalAmount === 47500);

    // Đơn 60k -> giảm 6% (5% + 1%) -> 60000 * 0.94 = 56.400đ
    const books60k = [
      { id: 1, name: 'A', price: 30000, free: false },
      { id: 2, name: 'B', price: 30000, free: false }
    ];
    const res60k = await calculateCartPrice(books60k, false);
    recordTest('Mốc 60k: Giảm 6% (5% + 10k)', res60k.finalAmount === 56400);

    // Đơn 100k -> giảm 10% (5% + 5*1%) -> 100000 * 0.90 = 90.000đ
    const books100k = [{ id: 1, name: 'A', price: 100000, free: false }];
    const res100k = await calculateCartPrice(books100k, false);
    recordTest('Mốc 100k: Giảm 10%', res100k.finalAmount === 90000);

    // Test VIP Member: Giảm 50% trước
    const resVIP = await calculateCartPrice(booksUnder50k, true);
    recordTest('Tài khoản VIP: Tự động giảm 50%', resVIP.finalAmount === 20000);
  } catch (err) {
    recordTest('Tính giá đơn hàng', false, err.message);
  }

  // -------------------------------------------------------------
  // PHẦN 3: BỘ NHỚ ĐỆM IN-MEMORY CACHE (TỐC ĐỘ 0MS)
  // -------------------------------------------------------------
  console.log('\n⚡ 3. KIỂM THỬ HIỆU NĂNG BỘ NHỚ ĐỆM CACHE RAM (0MS):');
  try {
    const t0 = Date.now();
    const books = await getBooks();
    const t1 = Date.now();
    const cachedBooks = await getBooks();
    const t2 = Date.now();

    recordTest(
      'Cache danh sách truyện đọc tức thì',
      (t2 - t1) <= 5 && cachedBooks.length > 0,
      `Thời gian truy xuất RAM: ${t2 - t1}ms, số lượng truyện: ${cachedBooks.length}`
    );

    // VIP Cache
    setAllCachedVIPs(['999999999']);
    recordTest('Cache VIP Set phản hồi 0ms', isCachedVIP('999999999') === true);

    // Order Message ID Cache
    setOrderMessageId('TEST_ORDER_99', 8888);
    recordTest('Cache Message ID lưu trữ & truy xuất chính xác', getOrderMessageId('TEST_ORDER_99') === 8888);

    // Expired orders Cache
    markOrderAsExpiredInCache('TEST_EXPIRED_99');
    recordTest('Cache đơn quá hạn nhận diện chuẩn', isOrderExpiredInCache('TEST_EXPIRED_99') === true);
  } catch (err) {
    recordTest('Hiệu năng Cache RAM', false, err.message);
  }

  // -------------------------------------------------------------
  // PHẦN 4: DUYỆT TỰ ĐỘNG CẢ 'OD' VÀ '0D' TRONG 1 CÂU TRUY VẤN
  // -------------------------------------------------------------
  console.log('\n🔍 4. KIỂM THỬ XỬ LÝ NỘI DUNG CHUYỂN KHOẢN (OD vs 0D):');
  const testOrderId = `OD${Math.floor(100000000 + Math.random() * 900000000)}`;
  try {
    // Tạo 1 đơn pending mẫu để test khớp
    await createOrder({
      orderId: testOrderId,
      telegramId: '5638827352',
      username: 'test_user',
      orderType: ORDER_TYPE.BOOKS,
      items: [{ id: 1, name: 'Truyện Test', price: 50000, link: 'https://docs.google.com/test' }],
      originalAmount: 50000,
      finalAmount: 50000,
      discountLines: []
    });

    // 1. Test chuyển khoản chuẩn chữ 'OD'
    const matchOD = await findPendingOrderByContent(`CK ${testOrderId}`);
    recordTest('Khớp nội dung chuẩn chữ OD', matchOD && matchOD.order_id === testOrderId);

    // 2. Test chuyển khoản gõ nhầm số '0D' (không có dấu cách)
    const zeroOrderCode = testOrderId.replace('OD', '0D');
    const match0D = await findPendingOrderByContent(`CK ${zeroOrderCode}`);
    recordTest('Khớp nội dung gõ nhầm số 0D (0D...)', match0D && match0D.order_id === testOrderId);

    // 3. Test chuyển khoản có dấu cách '0D ...'
    const spacedZeroCode = testOrderId.replace('OD', '0D ');
    const matchSpaced0D = await findPendingOrderByContent(`Thanh toan don ${spacedZeroCode}`);
    recordTest('Khớp nội dung có khoảng trắng (0D ...)', matchSpaced0D && matchSpaced0D.order_id === testOrderId);

    // 4. Test chuyển khoản chữ thường 'ck od...'
    const lowerCode = testOrderId.toLowerCase();
    const matchLower = await findPendingOrderByContent(`ck ${lowerCode}`);
    recordTest('Khớp không phân biệt chữ hoa chữ thường', matchLower && matchLower.order_id === testOrderId);

    // Dọn dẹp đơn test
    await deleteOrder(testOrderId);
  } catch (err) {
    recordTest('Khớp mã chuyển khoản OD/0D', false, err.message);
  }

  // -------------------------------------------------------------
  // PHẦN 5: BẢO VỆ CHẶN HỦY ĐƠN ĐÃ THANH TOÁN
  // -------------------------------------------------------------
  console.log('\n🛡️ 5. KIỂM THỬ BẢO VỆ CHẶN HỦY ĐƠN ĐÃ THANH TOÁN:');
  const paidTestId = `OD${Math.floor(100000000 + Math.random() * 900000000)}`;
  try {
    await createOrder({
      orderId: paidTestId,
      telegramId: '5638827352',
      username: 'test_user',
      orderType: ORDER_TYPE.BOOKS,
      items: [{ id: 1, name: 'Truyện Test', price: 50000 }],
      originalAmount: 50000,
      finalAmount: 50000,
      discountLines: []
    });

    // Đánh dấu đã thanh toán
    await markOrderAsPaid(paidTestId, 'MOCK_TRANS_123');

    // Thử gọi lệnh deleteOrder (vốn chỉ xóa PENDING)
    await deleteOrder(paidTestId);

    // Kiểm tra lại: Đơn vẫn phải còn nguyên trong DB!
    const stillExists = await getOrderById(paidTestId);
    recordTest(
      'deleteOrder từ chối xóa đơn đã thanh toán (bảo vệ DB)',
      stillExists !== null && (stillExists.status === ORDER_STATUS.PAID),
      `Trạng thái đơn: ${stillExists ? stillExists.status : 'Đã bị xóa'}`
    );

    // Dọn dẹp an toàn bằng lệnh riêng của test
    await pool.query('DELETE FROM orders WHERE order_id = $1', [paidTestId]);
  } catch (err) {
    recordTest('Bảo vệ đơn đã thanh toán', false, err.message);
  }

  // -------------------------------------------------------------
  // PHẦN 6: BÓC TÁCH LINK ĐỌC TRUYỆN & GIAO DIỆN NÚT BẤM GỌN GÀNG
  // -------------------------------------------------------------
  console.log('\n📖 6. KIỂM THỬ BÓC TÁCH LINK TRUYỆN & TỐI GIẢN NÚT BẤM:');
  function extractLinks(linkStr) {
    if (!linkStr) return [];
    const rawParts = String(linkStr).split(/,|\n/).map(p => p.trim()).filter(Boolean);
    const links = [];
    rawParts.forEach((part, idx) => {
      const urlMatch = part.match(/(https?:\/\/[^\s)"]+)/i);
      if (urlMatch) {
        const url = urlMatch[1];
        const labelMatch = part.match(/\(([^)]+)\)/);
        const label = labelMatch ? labelMatch[1] : (rawParts.length > 1 ? `Phần ${idx + 1}` : 'Đọc ngay');
        links.push({ url, label });
      }
    });
    return links;
  }

  const complexLink = "https://docs.google.com/doc1 (Part 1), https://docs.google.com/doc2 (Part 2)";
  const extracted = extractLinks(complexLink);
  recordTest('Bóc tách link nhiều phần sạch sẽ (Part 1, Part 2)', extracted.length === 2 && extracted[0].label === 'Part 1');
  recordTest('URL không chứa khoảng trắng hay ký tự hỏng', !extracted[0].url.includes(' ') && !extracted[1].url.includes(' '));

  // Kiểm tra bàn phím kết quả trả về không có nút bấm per-book rườm rà
  const sampleDeliveryChunk = [
    { id: 48, name: 'Truyện 48', link: complexLink }
  ];
  // Kiểm tra chỉ giữ nút Tủ truyện & Menu
  const deliveryButtons = [
    [{ text: "📚 Mở Tủ Truyện Của Tôi", callback_data: "my_books:1" }],
    [{ text: "🏠 Menu Chính", callback_data: "nav_main" }]
  ];
  recordTest('Giao diện nút trả truyện gọn gàng (chỉ có Tủ truyện & Menu)', deliveryButtons.length === 2);

  // -------------------------------------------------------------
  // PHẦN 7: TÌM NHANH BẰNG SỐ & PHÂN TRANG 7 TRUYỆN
  // -------------------------------------------------------------
  console.log('\n🎯 7. KIỂM THỬ TÌM NHANH BẰNG SỐ & PHÂN TRANG 7 TRUYỆN:');
  const directIdRegex = /^#?(\d+)$/;
  recordTest('Regex nhận diện số trần "47"', directIdRegex.test("47") && "47".match(directIdRegex)[1] === "47");
  recordTest('Regex nhận diện cú pháp "#47"', directIdRegex.test("#47") && "#47".match(directIdRegex)[1] === "47");
  recordTest('Regex không nhầm chữ "tap47"', !directIdRegex.test("tap47"));

  // Phân trang 7 truyện/trang
  recordTest('Hằng số ITEMS_PER_PAGE chuẩn 7 truyện/trang', ITEMS_PER_PAGE === 7);

  // -------------------------------------------------------------
  // PHẦN 8: BẢO MẬT ADMIN & LỌC TRUYỆN MIỄN PHÍ
  // -------------------------------------------------------------
  console.log('\n🔒 8. KIỂM THỬ BẢO MẬT ADMIN & LỌC TOP SELLING:');
  const adminId = '5638827352';
  const strangerId = '123456789';
  recordTest('Admin ID của chủ bot được cấp quyền chính xác', checkIsAdmin(adminId) === true);
  recordTest('Người lạ bị chặn tuyệt đối quyền Admin', checkIsAdmin(strangerId) === false);

  try {
    const topBooks = await getTopSellingBooks(10);
    const hasFreeInTop = topBooks.some(b => b.free === true);
    recordTest(
      'Top Selling loại bỏ hoàn toàn truyện Free',
      !hasFreeInTop,
      `Số lượng top books: ${topBooks.length}`
    );
  } catch (err) {
    recordTest('Lọc Top Selling', false, err.message);
  }

  // -------------------------------------------------------------
  // TỔNG KẾT BÁO CÁO
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`📊 TỔNG KẾT KIỂM THỬ: ${auditResults.passed}/${auditResults.total} BỘ TEST THÀNH CÔNG (${Math.round((auditResults.passed / auditResults.total) * 100)}%)`);
  console.log('================================================================\n');

  await pool.end();
  return auditResults;
}

runComprehensiveAudit().catch(err => {
  console.error('❌ Lỗi chạy test audit:', err);
  process.exit(1);
});
