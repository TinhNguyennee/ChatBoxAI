/**
 * Tạo bàn phím danh sách truyện (5 truyện/trang, mỗi truyện là 1 nút bấm)
 */
function getBookListKeyboard(booksChunk, currentPage, totalPages, cartCount = 0) {
  const keyboard = [];

  // 1. Mỗi truyện là một nút bấm chứa STT, Tên và Giá
  booksChunk.forEach((book) => {
    const priceText = book.free ? "🆓 Free" : `${(book.price / 1000).toFixed(0)}k`;
    // Rút gọn tên nếu quá dài để nút hiển thị đẹp trên điện thoại
    const displayName = book.name.length > 24 ? book.name.substring(0, 22) + '...' : book.name;
    keyboard.push([
      {
        text: `📖 #${book.id}. ${displayName} [${priceText}]`,
        callback_data: `book_detail:${book.id}:${currentPage}`
      }
    ]);
  });

  // 2. Hàng nút điều hướng phân trang
  if (totalPages > 1) {
    const navRow = [];
    // Nút về trang đầu
    navRow.push({
      text: currentPage === 1 ? '⏮️' : '⏪',
      callback_data: currentPage === 1 ? 'noop' : 'nav_list:1'
    });

    // Nút trang trước
    navRow.push({
      text: '◀️',
      callback_data: currentPage > 1 ? `nav_list:${currentPage - 1}` : 'noop'
    });

    // Nút hiển thị số trang hiện tại
    navRow.push({
      text: `【 ${currentPage}/${totalPages} 】`,
      callback_data: 'noop'
    });

    // Nút trang sau
    navRow.push({
      text: '▶️',
      callback_data: currentPage < totalPages ? `nav_list:${currentPage + 1}` : 'noop'
    });

    // Nút về trang cuối
    navRow.push({
      text: currentPage === totalPages ? '⏭️' : '⏩',
      callback_data: currentPage === totalPages ? 'noop' : `nav_list:${totalPages}`
    });

    keyboard.push(navRow);
  }

  // 3. Hàng nút Giỏ hàng và Menu chính
  keyboard.push([
    { text: `🛒 Giỏ Hàng (${cartCount})`, callback_data: "view_cart" },
    { text: "🏠 Menu Chính", callback_data: "nav_main" }
  ]);

  return { inline_keyboard: keyboard };
}

/**
 * Bàn phím xem chi tiết truyện
 */
function getBookDetailKeyboard(book, inCart, isOwned, fromPage = 1, cartCount = 0) {
  const keyboard = [];

  // Nếu là truyện miễn phí: có nút đọc ngay
  if (book.free) {
    keyboard.push([
      { text: "📖 Đọc Ngay (Miễn Phí)", callback_data: `read_free:${book.id}` }
    ]);
  } 
  // Nếu người dùng đã mua cuốn này rồi: cho đọc lại
  else if (isOwned) {
    keyboard.push([
      { text: "📖 Mở Đọc Truyện Đã Mua", callback_data: `read_owned:${book.id}` }
    ]);
  } 
  // Nếu là truyện trả phí và chưa mua: nút thêm / bỏ khỏi giỏ hàng
  else {
    if (inCart) {
      keyboard.push([
        { text: "➖ Xóa Khỏi Giỏ Hàng", callback_data: `cart_remove:${book.id}:${fromPage}` }
      ]);
    } else {
      keyboard.push([
        { text: "➕ Thêm Vào Giỏ Hàng", callback_data: `cart_add:${book.id}:${fromPage}` }
      ]);
    }
  }

  // Hàng nút điều hướng xem giỏ và quay lại danh sách
  keyboard.push([
    { text: `🛒 Giỏ Hàng (${cartCount})`, callback_data: "view_cart" },
    { text: "🔙 Quay Lại Danh Sách", callback_data: `nav_list:${fromPage}` }
  ]);

  keyboard.push([
    { text: "🏠 Menu Chính", callback_data: "nav_main" }
  ]);

  return { inline_keyboard: keyboard };
}

module.exports = {
  getBookListKeyboard,
  getBookDetailKeyboard
};
