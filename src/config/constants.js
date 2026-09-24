module.exports = {
  // Phân trang danh sách truyện
  ITEMS_PER_PAGE: 5,
  
  // Số lượng truyện gửi kèm trong 1 tin nhắn link đọc
  ITEMS_PER_SEND_CHUNK: 3,
  
  // Thời gian hết hạn của đơn hàng (phút)
  ORDER_EXPIRATION_MINUTES: 15,
  
  // Chính sách chiết khấu mua nhiều truyện
  DISCOUNT_RULES: {
    MIN_AMOUNT_FOR_MULTI: 50000, // Từ 50.000đ trở lên
    BASE_MULTI_PERCENT: 5,       // Khởi điểm giảm 5%
    STEP_AMOUNT: 10000,          // Mỗi 10.000đ tăng thêm
    STEP_PERCENT: 1,             // Tăng thêm 1%
    MAX_MULTI_PERCENT: 39,       // Tối đa 39% cho mua nhiều
    VIP_PERCENT: 50,             // Giảm 50% cho VIP
    MAX_TOTAL_PERCENT: 75        // Tổng ưu đãi tối đa 75%
  },
  
  // Trạng thái đơn hàng
  ORDER_STATUS: {
    PENDING: 'PENDING',
    PAID: 'PAID',
    EXPIRED: 'EXPIRED',
    CANCELLED: 'CANCELLED'
  },
  
  // Loại đơn hàng
  ORDER_TYPE: {
    BOOKS: 'BOOKS',
    VIP: 'VIP'
  }
};
