const { Resend } = require('resend');
const resend = new Resend("re_ZRQUM3xt_Gbv4ycEpHDSmWQQeFxF538vY");

const sendEmail = async (to, subject, htmlBody) => {
  try {
    const { error } = await resend.emails.send({
      from: "info@hiwmllc.com",
      to: Array.isArray(to) ? to : [to],
      subject,
      html: htmlBody,
    });

    if (error) {
      console.log(`❌ Failed to send email:`, error);
    } else {
      console.log(`📧 Email sent successfully: ${subject}`);
    }
  } catch (err) {
    console.log("❌ Email sending error:", err);
  }
};

module.exports = sendEmail;