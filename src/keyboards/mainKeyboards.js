/**
 * Tạo bàn phím menu chính điều hướng cho người dùng
 */
function getMainMenuKeyboard(cartCount = 0, isVIP = false, isAdmin = false) {
  const keyboard = [
    [
      { text: "📚 Xem Danh Sách Truyện", callback_data: "nav_list:1" },
      { text: `🛒 Giỏ Hàng (${cartCount})`, callback_data: "view_cart" }
    ],
    [
      { text: "📖 Tủ Truyện Của Tôi", callback_data: "my_books:1" },
      isVIP 
        ? { text: "💎 Đặc Quyền VIP", callback_data: "vip_info" }
        : { text: "💎 Mua VIP (139k)", callback_data: "buy_vip" }
    ],
    [
      { text: "👤 Tài Khoản Của Tôi", callback_data: "user_account" },
      { text: "💬 Hướng Dẫn & Hỗ Trợ", callback_data: "support_info" }
    ]
  ];

  if (isAdmin) {
    keyboard.push([
      { text: "👑 Bảng Điều Khiển Admin", callback_data: "admin_dashboard" }
    ]);
  }

  return { inline_keyboard: keyboard };
}

module.exports = {
  getMainMenuKeyboard
};
