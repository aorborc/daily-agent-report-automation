const { Resend } = require('resend');
const resend = new Resend("re_8VXvL6zU_CvP9ncA5euZihFWACeGYj8NK");

const sendEmail = async (subject, htmlBody) => {
  try {
    const { data, error } = await resend.emails.send({
     from: "vijay@aorborc.com",
      to: ["jordan@aorborc.com","vijay@aorborc.com",],
      subject: subject,
      html: htmlBody,
    });

    if (error) {
      console.log(`❌ Failed to send email:`, error);
    } else {
      console.log(`📧 Email sent successfully: ${subject}`);
    }
  } catch (err) {
    console.log('❌ Email sending error:', err);
  }
};

module.exports = sendEmail;
