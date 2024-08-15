const playwright = require("playwright");
const Cryptr = require("cryptr");
const cryptr = new Cryptr("myTotallySecretKey");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function run() {
  const launchOptions = {
    headless: false,
    timeout: 60000,
    channel: "chrome",
    args: ["--start-maximized"],
    viewport: null,
  };
  const browser = await playwright["chromium"].launchPersistentContext(
    process.env.USERDATA,
    launchOptions
  );
  const page = await browser.newPage();
  await page.route(
    "https://c2c-admin.binance.com/bapi/accounts/v1/private/account/user/base-detail",
    async (route, request) => {
      var allHeaders = await request.allHeaders();
      const encryptedString = cryptr.encrypt(JSON.stringify(allHeaders));
      fs.writeFileSync("token.txt", encryptedString);
    }
  );
  await page.goto("https://c2c-admin.binance.com/pt-BR/order/pending");
  setInterval(async () => {
    await page.reload();
  }, 30 * 60 * 1000);
}
run();