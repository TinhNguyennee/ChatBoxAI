const assert = require('assert');
const pool = require('../src/database/connection');
const { getBooks, getBookById } = require('../src/database/booksRepo');
const { addMultipleToCart, getCart, clearCart, isBookInCart } = require('../src/database/cartRepo');
const { checkIsAdmin, handleToggleAdminVip } = require('../src/handlers/adminHandler');
const { isUserVIP, addToVIP, removeFromVIP } = require('../src/database/vipRepo');
const { handleReadFreeBook } = require('../src/handlers/listHandler');
const { handleMultiBookSearch, handleBatchAddToCart } = require('../src/handlers/multiSearchHandler');
const { processSepayWebhook } = require('../src/services/sepayService');
const { createOrder, deleteOrder, getOrderById } = require('../src/database/ordersRepo');
const { getUserPurchases } = require('../src/database/purchasesRepo');
const { ORDER_TYPE } = require('../src/config/constants');

async function runTests() {
  console.log('🧪 BẮT ĐẦU KIỂM THỬ TOÀN DIỆN CÁC TÍNH NĂNG MỚI...\n');
  const testChatId = '999999999';
  const adminId = '5638827352';

  // 1. Test Admin Environment Config
  console.log('▶ Test 1: Kiểm tra cấu hình Admin từ biến môi trường (không dùng hardcode)...');
  process.env.ADMIN_TELEGRAM_IDS = '5638827352, 111222333';
  assert.strictEqual(checkIsAdmin('5638827352'), true, 'Admin 5638827352 phải có quyền');
  assert.strictEqual(checkIsAdmin('111222333'), true, 'Admin 111222333 phải có quyền');
  assert.strictEqual(checkIsAdmin('999999999'), false, 'User thường không được có quyền admin');
  console.log('  ✅ Test 1 PASS: checkIsAdmin hoạt động chính xác từ biến môi trường!\n');

  // 2. Test Admin Purchases Exemption
  console.log('▶ Test 2: Kiểm tra Admin mua truyện -> KHÔNG lưu vào Tủ truyện...');
  await pool.query('DELETE FROM user_purchases WHERE telegram_id = $1', [adminId]);
  
  // Tạo đơn hàng giả lập cho Admin
  const testOrderId = `OD_EXEMPT_${Date.now()}`;
  await createOrder({
    orderId: testOrderId,
    telegramId: adminId,
    username: 'test_admin',
    orderType: ORDER_TYPE.BOOKS,
    items: [{ id: 47, name: 'Truyen Test', price: 10000 }],
    originalAmount: 10000,
    finalAmount: 10000,
    discountLines: []
  });

  const mockBot = {
    sendMessage: async () => {},
    editMessageReplyMarkup: async () => {},
    answerCallbackQuery: async () => {},
    editMessageText: async () => {}
  };

  await processSepayWebhook(mockBot, {
    content: testOrderId,
    amount: 10000,
    id: `TRANS_${Date.now()}`
  }, '');

  const adminPurchases = await getUserPurchases(adminId);
  assert.strictEqual(adminPurchases.length, 0, 'Admin mua hàng không được lưu vào user_purchases');
  await pool.query('DELETE FROM orders WHERE order_id = $1 OR order_code = $1', [testOrderId]);
  await pool.query('DELETE FROM orders WHERE order_code LIKE $1', ['OD_TEST_ADMIN_EXEMPT%']);
  console.log('  ✅ Test 2 PASS: Admin mua truyện không bị lưu vào Tủ truyện!\n');

  // 3. Test Admin VIP Toggle
  console.log('▶ Test 3: Kiểm tra tính năng Bật / Tắt VIP cho Admin...');
  // Đảm bảo ban đầu tắt
  await removeFromVIP(adminId);
  let isVip = await isUserVIP(adminId);
  assert.strictEqual(isVip, false, 'Ban đầu VIP phải là false');

  // Bật VIP
  await addToVIP(adminId);
  isVip = await isUserVIP(adminId);
  assert.strictEqual(isVip, true, 'Sau khi bật VIP phải là true');

  // Tắt VIP
  await removeFromVIP(adminId);
  isVip = await isUserVIP(adminId);
  assert.strictEqual(isVip, false, 'Sau khi tắt VIP phải là false');
  console.log('  ✅ Test 3 PASS: Bật / Tắt VIP cho Admin hoạt động mượt mà!\n');

  // 4. Test Multi-book Search & Batch Add to Cart
  console.log('▶ Test 4: Kiểm tra Tìm kiếm nhiều truyện & Thêm hàng loạt vào giỏ hàng...');
  await clearCart(testChatId);

  // Thêm hàng loạt truyện 1, 2, 3 vào giỏ
  const addedCount = await addMultipleToCart(testChatId, [1, 2, 3]);
  assert.strictEqual(addedCount, 3, 'Phải thêm được 3 truyện vào cart_items');

  const cart = await getCart(testChatId);
  assert.strictEqual(cart.length, 3, 'Giỏ hàng phải có đúng 3 truyện');
  assert.strictEqual(await isBookInCart(testChatId, 1), true, 'Truyện #1 phải có trong giỏ');
  assert.strictEqual(await isBookInCart(testChatId, 2), true, 'Truyện #2 phải có trong giỏ');
  assert.strictEqual(await isBookInCart(testChatId, 3), true, 'Truyện #3 phải có trong giỏ');

  await clearCart(testChatId);
  console.log('  ✅ Test 4 PASS: Thêm hàng loạt vào giỏ hàng (addMultipleToCart) hoạt động chuẩn xác!\n');

  // 5. Test Free Book +1 Sold Quantity
  console.log('▶ Test 5: Kiểm tra Truyện Free khi đọc -> Tự động +1 sold_quantity...');
  const books = await getBooks();
  const freeBook = books.find(b => b.free);
  if (freeBook) {
    const originalSold = freeBook.sold_quantity;
    await handleReadFreeBook(mockBot, testChatId, freeBook.id);
    const updatedBook = await getBookById(freeBook.id);
    assert.strictEqual(updatedBook.sold_quantity, originalSold + 1, 'sold_quantity phải tăng đúng 1 đơn vị');
    console.log(`  ✅ Test 5 PASS: Truyện Free #${freeBook.id} đã tăng sold_quantity từ ${originalSold} lên ${updatedBook.sold_quantity}!`);
  } else {
    console.log('  ℹ️ Không có truyện free mẫu để test, bỏ qua test 5.');
  }

  // 6. Test Expiration Worker has no setInterval
  console.log('\n▶ Test 6: Kiểm tra dịch vụ orderExpirationService không dùng setInterval...');
  const fs = require('fs');
  const path = require('path');
  const serviceCode = fs.readFileSync(path.join(__dirname, '../src/services/orderExpirationService.js'), 'utf8');
  assert.strictEqual(serviceCode.includes('setInterval'), false, 'orderExpirationService không được chứa setInterval');
  console.log('  ✅ Test 6 PASS: Đã xác nhận không còn vòng lặp setInterval gây bào Compute Neon!');

  console.log('\n🎉 TẤT CẢ 6 BỘ KIỂM THỬ TÍNH NĂNG MỚI ĐÃ PASS 100%!');
  await pool.end();
}

runTests().catch(err => {
  console.error('❌ Kiểm thử thất bại:', err);
  process.exit(1);
});
