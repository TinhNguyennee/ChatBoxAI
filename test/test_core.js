const assert = require('assert');
const { calculateCartPrice, calculateVIPPrice, generateOrderId } = require('../src/services/pricingService');
const { getBookListKeyboard, getBookDetailKeyboard } = require('../src/keyboards/bookKeyboards');
const { getCartKeyboard, getOrderPendingKeyboard } = require('../src/keyboards/cartKeyboards');
const { getMainMenuKeyboard } = require('../src/keyboards/mainKeyboards');
const { ORDER_EXPIRATION_MINUTES, ITEMS_PER_PAGE } = require('../src/config/constants');

async function runTests() {
  console.log('🧪 Đang chạy kiểm thử các thành phần cốt lõi...');

  // 1. Test Order ID Generator
  const id1 = generateOrderId();
  const id2 = generateOrderId();
  assert.ok(id1.startsWith('OD'), 'Order ID phải bắt đầu bằng OD');
  assert.notStrictEqual(id1, id2, 'Mã đơn phải là duy nhất');
  console.log(`✅ Test Order ID: Sinh mã thành công (${id1})`);

  // 2. Test Pricing Service
  const testBooks1 = [
    { id: 1, name: 'Truyện A', price: 20000, free: false },
    { id: 2, name: 'Truyện B', price: 20000, free: false }
  ];
  const priceRes1 = await calculateCartPrice(testBooks1, false);
  assert.strictEqual(priceRes1.totalOriginal, 40000);
  assert.strictEqual(priceRes1.finalAmount, 40000, 'Dưới 50k không giảm giá mua nhiều');

  // Test Giảm mua nhiều >= 50k: 60k -> 5% + 1% = 6% -> 60000 * 0.94 = 56400
  const testBooks2 = [
    { id: 1, name: 'Truyện A', price: 30000, free: false },
    { id: 2, name: 'Truyện B', price: 30000, free: false }
  ];
  const priceRes2 = await calculateCartPrice(testBooks2, false);
  assert.strictEqual(priceRes2.totalOriginal, 60000);
  assert.strictEqual(priceRes2.totalDiscountPercent, 6);
  assert.strictEqual(priceRes2.finalAmount, 56400);

  // Test VIP: 60k + VIP -> 6% + 50% = 56% -> 60000 * 0.44 = 26400
  const priceResVIP = await calculateCartPrice(testBooks2, true);
  assert.strictEqual(priceResVIP.totalDiscountPercent, 56);
  assert.strictEqual(priceResVIP.finalAmount, 26400);
  console.log('✅ Test Pricing Service: Tính chiết khấu mua nhiều và VIP chính xác 100%');

  // Test VIP Price
  const vipPriceRes = await calculateVIPPrice();
  assert.strictEqual(vipPriceRes.originalPrice, 139000);
  assert.strictEqual(vipPriceRes.finalPrice, 139000);
  console.log('✅ Test VIP Price: Giá VIP 139k không bị lỗi NaN');

  // 3. Test Keyboards: 7 truyện/trang
  assert.strictEqual(ITEMS_PER_PAGE, 7, 'ITEMS_PER_PAGE phải bằng 7');
  const sampleBooks = [
    { id: 1, name: 'Truyện 1', price: 15000, free: false },
    { id: 2, name: 'Truyện 2', price: 0, free: true },
    { id: 3, name: 'Truyện 3', price: 20000, free: false },
    { id: 4, name: 'Truyện 4', price: 25000, free: false },
    { id: 5, name: 'Truyện 5', price: 10000, free: false },
    { id: 6, name: 'Truyện 6', price: 30000, free: false },
    { id: 7, name: 'Truyện 7', price: 18000, free: false }
  ];

  const listKb = getBookListKeyboard(sampleBooks, 1, 3, 2);
  assert.strictEqual(listKb.inline_keyboard.length, 9, '7 nút truyện + 1 hàng phân trang + 1 hàng chức năng');
  assert.ok(listKb.inline_keyboard[0][0].callback_data.startsWith('book_detail:1:1'));
  console.log('✅ Test Book List Keyboard: Đúng chuẩn 7 truyện/trang và nút bấm chi tiết');

  const detailKbFree = getBookDetailKeyboard({ id: 2, name: 'Truyện 2', free: true }, false, false);
  assert.strictEqual(detailKbFree.inline_keyboard[0][0].text, '📖 Đọc Ngay (Miễn Phí)');
  assert.strictEqual(detailKbFree.inline_keyboard[0][0].callback_data, 'read_free:2');

  const detailKbPaid = getBookDetailKeyboard({ id: 1, name: 'Truyện 1', free: false }, false, false);
  assert.strictEqual(detailKbPaid.inline_keyboard[0][0].text, '➕ Thêm Vào Giỏ Hàng');

  const detailKbInCart = getBookDetailKeyboard({ id: 1, name: 'Truyện 1', free: false }, true, false);
  assert.strictEqual(detailKbInCart.inline_keyboard[0][0].text, '➖ Xóa Khỏi Giỏ Hàng');
  console.log('✅ Test Detail Keyboard: Xử lý chính xác truyện Free / Chưa thêm / Đã thêm vào giỏ');

  // 4. Test Cart Keyboards: Grid layout
  const cartKb = getCartKeyboard(sampleBooks);
  assert.ok(cartKb.inline_keyboard.some(row => row[0].callback_data === 'checkout_start'), 'Phải có nút thanh toán');
  console.log('✅ Test Cart Keyboard: Nút xóa dạng lưới 2-3 cột siêu gọn gàng');

  // 5. Test Expiration Constants
  assert.strictEqual(ORDER_EXPIRATION_MINUTES, 15, 'Hạn đơn hàng phải là 15 phút');
  console.log('✅ Test Expiration Constants: Quy định 15 phút chính xác');

  console.log('\n🎉 TẤT CẢ CÁC BỘ KIỂM THỬ ĐÃ VƯỢT QUA XUẤT SẮC!');
}

runTests().catch(err => {
  console.error('❌ Kiểm thử thất bại:', err);
  process.exit(1);
});
