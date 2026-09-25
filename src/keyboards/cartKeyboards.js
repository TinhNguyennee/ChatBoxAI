/**
 * Bàn phím thao tác trong Giỏ hàng (Sắp xếp dạng lưới 2-3 cột siêu gọn gàng, chống tràn màn hình)
 */
function getCartKeyboard(cartItems) {
  const keyboard = [];

  if (cartItems.length > 0) {
    // Nhóm các nút xóa truyện thành hàng 2 hoặc 3 nút ngắn gọn
    const ITEMS_PER_ROW = cartItems.length > 6 ? 3 : 2;
    for (let i = 0; i < cartItems.length; i += ITEMS_PER_ROW) {
      const row = [];
      for (let j = i; j < Math.min(i + ITEMS_PER_ROW, cartItems.length); j++) {
        const book = cartItems[j];
        const shortName = book.name.length > 10 ? book.name.substring(0, 9) + '..' : book.name;
        const btnText = ITEMS_PER_ROW === 3 ? `❌ #${book.id}` : `❌ #${book.id} ${shortName}`;
        row.push({
          text: btnText,
          callback_data: `cart_drop:${book.id}`
        });
      }
      keyboard.push(row);
    }

    // Nút thanh toán nổi bật
    keyboard.push([
      { text: "💳 TIẾN HÀNH THANH TOÁN", callback_data: "checkout_start" }
    ]);

    // Hàng nút phụ: xóa hết giỏ / chọn thêm truyện
    keyboard.push([
      { text: "🗑 Xóa Hết Giỏ", callback_data: "cart_clear" },
      { text: "📚 Chọn Thêm Truyện", callback_data: "nav_list:1" }
    ]);
  } else {
    // Nếu giỏ trống
    keyboard.push([
      { text: "📚 Xem Danh Sách Truyện Ngay", callback_data: "nav_list:1" }
    ]);
  }

  // Hàng về Menu chính
  keyboard.push([
    { text: "🏠 Menu Chính", callback_data: "nav_main" }
  ]);

  return { inline_keyboard: keyboard };
}

/**
 * Bàn phím trên tin nhắn QR thanh toán
 */
function getOrderPendingKeyboard(orderId) {
  return {
    inline_keyboard: [
      [
        { text: "🔄 Kiểm Tra Thanh Toán", callback_data: `order_check:${orderId}` },
        { text: "❌ Hủy Đơn", callback_data: `order_cancel:${orderId}` }
      ],
      [
        { text: "🏠 Menu Chính", callback_data: "nav_main" }
      ]
    ]
  };
}

module.exports = {
  getCartKeyboard,
  getOrderPendingKeyboard
};
