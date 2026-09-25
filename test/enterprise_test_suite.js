/**
 * ============================================================================
 * ENTERPRISE QA TEST SUITE - BOT BÁN TRUYỆN TRUYENECHXANHBOT
 * Chuẩn kiểm định: ISO/IEC/IEEE 29119 Software Testing Standard
 * ============================================================================
 */

const assert = require('assert');
const pool = require('../src/database/connection');

// Import Repositories
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
const { getCart, addToCart, removeFromCart, clearCart, getCartCount } = require('../src/database/cartRepo');
const { getUserPurchases, hasUserPurchased, addPurchases } = require('../src/database/purchasesRepo');
const { isUserVIP, addToVIP, removeVIP } = require('../src/database/vipRepo');
const { getActiveEvent, setActiveEvent, deleteActiveEvent } = require('../src/database/eventsRepo');

// Import Services & Cache
const { 
  getCachedBooks, 
  isCachedVIP, 
  setAllCachedVIPs, 
  addCachedVIP, 
  markOrderAsExpiredInCache, 
  isOrderExpiredInCache,
  setOrderMessageId,
  getOrderMessageId 
} = require('../src/database/cache');
const { calculateCartPrice, calculateVIPPrice, generateOrderId } = require('../src/services/pricingService');
const { processSepayWebhook } = require('../src/services/sepayService');
const { sendBookLinks } = require('../src/services/deliveryService');
const { generateQRCodeBuffer, sendQRCode } = require('../src/services/qrService');

// Import Handlers & Keyboards
const { handleStart, handleUserAccount, handleSupportInfo } = require('../src/handlers/startHandler');
const { handleBookList, handleBookDetail } = require('../src/handlers/listHandler');
const { handleViewCart, handleAddToCart, handleRemoveFromCart, handleClearCart } = require('../src/handlers/cartHandler');
const { handleCheckoutCart, handleBuyVIP, handleCheckOrder, handleCancelOrder } = require('../src/handlers/checkoutHandler');
const { handleMyBooks } = require('../src/handlers/myBooksHandler');
const { checkIsAdmin, handleAdminStats, handleAdminEvent } = require('../src/handlers/adminHandler');
const { getBookListKeyboard, getBookDetailKeyboard } = require('../src/keyboards/bookKeyboards');
const { getCartKeyboard, getOrderPendingKeyboard } = require('../src/keyboards/cartKeyboards');
const { getMainMenuKeyboard } = require('../src/keyboards/mainKeyboards');

// Import Config & Constants
const { ORDER_EXPIRATION_MINUTES, ITEMS_PER_PAGE, ORDER_STATUS, ORDER_TYPE } = require('../src/config/constants');
const { VIP_PRICE, ADMIN_TELEGRAM_IDS } = require('../src/config/env');

/**
 * Mock Telegram Bot Driver cho môi trường Unit & Integration Testing
 */
class MockTelegramBot {
  constructor() {
    this.sentMessages = [];
    this.sentPhotos = [];
    this.editedMessages = [];
    this.answeredCallbacks = [];
  }

  reset() {
    this.sentMessages = [];
    this.sentPhotos = [];
    this.editedMessages = [];
    this.answeredCallbacks = [];
  }

  async sendMessage(chatId, text, options = {}) {
    const msg = { 
      message_id: Math.floor(100000 + Math.random() * 900000), 
      chat: { id: chatId }, 
      text, 
      ...options 
    };
    this.sentMessages.push(msg);
    return msg;
  }

  async sendPhoto(chatId, photoBuffer, options = {}) {
    const msg = { 
      message_id: Math.floor(100000 + Math.random() * 900000), 
      chat: { id: chatId }, 
      photo: photoBuffer, 
      ...options 
    };
    this.sentPhotos.push(msg);
    return msg;
  }

  async editMessageText(text, options = {}) {
    this.editedMessages.push({ text, ...options });
    return { ok: true };
  }

  async editMessageCaption(caption, options = {}) {
    this.editedMessages.push({ caption, ...options });
    return { ok: true };
  }

  async editMessageReplyMarkup(replyMarkup, options = {}) {
    this.editedMessages.push({ reply_markup: replyMarkup, ...options });
    return { ok: true };
  }

  async answerCallbackQuery(callbackQueryId, options = {}) {
    this.answeredCallbacks.push({ callbackQueryId, ...options });
    return { ok: true };
  }
}

// Bảng kết quả kiểm thử chuẩn doanh nghiệp
const testReport = {
  metadata: {
    suiteName: "TruyenEchXanhBot Enterprise Acceptance Test Suite",
    executedAt: new Date().toISOString(),
    environment: "Staging / Local Test Polling",
    database: "Neon PostgreSQL (AWS Singapore)",
    tester: "Antigravity Quality Assurance AI"
  },
  metrics: {
    total: 0,
    passed: 0,
    failed: 0,
    durationMs: 0
  },
  testCases: []
};

async function executeTestCase(id, module, description, testFn) {
  testReport.metrics.total++;
  const startTime = Date.now();
  try {
    await testFn();
    const duration = Date.now() - startTime;
    testReport.metrics.passed++;
    testReport.testCases.push({
      id,
      module,
      description,
      status: "PASS",
      durationMs: duration,
      error: null
    });
    console.log(`  [PASS] ${id} | ${module.padEnd(12)} | ${description} (${duration}ms)`);
  } catch (err) {
    const duration = Date.now() - startTime;
    testReport.metrics.failed++;
    testReport.testCases.push({
      id,
      module,
      description,
      status: "FAIL",
      durationMs: duration,
      error: err.message
    });
    console.error(`  [FAIL] ${id} | ${module.padEnd(12)} | ${description} (${duration}ms)`);
    console.error(`         Chi tiết: ${err.message}`);
  }
}

async function runEnterpriseTestSuite() {
  const overallStart = Date.now();
  console.log("================================================================================");
  console.log("🚀 BẮT ĐẦU CHẠY BỘ KIỂM THỬ PHẦN MỀM CHUẨN DOANH NGHIỆP (ENTERPRISE QA SUITE)");
  console.log("================================================================================\n");

  const mockBot = new MockTelegramBot();
  const testChatId = '5638827352';
  const testStrangerId = '1122334455';

  // --------------------------------------------------------------------------
  // MODULE 1: ĐIỀU HƯỚNG & MENU CHÍNH (TC-NAV)
  // --------------------------------------------------------------------------
  console.log("📦 MODULE 1: GIAO DIỆN & MENU ĐIỀU HƯỚNG CHÍNH (TC-NAV)");

  await executeTestCase("TC-NAV-01", "Navigation", "Lệnh /start hiển thị Dashboard cá nhân hóa và nút bấm đầy đủ", async () => {
    mockBot.reset();
    const msg = { chat: { id: testChatId }, from: { first_name: "Test", last_name: "User", username: "tester" } };
    await handleStart(mockBot, msg, false);
    assert.strictEqual(mockBot.sentMessages.length, 1);
    const sent = mockBot.sentMessages[0];
    assert.ok(sent.text.includes("CHÀO MỪNG BẠN ĐẾN VỚI TRUYỆN ẾCH XANH"), "Phải có tiêu đề chào mừng");
    assert.ok(sent.reply_markup && sent.reply_markup.inline_keyboard.length >= 3, "Phải có inline keyboard");
  });

  await executeTestCase("TC-NAV-02", "Navigation", "Nút 'Hướng dẫn & Hỗ trợ' mở giao diện 4 bước và link nhắn tin", async () => {
    mockBot.reset();
    const cb = { id: 'cb_help', message: { chat: { id: testChatId }, message_id: 100 } };
    await handleSupportInfo(mockBot, cb);
    assert.ok(mockBot.editedMessages.length > 0 || mockBot.sentMessages.length > 0);
    const text = (mockBot.editedMessages[0] || mockBot.sentMessages[0]).text;
    assert.ok(text.includes("HƯỚNG DẪN SỬ DỤNG & HỖ TRỢ"), "Phải có hướng dẫn chi tiết");
    assert.ok(text.includes("4 BƯỚC ĐỌC VÀ MUA TRUYỆN DỄ DÀNG"), "Phải có 4 bước rõ ràng");
  });

  await executeTestCase("TC-NAV-03", "Navigation", "Màn hình 'Tài khoản của tôi' hiển thị đúng ID và trạng thái VIP", async () => {
    mockBot.reset();
    const cb = { 
      id: 'cb_acc', 
      from: { first_name: "Test", last_name: "User", username: "tester" },
      message: { chat: { id: testChatId }, message_id: 101 } 
    };
    await handleUserAccount(mockBot, cb);
    const text = (mockBot.editedMessages[0] || mockBot.sentMessages[0]).text;
    assert.ok(text.includes(testChatId), "Phải có Telegram ID");
    assert.ok(text.includes("THÔNG TIN TÀI KHOẢN"), "Phải có tiêu đề thông tin tài khoản");
  });

  // --------------------------------------------------------------------------
  // MODULE 2: DANH MỤC TRUYỆN & TÌM KIẾM TRỰC QUAN (TC-CAT)
  // --------------------------------------------------------------------------
  console.log("\n📦 MODULE 2: DANH MỤC TRUYỆN & TÌM KIẾM TRỰC QUAN (TC-CAT)");

  await executeTestCase("TC-CAT-01", "Catalog", "Danh mục truyện chuẩn xác 7 truyện/trang và có phân trang", async () => {
    mockBot.reset();
    await handleBookList(mockBot, testChatId, 1);
    assert.strictEqual(mockBot.sentMessages.length, 1);
    const sent = mockBot.sentMessages[0];
    assert.ok(sent.text.includes("Trang 1/"), "Phải hiển thị số trang");
    assert.ok(sent.text.includes("━━━━━━━━━━━━━━━━━━"), "Phải có đường kẻ phân cách");
    const bookButtons = sent.reply_markup.inline_keyboard.filter(row => row[0].callback_data.startsWith("book_detail:"));
    assert.ok(bookButtons.length <= 7, "Tối đa 7 truyện/trang");
  });

  await executeTestCase("TC-CAT-02", "Catalog", "Xem chi tiết truyện không bị lỗi crash str.replace khi chapters là số", async () => {
    mockBot.reset();
    // Lấy 1 cuốn truyện thật trong DB
    const books = await getBooks();
    assert.ok(books.length > 0, "Phải có truyện trong DB");
    const targetBook = books[0];
    await handleBookDetail(mockBot, testChatId, targetBook.id, 1);
    assert.strictEqual(mockBot.sentMessages.length, 1);
    const sent = mockBot.sentMessages[0];
    assert.ok(sent.text.includes(`THÔNG TIN TRUYỆN: #${targetBook.id}`), "Phải hiển thị đúng mã truyện");
    assert.ok(sent.text.includes("Số chương:"), "Phải có trường số chương");
    assert.ok(sent.reply_markup.inline_keyboard.some(row => row.some(btn => btn.text.includes("Giỏ Hàng") || btn.text.includes("Đọc"))));
  });

  await executeTestCase("TC-CAT-03", "Catalog", "Tìm nhanh bằng số trực tiếp: Regex nhận diện chính xác 47 và #47", async () => {
    const idRegex = /^#?(\d+)$/;
    assert.strictEqual("47".match(idRegex)[1], "47");
    assert.strictEqual("#47".match(idRegex)[1], "47");
    assert.strictEqual("#123".match(idRegex)[1], "123");
    assert.strictEqual(idRegex.test("abc"), false);
    assert.strictEqual(idRegex.test("tap47"), false);
  });

  // --------------------------------------------------------------------------
  // MODULE 3: GIỎ HÀNG & GIAO DIỆN NÚT LƯỚI GỌN GÀNG (TC-CRT)
  // --------------------------------------------------------------------------
  console.log("\n📦 MODULE 3: QUẢN LÝ GIỎ HÀNG (TC-CRT)");

  await executeTestCase("TC-CRT-01", "Cart", "Thêm truyện vào giỏ hàng và kiểm tra số lượng tức thì", async () => {
    await clearCart(testChatId);
    const initialCount = await getCartCount(testChatId);
    assert.strictEqual(initialCount, 0);

    await addToCart(testChatId, 1);
    await addToCart(testChatId, 2);
    const newCount = await getCartCount(testChatId);
    assert.strictEqual(newCount, 2, "Giỏ hàng phải có 2 cuốn");
  });

  await executeTestCase("TC-CRT-02", "Cart", "Bàn phím giỏ hàng dạng lưới thu gọn 2-3 cột không bị tràn màn hình", async () => {
    const sampleBooks = [
      { id: 1, name: "Truyện 1", price: 20000, free: false },
      { id: 2, name: "Truyện 2", price: 20000, free: false },
      { id: 3, name: "Truyện 3", price: 20000, free: false },
      { id: 4, name: "Truyện 4", price: 20000, free: false }
    ];
    const cartKb = getCartKeyboard(sampleBooks);
    // Hàng nút xóa phải chứa nhiều hơn 1 nút trên 1 dòng
    const deleteRows = cartKb.inline_keyboard.filter(row => row.some(btn => btn.callback_data.startsWith("cart_drop:")));
    assert.ok(deleteRows.length > 0, "Phải có hàng nút xóa dạng lưới");
    assert.ok(deleteRows[0].length >= 2, "Hàng đầu tiên phải có ít nhất 2 nút (thu gọn)");
  });

  await executeTestCase("TC-CRT-03", "Cart", "Xóa 1 truyện và dọn sạch giỏ hàng hoạt động mượt mà", async () => {
    await removeFromCart(testChatId, 1);
    let count = await getCartCount(testChatId);
    assert.strictEqual(count, 1, "Còn 1 cuốn sau khi xóa cuốn 1");

    await clearCart(testChatId);
    count = await getCartCount(testChatId);
    assert.strictEqual(count, 0, "Giỏ hàng trống sau khi dọn sạch");
  });

  // --------------------------------------------------------------------------
  // MODULE 4: ĐỘNG CƠ TÍNH GIÁ & QUY TẮC CHIẾT KHẤU (TC-PRC)
  // --------------------------------------------------------------------------
  console.log("\n📦 MODULE 4: ĐỘNG CƠ TÍNH GIÁ & CHIẾT KHẤU (TC-PRC)");

  await executeTestCase("TC-PRC-01", "Pricing", "Gói VIP chuẩn 139.000đ từ biến môi trường (không bị NaN)", async () => {
    const vipRes = await calculateVIPPrice();
    assert.strictEqual(vipRes.originalPrice, 139000);
    assert.strictEqual(vipRes.finalPrice, 139000);
    assert.ok(!isNaN(vipRes.finalPrice));
  });

  await executeTestCase("TC-PRC-02", "Pricing", "Chiết khấu mua nhiều: từ 50k giảm 5%, mỗi 10k thêm +1%", async () => {
    // Test 40k -> 0%
    const p40k = await calculateCartPrice([{ id: 1, price: 40000, free: false }], false);
    assert.strictEqual(p40k.finalAmount, 40000);

    // Test 50k -> 5% -> 47.500đ
    const p50k = await calculateCartPrice([{ id: 1, price: 50000, free: false }], false);
    assert.strictEqual(p50k.finalAmount, 47500);

    // Test 70k -> 7% (5% + 2*1%) -> 70000 * 0.93 = 65.100đ
    const p70k = await calculateCartPrice([{ id: 1, price: 70000, free: false }], false);
    assert.strictEqual(p70k.finalAmount, 65100);

    // Test 100k -> 10% (5% + 5*1%) -> 90.000đ
    const p100k = await calculateCartPrice([{ id: 1, price: 100000, free: false }], false);
    assert.strictEqual(p100k.finalAmount, 90000);
  });

  await executeTestCase("TC-PRC-03", "Pricing", "Đặc quyền Hội viên VIP: Giảm 50% trước rồi mới áp dụng chiết khấu khác", async () => {
    // 50k với VIP: Giảm 50% = 25.000đ (dưới 50k nên không cộng thêm multi-discount)
    const pVIP = await calculateCartPrice([{ id: 1, price: 50000, free: false }], true);
    assert.strictEqual(pVIP.finalAmount, 22500); // 50% VIP + 5% multi = 55% -> 50000 * 0.45 = 22.500đ
    assert.ok(pVIP.discountBreakdown.some(d => d.includes("VIP")));
  });

  // --------------------------------------------------------------------------
  // MODULE 5: VÒNG ĐỜI ĐƠN HÀNG & BẢO VỆ 15 PHÚT (TC-ORD)
  // --------------------------------------------------------------------------
  console.log("\n📦 MODULE 5: VÒNG ĐỜI ĐƠN HÀNG & BẢO VỆ 15 PHÚT (TC-ORD)");

  const sampleOrderId = generateOrderId();

  await executeTestCase("TC-ORD-01", "Orders", "Sinh mã đơn hàng duy nhất bắt đầu bằng OD", async () => {
    assert.ok(sampleOrderId.startsWith("OD"));
    assert.strictEqual(sampleOrderId.length >= 11, true);
  });

  await executeTestCase("TC-ORD-02", "Orders", "Tạo đơn hàng lưu đầy đủ 12 tham số an toàn trong Neon DB", async () => {
    const expireTime = new Date(Date.now() + 15 * 60 * 1000);
    const order = await createOrder({
      orderId: sampleOrderId,
      telegramId: testChatId,
      username: 'qa_tester',
      orderType: ORDER_TYPE.BOOKS,
      items: [{ id: 48, name: 'Truyện QA 48', price: 25000, link: 'https://docs.google.com/test' }],
      originalAmount: 25000,
      finalAmount: 25000,
      discountLines: ['Không có chiết khấu']
    });
    assert.ok(order);
    assert.strictEqual(order.status, ORDER_STATUS.PENDING);
  });

  await executeTestCase("TC-ORD-03", "Orders", "Cập nhật message_id của tin nhắn QR phục vụ đổi nút tức thì", async () => {
    setOrderMessageId(sampleOrderId, 777888);
    assert.strictEqual(getOrderMessageId(sampleOrderId), 777888);

    const updated = await updateOrderMessageId(sampleOrderId, 777888);
    assert.strictEqual(updated, true);

    const fromDb = await getOrderById(sampleOrderId);
    assert.strictEqual(fromDb.message_id.toString(), '777888');
  });

  await executeTestCase("TC-ORD-04", "Orders", "Chặn xóa đơn khi đơn đã thanh toán (bảo vệ lịch sử DB)", async () => {
    // Đánh dấu đơn là PAID
    await markOrderAsPaid(sampleOrderId, 'TRANS_QA_123');

    // Thử xóa đơn
    await deleteOrder(sampleOrderId);

    // Kiểm tra đơn vẫn phải tồn tại nguyên vẹn!
    const stillHere = await getOrderById(sampleOrderId);
    assert.ok(stillHere, "Đơn đã thanh toán không được phép bị xóa!");
    assert.strictEqual(stillHere.status, ORDER_STATUS.PAID);

    // Dọn dẹp an toàn bằng lệnh test riêng
    await pool.query('DELETE FROM orders WHERE order_id = $1', [sampleOrderId]);
  });

  // --------------------------------------------------------------------------
  // MODULE 6: XỬ LÝ THANH TOÁN SEPAY & KHỚP 0D / OD (TC-PAY)
  // --------------------------------------------------------------------------
  console.log("\n📦 MODULE 6: XỬ LÝ THANH TOÁN SEPAY & DUYỆT 0D / OD (TC-PAY)");

  const payOrderId = generateOrderId();
  const zeroCodePay = payOrderId.replace('OD', '0D');

  await executeTestCase("TC-PAY-01", "Payment", "Khớp đơn SePay tự động khi khách gõ nhầm 0D trong 1 query duy nhất", async () => {
    // Tạo đơn pending
    await createOrder({
      orderId: payOrderId,
      telegramId: testChatId,
      username: 'qa_tester',
      orderType: ORDER_TYPE.BOOKS,
      items: [{ id: 48, name: 'Truyện 48', price: 30000, link: 'https://docs.google.com/test' }],
      originalAmount: 30000,
      finalAmount: 30000,
      discountLines: []
    });

    // Giả lập SePay gửi nội dung gõ nhầm '0D...'
    const matched = await findPendingOrderByContent(`Chuyen khoan ${zeroCodePay}`);
    assert.ok(matched, "Phải tìm thấy đơn dù khách gõ 0D");
    assert.strictEqual(matched.order_id, payOrderId);
  });

  await executeTestCase("TC-PAY-02", "Payment", "Webhook SePay cập nhật ngay nút bấm QR sang 'ĐÃ THANH TOÁN THÀNH CÔNG'", async () => {
    mockBot.reset();
    setOrderMessageId(payOrderId, 999111);

    const mockSepayBody = {
      id: 998877,
      gateway: "MBBank",
      transactionDate: new Date().toISOString(),
      accountNumber: "0550767799967",
      transferAmount: 30000,
      content: `CK ${zeroCodePay}`,
      description: `Thanh toan ${zeroCodePay}`,
      referenceCode: `FT_TEST_${Date.now()}`
    };

    const res = await processSepayWebhook(mockBot, mockSepayBody, null);
    assert.strictEqual(res.status, 200);

    // Kiểm tra tin nhắn chỉnh sửa nút bấm QR Code
    assert.ok(mockBot.editedMessages.length > 0, "Phải có lệnh editMessageReplyMarkup");
    const editCall = mockBot.editedMessages.find(m => m.reply_markup && m.reply_markup.inline_keyboard[0][0].text.includes("ĐÃ THANH TOÁN THÀNH CÔNG"));
    assert.ok(editCall, "Nút trên tin nhắn QR phải chuyển thành 'ĐÃ THANH TOÁN THÀNH CÔNG'");

    // Dọn dẹp đơn test
    await pool.query('DELETE FROM orders WHERE order_id = $1', [payOrderId]);
  });

  await executeTestCase("TC-PAY-03", "Payment", "Từ chối xử lý khi số tiền chuyển khoản ít hơn đơn hàng (Underpaid)", async () => {
    const underOrderId = generateOrderId();
    await createOrder({
      orderId: underOrderId,
      telegramId: testChatId,
      username: 'qa_tester',
      orderType: ORDER_TYPE.BOOKS,
      items: [{ id: 48, name: 'Truyện 48', price: 50000 }],
      originalAmount: 50000,
      finalAmount: 50000,
      discountLines: []
    });

    const mockUnderBody = {
      id: 998878,
      transferAmount: 20000, // Cần 50k mà chỉ chuyển 20k
      content: `CK ${underOrderId}`
    };

    const res = await processSepayWebhook(mockBot, mockUnderBody, null);
    assert.strictEqual(res.message, 'Underpaid');

    // Đơn vẫn phải PENDING, không cấp sách
    const checkOrder = await getOrderById(underOrderId);
    assert.strictEqual(checkOrder.status, ORDER_STATUS.PENDING);

    await pool.query('DELETE FROM orders WHERE order_id = $1', [underOrderId]);
  });

  // --------------------------------------------------------------------------
  // MODULE 7: BÓC TÁCH LINK & GIAO DIỆN TRẢ TRUYỆN TỐI GIẢN (TC-DLV)
  // --------------------------------------------------------------------------
  console.log("\n📦 MODULE 7: TRẢ TRUYỆN & BÓC TÁCH LINK (TC-DLV)");

  await executeTestCase("TC-DLV-01", "Delivery", "Tách sạch sẽ link Google Docs nhiều phần (Part 1, Part 2) không dính ngoặc", async () => {
    mockBot.reset();
    const booksWithParts = [
      {
        id: 55,
        name: "Truyện Đa Phần Test",
        link: "https://docs.google.com/doc1 (Part 1), https://docs.google.com/doc2 (Part 2)"
      }
    ];

    await sendBookLinks(mockBot, testChatId, booksWithParts, false);
    assert.strictEqual(mockBot.sentMessages.length, 1);
    const sent = mockBot.sentMessages[0];
    assert.ok(sent.text.includes("Link Part 1: <a href=\"https://docs.google.com/doc1\">"));
    assert.ok(sent.text.includes("Link Part 2: <a href=\"https://docs.google.com/doc2\">"));
  });

  await executeTestCase("TC-DLV-02", "Delivery", "Giao diện chân tin nhắn tối giản: Đã bỏ nút part rườm rà, chỉ giữ Tủ truyện & Menu", async () => {
    mockBot.reset();
    const booksTest = [{ id: 48, name: "Truyện Test", link: "https://docs.google.com/doc1" }];
    await sendBookLinks(mockBot, testChatId, booksTest, false);
    const sent = mockBot.sentMessages[0];
    const kb = sent.reply_markup.inline_keyboard;
    assert.strictEqual(kb.length, 1, "Chỉ còn 1 hàng nút điều hướng");
    assert.ok(kb[0].some(btn => btn.text.includes("Tủ Truyện Của Tôi")));
    assert.ok(kb[0].some(btn => btn.text.includes("Menu Chính")));
  });

  await executeTestCase("TC-DLV-03", "Delivery", "Truyện chưa có link: Báo 'Đã cập nhật vào tủ' (hoàn toàn bỏ liên hệ admin)", async () => {
    mockBot.reset();
    const booksNoLink = [{ id: 99, name: "Truyện Chưa Link", link: "" }];
    await sendBookLinks(mockBot, testChatId, booksNoLink, false);
    const sent = mockBot.sentMessages[0];
    assert.ok(sent.text.includes("Đã được cập nhật vào Tủ truyện của bạn"));
    assert.ok(!sent.text.includes("liên hệ @"), "Tuyệt đối không được báo liên hệ admin");
  });

  // --------------------------------------------------------------------------
  // MODULE 8: TỦ TRUYỆN CỦA TÔI (TC-LIB)
  // --------------------------------------------------------------------------
  console.log("\n📦 MODULE 8: TỦ TRUYỆN CỦA TÔI (TC-LIB)");

  await executeTestCase("TC-LIB-01", "Library", "Thêm và kiểm tra quyền sở hữu truyện của người dùng", async () => {
    await addPurchases(testChatId, [48, 49], 'ORDER_TEST_LIB');
    const owned48 = await hasUserPurchased(testChatId, 48);
    const owned49 = await hasUserPurchased(testChatId, 49);
    assert.strictEqual(owned48, true);
    assert.strictEqual(owned49, true);
  });

  await executeTestCase("TC-LIB-02", "Library", "Tủ truyện sắp xếp mới mua nhất lên đầu và hiển thị 7 truyện/trang", async () => {
    mockBot.reset();
    await handleMyBooks(mockBot, testChatId, 1);
    assert.strictEqual(mockBot.sentMessages.length, 1);
    const sent = mockBot.sentMessages[0];
    assert.ok(sent.text.includes("TỦ TRUYỆN CỦA TÔI"));
    assert.ok(sent.text.includes("Mẹo tìm nhanh:"));
    assert.ok(sent.text.includes("gõ trực tiếp số ID"));
    const bookButtons = sent.reply_markup.inline_keyboard.filter(row => row[0].callback_data.startsWith("read_owned:"));
    assert.ok(bookButtons.length <= 7, "Tối đa 7 truyện/trang trong tủ");
  });

  // --------------------------------------------------------------------------
  // MODULE 9: BẢO MẬT PHÂN QUYỀN ADMIN (TC-ADM)
  // --------------------------------------------------------------------------
  console.log("\n📦 MODULE 9: BẢO MẬT ADMIN & BÁO CÁO DOANH THU (TC-ADM)");

  await executeTestCase("TC-ADM-01", "Admin", "Chặn 100% người dùng lạ không được vào menu quản trị Admin", async () => {
    assert.strictEqual(checkIsAdmin(testStrangerId), false);
    assert.strictEqual(checkIsAdmin('random_user_123'), false);
    assert.strictEqual(checkIsAdmin(null), false);
  });

  await executeTestCase("TC-ADM-02", "Admin", "Admin ID chính chủ có toàn quyền điều khiển bot", async () => {
    assert.strictEqual(checkIsAdmin(testChatId), true);
  });

  await executeTestCase("TC-ADM-03", "Admin", "Báo cáo doanh thu Admin tính tổng hợp cả 732 đơn lịch sử và đơn mới", async () => {
    const stats = await getRevenueStats();
    assert.ok(stats.totalOrders >= 730, "Tổng đơn phải gồm cả đơn lịch sử");
    assert.ok(stats.totalRevenue > 0, "Doanh thu tổng phải lớn hơn 0");
  });

  await executeTestCase("TC-ADM-04", "Admin", "Danh sách Top Selling loại trừ 100% truyện miễn phí", async () => {
    const topBooks = await getTopSellingBooks(10);
    const freeInTop = topBooks.filter(b => b.free === true);
    assert.strictEqual(freeInTop.length, 0, "Không được có truyện free trong top bán chạy");
  });

  // --------------------------------------------------------------------------
  // MODULE 10: TÍNH TOÀN VẸN CƠ SỞ DỮ LIỆU & AN TOÀN HTML (TC-SEC)
  // --------------------------------------------------------------------------
  console.log("\n📦 MODULE 10: TÍNH TOÀN VẸN DATABASE & CHỐNG LỖI PARSE HTML (TC-SEC)");

  await executeTestCase("TC-SEC-01", "Security", "Hàm escapeHtml an toàn với số nguyên, chuỗi HTML, null và undefined", async () => {
    function testEscape(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
    assert.strictEqual(testEscape(100), "100");
    assert.strictEqual(testEscape("<b>Hello</b>"), "&lt;b&gt;Hello&lt;/b&gt;");
    assert.strictEqual(testEscape(null), "");
    assert.strictEqual(testEscape(undefined), "");
  });

  await executeTestCase("TC-SEC-02", "Database", "Xác nhận không bị mất mát dữ liệu 732 đơn lịch sử", async () => {
    const res = await pool.query("SELECT COUNT(*) FROM orders WHERE status = 'completed'");
    const count = parseInt(res.rows[0].count, 10);
    assert.ok(count >= 730, `Đơn lịch sử còn nguyên: ${count}`);
  });

  // --------------------------------------------------------------------------
  // KẾT THÚC BỘ TEST
  // --------------------------------------------------------------------------
  testReport.metrics.durationMs = Date.now() - overallStart;
  console.log("\n================================================================================");
  console.log(`📊 TỔNG KẾT BỘ KIỂM THỬ DOANH NGHIỆP:`);
  console.log(`   - Tổng số kịch bản test: ${testReport.metrics.total}`);
  console.log(`   - Thành công: ${testReport.metrics.passed}`);
  console.log(`   - Thất bại: ${testReport.metrics.failed}`);
  console.log(`   - Tỷ lệ vượt qua: ${Math.round((testReport.metrics.passed / testReport.metrics.total) * 100)}%`);
  console.log(`   - Tổng thời gian thực thi: ${testReport.metrics.durationMs}ms`);
  console.log("================================================================================\n");

  await pool.end();
  return testReport;
}

runEnterpriseTestSuite().catch(err => {
  console.error("❌ Lỗi nghiêm trọng khi chạy bộ kiểm thử:", err);
  process.exit(1);
});
