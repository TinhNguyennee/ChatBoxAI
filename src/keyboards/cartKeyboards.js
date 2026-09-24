/**
 * Bàn phím thao tác trong Giỏ hàng
 */
function getCartKeyboard(cartItems) {
  const keyboard = [];

  // Nút xóa từng truyện nếu có trong giỏ
  if (cartItems.length > 0) {
    cartItems.forEach((book) => {
      const shortName = book.name.length > 20 ? book.name.substring(0, 18) + '...' : book.name;
      keyboard.push([
        { text: `❌ Bỏ: #${book.id}. ${shortName}`, callback_data: `cart_drop:${book.id}` }
      ]);
    });

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
