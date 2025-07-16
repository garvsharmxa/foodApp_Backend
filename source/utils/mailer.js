import dotenv from 'dotenv';
dotenv.config();
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
    from: `"🍔 Food Delivery" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Your OTP: ${otp} - Food Delivery App`, // Include OTP in subject for mobile notifications
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="x-apple-disable-message-reformatting">
        <title>Your OTP Code</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
          
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #1a1a1a;
            background-color: #f8f9fa;
            margin: 0;
            padding: 20px;
            min-height: 100vh;
          }
          
          .email-container {
            max-width: 500px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            border: 1px solid #e9ecef;
          }
          
          .header {
            background: #ffffff;
            padding: 40px 30px 20px;
            text-align: center;
            border-bottom: 1px solid #f1f3f4;
          }
          
          .logo {
            font-size: 2.5em;
            margin-bottom: 12px;
            opacity: 0.9;
          }
          
          .header-title {
            color: #2c3e50;
            font-size: 1.5em;
            font-weight: 600;
            margin: 0;
            letter-spacing: -0.5px;
          }
          
          .content {
            padding: 40px 30px;
            background: #ffffff;
          }
          
          .greeting {
            font-size: 1.1em;
            color: #495057;
            margin-bottom: 20px;
            font-weight: 500;
          }
          
          .description {
            font-size: 1em;
            color: #6c757d;
            margin-bottom: 35px;
            line-height: 1.6;
          }
          
          .otp-section {
            background: #f8f9fa;
            border: 2px solid #e9ecef;
            border-radius: 12px;
            padding: 35px 25px;
            text-align: center;
            margin: 30px 0;
            position: relative;
          }
          
          .otp-label {
            color: #6c757d;
            font-size: 0.9em;
            font-weight: 500;
            margin-bottom: 15px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          
          .otp-code {
            background: #ffffff;
            color: #2c3e50;
            font-size: 2.5em;
            font-weight: 700;
            letter-spacing: 8px;
            padding: 18px 25px;
            border-radius: 8px;
            margin: 15px 0;
            display: inline-block;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            font-family: 'Courier New', monospace;
            border: 2px solid #e9ecef;
            transition: all 0.3s ease;
          }
          
          .otp-code:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(0,0,0,0.15);
          }
          
          .validity-info {
            color: #6c757d;
            font-size: 0.9em;
            margin-top: 15px;
            font-weight: 500;
          }
          
          .validity-time {
            background: #ffffff;
            padding: 6px 12px;
            border-radius: 20px;
            display: inline-block;
            margin-top: 8px;
            font-weight: 600;
            border: 1px solid #e9ecef;
            color: #495057;
          }
          
          .instructions {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin: 25px 0;
            border-left: 3px solid #6c757d;
          }
          
          .instructions h3 {
            color: #495057;
            margin-bottom: 12px;
            font-size: 1em;
            font-weight: 600;
          }
          
          .instructions ul {
            color: #6c757d;
            padding-left: 18px;
            line-height: 1.7;
            font-size: 0.95em;
          }
          
          .instructions li {
            margin-bottom: 6px;
          }
          
          .security-warning {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            color: #495057;
            padding: 20px;
            border-radius: 8px;
            margin: 25px 0;
            position: relative;
            border-left: 3px solid #6c757d;
          }
          
          .security-warning h3 {
            color: #495057;
            margin-bottom: 8px;
            font-weight: 600;
            font-size: 1em;
          }
          
          .security-warning p {
            font-size: 0.95em;
            line-height: 1.6;
            color: #6c757d;
          }
          
          .footer {
            background: #f8f9fa;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e9ecef;
          }
          
          .footer-content {
            max-width: 350px;
            margin: 0 auto;
          }
          
          .footer h3 {
            font-size: 1.1em;
            margin-bottom: 12px;
            font-weight: 600;
            color: #495057;
          }
          
          .footer p {
            color: #6c757d;
            line-height: 1.5;
            margin-bottom: 8px;
            font-size: 0.9em;
          }
          
          .divider {
            width: 60px;
            height: 2px;
            background: #e9ecef;
            margin: 20px auto;
            border-radius: 1px;
          }
          
          .brand-name {
            color: #495057;
            font-weight: 600;
            font-size: 0.9em;
            margin-top: 15px;
          }
          
          /* Mobile Responsive */
          @media screen and (max-width: 600px) {
            body {
              padding: 10px;
            }
            
            .email-container {
              margin: 0;
            }
            
            .content {
              padding: 30px 20px;
            }
            
            .header {
              padding: 30px 20px 15px;
            }
            
            .otp-section {
              padding: 25px 15px;
            }
            
            .otp-code {
              font-size: 2.2em;
              letter-spacing: 6px;
              padding: 15px 20px;
            }
            
            .logo {
              font-size: 2.2em;
            }
            
            .header-title {
              font-size: 1.3em;
            }
          }
          
          /* Dark mode support */
          @media (prefers-color-scheme: dark) {
            body {
              background-color: #1a1a1a;
            }
            
            .email-container {
              background: #2d2d2d;
              border: 1px solid #404040;
            }
            
            .header {
              background: #2d2d2d;
              border-bottom: 1px solid #404040;
            }
            
            .content {
              background: #2d2d2d;
            }
            
            .footer {
              background: #252525;
              border-top: 1px solid #404040;
            }
            
            .header-title {
              color: #ffffff;
            }
            
            .greeting {
              color: #e0e0e0;
            }
            
            .description {
              color: #b0b0b0;
            }
            
            .otp-section {
              background: #1a1a1a;
              border: 2px solid #404040;
            }
            
            .otp-code {
              background: #2d2d2d;
              color: #ffffff;
              border: 2px solid #404040;
            }
            
            .instructions {
              background: #1a1a1a;
              border-left: 3px solid #b0b0b0;
            }
            
            .security-warning {
              background: #1a1a1a;
              border: 1px solid #404040;
              border-left: 3px solid #b0b0b0;
            }
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <div class="logo">🍔</div>
            <h1 class="header-title">Food Delivery</h1>
          </div>
          
          <div class="content">
            <div class="greeting">Hello 👋</div>
            <div class="description">
              Please use the verification code below to complete your account verification.
            </div>
            
            <div class="otp-section">
              <div class="otp-label">Verification Code</div>
              <div class="otp-code">${otp}</div>
              <div class="validity-info">
                <div class="validity-time">⏰ Expires in 5 minutes</div>
              </div>
            </div>
            
            <div class="instructions">
              <h3>📱 How to use:</h3>
              <ul>
                <li>Copy and paste the code into the app</li>
                <li>Or type the 6-digit code manually</li>
                <li>Code expires in 5 minutes for security</li>
                <li>Request a new code if this one expires</li>
              </ul>
            </div>
            
            <div class="security-warning">
              <h3>🔐 Security Notice</h3>
              <p><strong>Keep this code private.</strong> Never share it with anyone. We'll never ask for your OTP via phone or email. If you didn't request this, please ignore this message.</p>
            </div>
          </div>
          
          <div class="footer">
            <div class="footer-content">
              <h3>Thank you for choosing us 🚀</h3>
              <div class="divider"></div>
              <p>This is an automated message, please don't reply.</p>
              <p>Need help? Contact our support team.</p>
              <div class="brand-name">Food Delivery App</div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
🍔 Food Delivery App - Your OTP Code

Hello!

Your verification code is: ${otp}

This code is valid for 5 minutes.

If you didn't request this code, please ignore this email.

Thank you for using Food Delivery App!
    ` // Plain text version for better compatibility
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