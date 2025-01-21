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
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  address: { type: String, required: true },
  dob: { type: String, required: true },
  phone: { type: String, required: true },
  otp: { type: String }, // Field to store the OTP
});

const User = mongoose.model("User", userSchema);

module.exports = User;
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
app.post("/api/send-login-otp", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: "Email is required!" });
  }

  try {
    // Check if the user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found. Please register first." });
    }

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save the OTP to the user's record
    user.otp = otp; // Ensure the schema includes an `otp` field
    await user.save();

    // Send OTP via email
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
      text: `Dear User,\n\nYour OTP for login is ${otp}. It is valid for 10 minutes.\n\nThank you.`,
    };

    await transporter.sendMail(mailOptions);
    console.log("OTP sent to:", email, "OTP:", otp);

    res.status(200).json({ success: true, message: "Login OTP sent successfully!" });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ success: false, message: "Failed to send OTP. Please try again." });
  }
});

app.post("/api/verify-login-otp", async (req, res) => {
  const { email, otp } = req.body;

  console.log("Verify Login OTP request received:", { email, otp });

  if (!email || !otp) {
    console.log("Email or OTP missing in request.");
    return res.status(400).json({ success: false, message: "Email and OTP are required!" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.log("User not found for email:", email);
      return res.status(404).json({ success: false, message: "User not found." });
    }

    console.log("User found:", user);
    console.log("Provided OTP:", otp, "Saved OTP:", user.otp);

    if (String(user.otp) !== String(otp)) {
      console.log("OTP mismatch for email:", email);
      return res.status(400).json({ success: false, message: "Invalid OTP. Please try again." });
    }

    // Clear the OTP after successful verification
    user.otp = null;
    await user.save();

    console.log("OTP verified successfully for email:", email);
    res.status(200).json({ success: true, message: "Login successful!" });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ success: false, message: "An error occurred. Please try again." });
  }
});


// Serve the index.html file
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));