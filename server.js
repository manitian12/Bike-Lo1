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
app.use(useragent.express());

let userOtp = {}; // Temporary storage for OTPs

// ✅ Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// ✅ User Schema and Model
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, required: true, unique: true },
  address: String,
  dob: String,
  phone: String,
  otp: String,
  ip: String,
  device: String,
  browser: String,
  os: String,
});
const User = mongoose.model("User", userSchema);

// ✅ Payment Schema
const PaymentSchema = new mongoose.Schema({
  email: String,
  bike: String,
  price: Number,
  paymentMethod: String,
  date: {
    type: String,
    default: () => new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), // Store in IST
  },
});
const Payment = mongoose.model("Payment", PaymentSchema);

// ✅ Serve Static Files
app.use(express.static(path.join(__dirname)));
// ✅ Serve Payment Page Correctly
app.get("/payment", (req, res) => {
  res.sendFile(path.join(__dirname, "payment.html")); // Ensure payment.html is inside the 'public' folder
});

// ✅ Routes

// ✅ Send OTP for Signup
app.post("/send-otp", async (req, res) => {
  const { email, name, address, dob, phone } = req.body;
  if (!email || !name || !address || !dob || !phone) return res.status(400).send("All fields are required!");

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
    text: `Dear ${name},\n\nYour BikeLo one-time password is ${otp}. It is valid for 10 minutes only.\n\nThank you.`,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).send("OTP sent successfully!");
  } catch (error) {
    res.status(500).send("Failed to send OTP");
  }
});

// ✅ Verify OTP for Signup
app.post("/verify-otp", async (req, res) => {
  const { email, otp, name, address, dob, phone } = req.body;

  if (userOtp[email] !== otp) {
    return res.status(400).json({ success: false, message: "Invalid OTP. Please try again." });
  }
// ✅ Extract user details from request
const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
const userAgent = req.useragent;

const newUser = new User({
  name,
  email,
  address,
  dob,
  phone,
  ip,
  device: userAgent.isMobile ? "Mobile" : "Desktop",
  browser: userAgent.browser,
  os: userAgent.os,
});

  await newUser.save();
  delete userOtp[email];

  console.log("✅ OTP Verified. Sending correct email:", email); // Debugging check
  res.status(200).json({ success: true, email: email, redirect: "/page2.html" });
});
// ✅ Send OTP for Login
app.post("/api/send-login-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: "Email is required!" });

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ success: false, message: "User not found. Please register first." });

  const otp = crypto.randomInt(100000, 999999).toString();
  user.otp = otp;
  await user.save();

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
    subject: "Your Login OTP",
    text: `Dear User,\n\nYour OTP for login is ${otp}. It is valid for 10 minutes.\n\nThank you, BikeLo Team.`,
  };

  await transporter.sendMail(mailOptions);
  res.status(200).json({ success: true, message: "OTP sent successfully!" });
});

// ✅ Verify OTP for Login
app.post("/api/verify-login-otp", async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user || user.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP. Please try again." });
    }

    // ✅ Update user details at login
    user.ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    user.device = req.useragent.isMobile ? "Mobile" : "Desktop";
    user.browser = req.useragent.browser;
    user.os = req.useragent.os;
    user.otp = null; // Clear OTP after login

    await user.save();

    console.log("✅ Login Success. Updated User:", user); // Debugging
    res.status(200).json({ success: true, email: email, redirect: "/page2.html" });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ success: false, message: "An error occurred. Please try again." });
  }
});
// ✅ Save Payment to MongoDB
app.post("/save-payment", async (req, res) => {
  const { email, bike, price, paymentMethod } = req.body;
  if (!email || !bike || !price || !paymentMethod) return res.status(400).json({ success: false, message: "All payment details are required!" });

  try {
    const payment = new Payment({
      email,
      bike,
      price,
      paymentMethod,
    });

    await payment.save();
    res.status(200).json({ success: true, message: "Payment saved successfully!" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to save payment." });
  }
});

// ✅ Serve Success Page
app.get("/success", (req, res) => res.sendFile(path.join(__dirname, "success.html")));

// ✅ Serve Static Pages
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// ✅ Start Server
const PORT = 5000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
