/**
 * Bàn phím bảng điều khiển Quản trị viên (Admin Dashboard)
 */
function getAdminDashboardKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "📊 Báo Cáo Doanh Thu", callback_data: "admin_stats" },
        { text: "🏷 Quản Lý Sự Kiện Sale", callback_data: "admin_event" }
      ],
      [
        { text: "💎 Cấp / Thu Hồi VIP", callback_data: "admin_vip_prompt" },
        { text: "📢 Broadcast Tin Nhắn", callback_data: "admin_broadcast_prompt" }
      ],
      [
        { text: "🔄 Làm Mới Kho Truyện (Xóa Cache)", callback_data: "admin_reload_books" }
      ],
      [
        { text: "🏠 Quay Lại Bot", callback_data: "nav_main" }
      ]
    ]
  };
}

/**
 * Bàn phím quay lại menu admin
 */
function getAdminBackKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🔙 Quay Lại Bảng Admin", callback_data: "admin_dashboard" },
        { text: "🏠 Menu Chính", callback_data: "nav_main" }
      ]
    ]
  };
}

module.exports = {
  getAdminDashboardKeyboard,
  getAdminBackKeyboard
};
