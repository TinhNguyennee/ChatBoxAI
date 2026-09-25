/**
 * BỘ NHỚ ĐỆM IN-MEMORY CACHE (TỐC ĐỘ 0MS, CHỐNG DELAY, CHỊU TẢI CAO)
 */

const cache = {
  books: null,
  booksLastFetched: 0,
  booksTTL: 10 * 60 * 1000, // 10 phút tự làm mới

  vipSet: new Set(),
  vipLoaded: false,

  activeEvent: null,
  eventLoaded: false,

  expiredOrders: new Set() // Lưu tạm các mã đơn đã hết hạn gần đây để phản hồi ngay 0ms
};

/**
 * Quản lý Cache danh sách truyện
 */
function getCachedBooks() {
  if (cache.books && (Date.now() - cache.booksLastFetched < cache.booksTTL)) {
    return cache.books;
  }
  return null;
}

function setCachedBooks(books) {
  cache.books = books;
  cache.booksLastFetched = Date.now();
}

function clearBooksCache() {
  cache.books = null;
  cache.booksLastFetched = 0;
}

/**
 * Quản lý Cache Hội viên VIP
 */
function isCachedVIP(chatId) {
  if (!cache.vipLoaded) return null;
  return cache.vipSet.has(chatId.toString());
}

function addCachedVIP(chatId) {
  cache.vipSet.add(chatId.toString());
}

function removeCachedVIP(chatId) {
  cache.vipSet.delete(chatId.toString());
}

function setAllCachedVIPs(vipArray) {
  cache.vipSet = new Set(vipArray.map(id => id.toString()));
  cache.vipLoaded = true;
}

/**
 * Quản lý Cache Sự kiện khuyến mãi
 */
function getCachedEvent() {
  if (cache.eventLoaded) {
    return cache.activeEvent;
  }
  return undefined; // chưa load
}

function setCachedEvent(event) {
  cache.activeEvent = event;
  cache.eventLoaded = true;
}

function clearEventCache() {
  cache.eventLoaded = false;
  cache.activeEvent = null;
}

/**
 * Quản lý Cache đơn hàng đã hết hạn
 */
function markOrderAsExpiredInCache(orderId) {
  cache.expiredOrders.add(orderId);
  // Giữ tối đa 500 mã đơn gần nhất để không tốn RAM
  if (cache.expiredOrders.size > 500) {
    const firstItem = cache.expiredOrders.values().next().value;
    cache.expiredOrders.delete(firstItem);
  }
}

function isOrderExpiredInCache(orderId) {
  return cache.expiredOrders.has(orderId);
}

module.exports = {
  getCachedBooks,
  setCachedBooks,
  clearBooksCache,
  isCachedVIP,
  addCachedVIP,
  removeCachedVIP,
  setAllCachedVIPs,
  getCachedEvent,
  setCachedEvent,
  clearEventCache,
  markOrderAsExpiredInCache,
  isOrderExpiredInCache
};
