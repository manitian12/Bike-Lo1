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

// Database Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// User Schema and Model
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  address: { type: String, required: true },
  dob: { type: String, required: true },
  phone: { type: String, required: true },
  otp: { type: String }, // Field to store the OTP
  ip: { type: String },
  device: { type: String },
  browser: { type: String },
  os: { type: String },
});

const User = mongoose.model("User", userSchema);
app.get("/payment", (req, res) => {
  res.sendFile(path.join(__dirname, "payment.html"));
});

// Payment Schema
const PaymentSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  bike: String,
  price: Number,
  paymentMethod: String, // UPI, Cash on Delivery, etc.
  date: { type: Date, default: Date.now },
});

const Payment = mongoose.model("Payment", PaymentSchema);

const userOtp = {}; // Temporary storage for OTPs (can be replaced with Redis for scalability)

// Serve Static Files
app.use(express.static(path.join(__dirname)));

// **ROUTES**

// Send OTP for Signup
app.post("/send-otp", async (req, res) => {
  const { email, name, address, dob, phone } = req.body;

  if (!email || !name || !address || !dob || !phone) {
    return res.status(400).send("All fields are required!");
  }

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
    console.error("Error sending OTP:", error);
    res.status(500).send("Failed to send OTP");
  }
});

// Verify OTP for Signup
app.post("/verify-otp", async (req, res) => {
  const { email, otp, name, address, dob, phone } = req.body;

  if (userOtp[email] === otp) {
    const ip = req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    const deviceInfo = req.useragent;

    const newUser = new User({
      name,
      email,
      address,
      dob,
      phone,
      ip,
      device: deviceInfo.platform || "Unknown",
      browser: deviceInfo.browser || "Unknown",
      os: deviceInfo.os || "Unknown",
    });

    await newUser.save();
    delete userOtp[email]; // Remove OTP after verification
    return res.status(200).json({ success: true, redirect: "/page2.html" });
  }

  res.status(400).json({ success: false, message: "Invalid OTP. Please try again." });
});

// Send OTP for Login
app.post("/api/send-login-otp", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: "Email is required!" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found. Please register first." });
    }

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
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ success: false, message: "Failed to send OTP. Please try again." });
  }
});

// Verify OTP for Login
app.post("/api/verify-login-otp", async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user || user.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP. Please try again." });
    }

    user.otp = null; // Clear OTP after successful login
    await user.save();
    res.status(200).json({ success: true, redirect: "/page2.html" });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ success: false, message: "An error occurred. Please try again." });
  }
});

// Save Payment
app.post("/save-payment", async (req, res) => {
  const { name, email, phone, bike, price, paymentMethod } = req.body;

  if (!name || !email || !phone || !bike || !price) {
    return res.status(400).json({ success: false, message: "All payment details are required!" });
  }

  try {
    const payment = new Payment({
      name,
      email,
      phone,
      bike,
      price,
      paymentMethod, // e.g., "Cash on Delivery", "UPI", etc.
    });
    await payment.save();
    res.status(200).json({ success: true, message: "Payment saved successfully!" });
  } catch (error) {
    console.error("Error saving payment:", error);
    res.status(500).json({ success: false, message: "Failed to save payment." });
  }
});
app.get("/success", (req, res) => {
  res.sendFile(path.join(__dirname, "success.html"));
});


// Serve Static Pages
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start Server
const PORT = 5000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
