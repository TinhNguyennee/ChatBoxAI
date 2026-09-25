const QRCode = require('qrcode');
const { VietQr } = require('dynamic-vietqr');
const { BANK_ACCOUNT_NO, BANK_BIN } = require('../config/env');

/**
 * Sinh Buffer ảnh mã QR VietQR chuẩn nội bộ
 */
async function generateQRCodeBuffer(amount, description) {
  try {
    const vietqr = new VietQr(BANK_ACCOUNT_NO, BANK_BIN);
    const payload = vietqr.dynamicIBFTToAccount(
      amount.toString(),
      description
    );

    const qrBuffer = await QRCode.toBuffer(payload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 360,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    return qrBuffer;
  } catch (err) {
    console.error('❌ Lỗi tạo QR Code Buffer:', err.message);
    throw err;
  }
}

/**
 * Gửi ảnh QR Code tới Telegram user kèm chú thích (Hỗ trợ HTML mode an toàn)
 */
async function sendQRCode(bot, chatId, amount, content, caption, replyMarkup = null, parseMode = 'HTML') {
  try {
    const qrBuffer = await generateQRCodeBuffer(amount, content);
    const options = {
      caption,
      parse_mode: parseMode
    };
    if (replyMarkup) {
      options.reply_markup = replyMarkup;
    }
    const sentMsg = await bot.sendPhoto(chatId, qrBuffer, options);
    console.log(`✔ Đã gửi ảnh QR Code đơn [${content}] tới ChatID: ${chatId}`);
    return sentMsg;
  } catch (err) {
    console.error(`❌ Gửi QR thất bại tới ${chatId}:`, err.message);
    try {
      await bot.sendMessage(
        chatId,
        `⚠️ Đã xảy ra lỗi khi gửi mã QR đơn hàng. Vui lòng bấm vào giỏ hàng để tạo lại đơn nhé.`
      );
    } catch (e) {
      // ignore
    }
    return false;
  }
}

module.exports = {
  generateQRCodeBuffer,
  sendQRCode
};
