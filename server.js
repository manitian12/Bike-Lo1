require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const crypto = require("crypto");
const path = require("path");
const useragent = require("express-useragent");

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));
app.use(useragent.express()); // Middleware to get user agent info

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.log(err));

// User schema and model
const userSchema = new mongoose.Schema({
  name: String,
  address: String,
  dob: String,
  phone: String,
  email: String,
  ip: String,
  device: String,
  browser: String,
  os: String,
  verified: Boolean,
});

const User = mongoose.model("User", userSchema);

let userOtp = {};

// Send OTP
app.post("/send-otp", async (req, res) => {
  const { email, name, address, dob, phone } = req.body;

  if (!email) return res.status(400).send("Email is required!");
  if (!name || !address || !dob || !phone) return res.status(400).send("All fields are required!");

  const otp = crypto.randomInt(100000, 999999).toString();
  userOtp[email] = otp;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL,
      pass: process.env.PASSWORD,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL,
    to: email,
    subject: "Your BikeLo OTP",
    text: `Dear sir/madam,

Your BikeLo one-time password is ${otp}. It is valid for 10 minutes only.

Thank you.`,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).send("OTP sent successfully!");
  } catch (error) {
    res.status(500).send("Failed to send OTP");
  }
});

// Verify OTP and Save User Data
app.post("/verify-otp", async (req, res) => {
  const { email, otp, name, address, dob, phone } = req.body;

  if (userOtp[email] === otp) {
    const ip = req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    const deviceInfo = req.useragent;

    const newUser = new User({
      name,
      address,
      dob,
      phone,
      email,
      ip,
      device: deviceInfo.platform || "Unknown",
      browser: deviceInfo.browser || "Unknown",
      os: deviceInfo.os || "Unknown",
      verified: true,
    });

    await newUser.save();
    delete userOtp[email];
    return res.status(200).json({ success: true, redirect: "/page2.html" });
  }

  res.status(400).json({ success: false, message: "Invalid OTP. Please try again." });
});

// Serve the index.html file
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));