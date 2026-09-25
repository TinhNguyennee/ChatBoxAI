const { DISCOUNT_RULES } = require('../config/constants');
const { VIP_PRICE } = require('../config/env');
const { getActiveEventDiscountPercent } = require('../database/eventsRepo');

/**
 * Tạo mã đơn hàng duy nhất, ngắn gọn, chống va chạm (OD + 6 số thời gian + 3 số ngẫu nhiên)
 */
function generateOrderId() {
  const timeSuffix = Date.now().toString().slice(-6);
  const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `OD${timeSuffix}${randomSuffix}`;
}

/**
 * Tính toán giá cuối cùng và chiết khấu cho danh sách truyện trong giỏ hàng
 */
async function calculateCartPrice(books, isVIP = false) {
  const paidBooks = books.filter(b => !b.free);
  const totalOriginal = paidBooks.reduce((sum, b) => sum + b.price, 0);

  if (totalOriginal <= 0) {
    return {
      totalOriginal: 0,
      finalAmount: 0,
      discountBreakdown: [],
      totalDiscountPercent: 0
    };
  }

  const discountBreakdown = [];
  const eventPercent = await getActiveEventDiscountPercent();

  // 1. Chiết khấu mua nhiều: từ 50k giảm 5%, mỗi 10k +1%, tối đa 39%
  let multiPercent = 0;
  if (totalOriginal >= DISCOUNT_RULES.MIN_AMOUNT_FOR_MULTI) {
    const extraSteps = Math.floor((totalOriginal - DISCOUNT_RULES.MIN_AMOUNT_FOR_MULTI) / DISCOUNT_RULES.STEP_AMOUNT);
    multiPercent = DISCOUNT_RULES.BASE_MULTI_PERCENT + extraSteps * DISCOUNT_RULES.STEP_PERCENT;
    if (multiPercent > DISCOUNT_RULES.MAX_MULTI_PERCENT) {
      multiPercent = DISCOUNT_RULES.MAX_MULTI_PERCENT;
    }
  }

  // 2. Chiết khấu hội viên VIP: 50%
  const vipPercent = isVIP ? DISCOUNT_RULES.VIP_PERCENT : 0;

  // 3. Tổng chiết khấu cộng dồn (tối đa 75%)
  let totalPercent = multiPercent + vipPercent + eventPercent;
  if (totalPercent > DISCOUNT_RULES.MAX_TOTAL_PERCENT) {
    totalPercent = DISCOUNT_RULES.MAX_TOTAL_PERCENT;
  }

  const finalAmount = Math.max(0, Math.floor(totalOriginal * (100 - totalPercent) / 100));
  const savedAmount = totalOriginal - finalAmount;

  if (multiPercent > 0) {
    discountBreakdown.push(`🎁 Giảm mua nhiều: ${multiPercent}%`);
  }
  if (vipPercent > 0) {
    discountBreakdown.push(`💎 Đặc quyền VIP: Giảm 50%`);
  }
  if (eventPercent > 0) {
    discountBreakdown.push(`🎉 Ưu đãi sự kiện: Giảm ${eventPercent}%`);
  }
  if (totalPercent > 0) {
    discountBreakdown.push(`✅ Tổng ưu đãi áp dụng: ${totalPercent}% (-${savedAmount.toLocaleString('vi-VN')}đ)`);
  }

  return {
    totalOriginal,
    finalAmount,
    discountBreakdown,
    totalDiscountPercent: totalPercent
  };
}

/**
 * Tính giá gói nâng cấp VIP
 */
async function calculateVIPPrice() {
  const basePrice = VIP_PRICE || 139000;
  const eventPercent = await getActiveEventDiscountPercent();
  let finalPrice = basePrice;
  const discountLines = [];

  if (eventPercent > 0) {
    const discount = Math.floor(basePrice * eventPercent / 100);
    finalPrice = basePrice - discount;
    discountLines.push(`🎉 Giảm sự kiện ${eventPercent}%: -${discount.toLocaleString('vi-VN')}đ`);
  }

  return {
    originalPrice: basePrice,
    finalPrice: Math.max(0, finalPrice),
    eventPercent,
    discountLines
  };
}

module.exports = {
  generateOrderId,
  calculateCartPrice,
  calculateVIPPrice
};
