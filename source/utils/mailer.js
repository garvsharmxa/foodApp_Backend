import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS // Use App Password here
  }
});

export const sendOTP = async (email, otp) => {
  const mailOptions = {
    from: `"Food Delivery App" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Your OTP for Food Delivery App',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your OTP</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f4f4f4;
            margin: 0;
            padding: 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 2em;
            margin-bottom: 10px;
          }
          .title {
            color: #2c3e50;
            margin-bottom: 30px;
          }
          .otp-container {
            background: #f8f9fa;
            border: 2px dashed #007bff;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 20px 0;
          }
          .otp {
            font-size: 2em;
            font-weight: bold;
            color: #007bff;
            letter-spacing: 5px;
            margin: 10px 0;
          }
          .validity {
            color: #dc3545;
            font-weight: bold;
            margin: 15px 0;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            text-align: center;
            color: #666;
            font-size: 0.9em;
          }
          .warning {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            color: #856404;
            padding: 15px;
            border-radius: 5px;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🍔 Food Delivery App</div>
            <h1 class="title">Your One-Time Password (OTP)</h1>
          </div>
          
          <p>Hello,</p>
          <p>Use the following OTP to proceed with your request:</p>
          
          <div class="otp-container">
            <div class="otp">${otp}</div>
            <div class="validity">This OTP is valid for <strong>5 minutes</strong>.</div>
          </div>
          
          <div class="warning">
            <strong>Security Note:</strong> If you didn't request this OTP, please ignore this email and ensure your account is secure.
          </div>
          
          <div class="footer">
            <p>Thank you for using Food Delivery App 🚀</p>
            <p>This is an automated email, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log('OTP email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    console.error('Error sending OTP email:', error);
    throw error;
  }
};