require("dotenv").config();
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = path.join(__dirname, "data.json");
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  name: "blue-shop.sid",
  secret: process.env.SESSION_SECRET || "development-only-change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, "public")));

function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return { products: [], orders: [], nextProductId: 1, nextOrderId: 1 }; }
}
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function adminOnly(req, res, next) {
  if (!req.session.isAdmin) return res.status(401).json({ error: "Admin login required." });
  next();
}
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype))
});

app.get("/api/products", (_req, res) => {
  const data = readData();
  res.json(data.products);
});

app.post("/api/orders", async (req, res) => {
  const { productId, quantity, customerName, phone, address, paymentNote } = req.body || {};
  const data = readData();
  const product = data.products.find(p => p.id === Number(productId));
  const qty = Number(quantity);
  if (!product) return res.status(404).json({ error: "Product not found." });
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) return res.status(400).json({ error: "Enter a quantity from 1 to 99." });
  if (![customerName, phone, address].every(v => typeof v === "string" && v.trim().length >= 2)) {
    return res.status(400).json({ error: "Please provide your name, phone number and delivery address." });
  }
  const order = {
    id: data.nextOrderId++,
    productId: product.id, productName: product.name, unitPrice: product.price,
    quantity: qty, total: product.price * qty,
    customerName: customerName.trim().slice(0,100), phone: phone.trim().slice(0,40),
    address: address.trim().slice(0,500), paymentNote: String(paymentNote || "").trim().slice(0,500),
    status: "Pending payment review", createdAt: new Date().toISOString()
  };
  data.orders.unshift(order);
  writeData(data);
  await notifyTelegram("🛍️ New order #" + order.id +
    "\nProduct: " + order.productName + "\nQuantity: " + qty +
    "\nTotal: " + order.total + " ETB\nCustomer: " + order.customerName +
    "\nPhone: " + order.phone + "\nAddress: " + order.address +
    "\nStatus: " + order.status);
  res.status(201).json({ message: "Order received. The shop will confirm payment before shipping.", orderId: order.id });
});

app.post("/api/admin/login", (req, res) => {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return res.status(503).json({ error: "Set ADMIN_PASSWORD in your .env file first." });
  if (typeof req.body.password !== "string" || req.body.password !== expected) {
    return res.status(401).json({ error: "Incorrect password." });
  }
  req.session.isAdmin = true;
  res.json({ message: "Logged in." });
});
app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ message: "Logged out." }));
});
app.get("/api/admin/orders", adminOnly, (_req, res) => res.json(readData().orders));
app.patch("/api/admin/orders/:id", adminOnly, (req, res) => {
  const allowed = ["Pending payment review", "Payment confirmed", "Shipped", "Delivered", "Cancelled"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid status." });
  const data = readData();
  const order = data.orders.find(o => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: "Order not found." });
  order.status = req.body.status;
  writeData(data);
  notifyTelegram("📦 Order #" + order.id + " status updated: " + order.status);
  res.json(order);
});
app.post("/api/admin/products", adminOnly, upload.single("image"), (req, res) => {
  const name = String(req.body.name || "").trim();
  const category = String(req.body.category || "").trim();
  const price = Number(req.body.price);
  const stock = Math.max(0, Math.floor(Number(req.body.stock || 0)));
  if (!name || !category || !Number.isFinite(price) || price < 0) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Name, category and a valid price are required." });
  }
  const data = readData();
  const product = {
    id: data.nextProductId++, name: name.slice(0,120), category: category.slice(0,60),
    price, stock, description: String(req.body.description || "").slice(0,500),
    image: req.file ? "/uploads/" + req.file.filename : String(req.body.imageUrl || "").trim()
  };
  data.products.unshift(product);
  writeData(data);
  res.status(201).json(product);
});
app.patch("/api/admin/products/:id", adminOnly, (req, res) => {
  const data = readData();
  const product = data.products.find(p => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: "Product not found." });
  if (req.body.name !== undefined) product.name = String(req.body.name).trim().slice(0,120);
  if (req.body.category !== undefined) product.category = String(req.body.category).trim().slice(0,60);
  if (req.body.price !== undefined) {
    const price = Number(req.body.price);
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: "Price must be zero or greater." });
    product.price = price;
  }
  if (req.body.stock !== undefined) product.stock = Math.max(0, Math.floor(Number(req.body.stock)));
  if (req.body.description !== undefined) product.description = String(req.body.description).slice(0,500);
  writeData(data);
  res.json(product);
});
app.delete("/api/admin/products/:id", adminOnly, (req, res) => {
  const data = readData();
  const before = data.products.length;
  data.products = data.products.filter(p => p.id !== Number(req.params.id));
  if (data.products.length === before) return res.status(404).json({ error: "Product not found." });
  writeData(data);
  res.json({ message: "Product deleted." });
});

async function notifyTelegram(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message })
    });
  } catch (err) { console.error("Telegram notification failed:", err.message); }
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.listen(PORT, "0.0.0.0", () => {
  console.log("Blue Shop running at http://127.0.0.1:" + PORT);
});
