require("dotenv").config();
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

const mailOptions = {
  from: process.env.EMAIL,
  to: "recipient-email@example.com", // Replace with your email
  subject: "Test Email from BikeLo",
  text: "This is a test email to confirm the email setup is working.",
};

transporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    console.log("Error:", error);
  } else {
    console.log("Email sent:", info.response);
  }
});
