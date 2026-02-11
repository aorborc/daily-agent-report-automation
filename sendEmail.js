const { Resend } = require('resend');
const resend = new Resend("re_ZRQUM3xt_Gbv4ycEpHDSmWQQeFxF538vY");

const sendEmail = async (to, subject, htmlBody, logger) => {
  const logInfo = (message) => {
    if (logger && typeof logger.info === "function") {
      logger.info(message);
      return;
    }
    console.log(message);
  };

  const logError = (message, err) => {
    if (logger && typeof logger.error === "function") {
      logger.error(message);
      return;
    }
    console.log(message, err || "");
  };

  try {
    const { error } = await resend.emails.send({
      from: "info@hiwmllc.com",
      to: "jordan@aorborc.com",
      bcc: ["alvin@healthiswealthmarketingllc.com", "vijay@aorborc.com"],
      subject,
      html: htmlBody,
    });

    if (error) {
      logError(`❌ Failed to send email:`, error);
      throw error;
    }
    logInfo(`📧 Email sent successfully: ${subject}`);
  } catch (err) {
    logError("❌ Email sending error:", err);
    throw err;
  }
};

module.exports = sendEmail;
