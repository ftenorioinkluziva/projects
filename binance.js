const Cryptr = require("cryptr");
const cryptr = new Cryptr("myTotallySecretKey");
const fs = require("fs");
require("dotenv").config();

const API_BINANCE_PREFIX = process.env.API_BINANCE_PREFIX ? process.env.API_BINANCE_PREFIX : "order-match";

async function getCurrentHeaders(referer) {
  if (fs.existsSync("token.txt")) {
    const encrypted = fs.readFileSync("token.txt");
    const headers = cryptr.decrypt(encrypted);
    const headersPost = JSON.parse(headers);
    headersPost["referer"] = referer;
    headersPost["accept-language"] = "en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7";
    headersPost["sec-fetch-dest"] = "empty";
    headersPost["sec-fetch-mode"] = "cors";
    headersPost["sec-fetch-site"] = "same-origin";
    return headersPost;
  } else if (process.env.API_BINANCE_KEY) {
    const headersPost = {};
    headersPost["x-mbx-apikey"] = process.env.API_BINANCE_KEY;
    return headersPost;
  } else {
    return {};
  }
}

async function getOrderMatchListByMerchant() {
  return new Promise(async function (fulfill, reject) {
    try {
      const headersPost = await getCurrentHeaders("https://c2c-admin.binance.com/pt-BR/order/pending");
      const responseBinance = await fetch(`${API_BINANCE_PREFIX}/bapi/c2c/v1/private/c2c/order-match/getOrderMatchListByMerchant`, {
        method: "post",
        headers: headersPost,
        body: '{"page":1,"rows":10,"orderStatusList":["1","2","3","5"]}',
      });
      const responseBinanceJson = await responseBinance.json();
      if (responseBinanceJson.success) {
        fulfill(responseBinanceJson.data);
      } else {
        reject(responseBinanceJson.message);
      }
    } catch (e) {
      log.error(`Error at binance.getOrderMatchListByMerchant: ${e}`);
      reject(e)
    }
  });
}

async function confirmOrderPayed(orderNumber, bizno, challengeToken) {
  return new Promise(async function (fulfill, reject) {
    try {
      const headersPost = await getCurrentHeaders("https://c2c-admin.binance.com/pt-BR/order/pending");
      if (bizno && challengeToken) {
        headersPost["risk_challenge_biz_no"] = bizno;
        headersPost["risk_challenge_token"] = challengeToken;
      }
      const responseBinance = await fetch(`${API_BINANCE_PREFIX}/bapi/c2c/v1/private/c2c/order-match/confirm-order-payed`, {
        method: "post",
        headers: headersPost,
        body: JSON.stringify({orderNumber: orderNumber}),
      });
      const responseBinanceJson = await responseBinance.json();
      if (responseBinanceJson.success) {
        const bizno = responseBinance.headers.get("risk_challenge_biz_no");
        fulfill(bizno);
      } else {
        log.error(responseBinanceJson.message);
        reject(responseBinanceJson.message);
      }
    } catch (error) {
      log.error(error);
      reject(error);
    }
  });
}

async function getSteps(bizno) {
  return new Promise(async function (fulfill, reject) {
    const headersPost = await getCurrentHeaders("https://c2c-admin.binance.com/pt-BR/order/pending");
    const responseBinance = await fetch(`${API_BINANCE_PREFIX}/bapi/accounts/v1/protect/risk/challenge/getSteps?bizNo=${bizno}`, {
      method: "GET",
      headers: headersPost,
    });
    const responseBinanceJson = await responseBinance.json();
    if (responseBinanceJson.success) {
      fulfill(responseBinanceJson.data);
    } else {
      log.error(responseBinanceJson.message);
      reject(responseBinanceJson.message);
    }
  });
}

async function sendEmailVerifyCode(bizno) {
  return new Promise(async function (fulfill, reject) {
    const headersPost = await getCurrentHeaders("https://c2c-admin.binance.com/pt-BR/order/pending");
    const responseBinance = await fetch(`${API_BINANCE_PREFIX}/bapi/accounts/v2/protect/account/email/sendEmailVerifyCode`, {
      method: "post",
      headers: headersPost,
      body: JSON.stringify({
        bizScene: "C2C_RELEASE_CURRENCY",
        resend: false,
        bizNo: bizno,
      }),
    });
    const responseBinanceJson = await responseBinance.json();
    if (responseBinanceJson.success) {
      fulfill(responseBinanceJson.data);
    } else {
      log.error(responseBinanceJson.message);
      reject(responseBinanceJson.message);
    }
  });
}

async function verifySingleFactor(bizno, verifyType, verifyCode) {
  return new Promise(async function (fulfill, reject) {
    const headersPost = await getCurrentHeaders("https://c2c-admin.binance.com/pt-BR/order/pending");
    const responseBinance = await fetch(`${API_BINANCE_PREFIX}/bapi/accounts/v1/private/risk/challenge/verifySingleFactor`, {
      method: "post",
      headers: headersPost,
      body: JSON.stringify({
        bizNo: bizno,
        bizType: "C2C_RELEASE_CURRENCY",
        verifyType: verifyType,
        verifyCode: verifyCode,
      }),
    });
    const responseBinanceJson = await responseBinance.json();
    if (responseBinanceJson.success) {
      fulfill(responseBinanceJson.data);
    } else {
      log.error(responseBinanceJson.message);
      reject(responseBinanceJson.message);
    }
  });
}

async function getChallengeToken(bizno) {
  return new Promise(async function (fulfill, reject) {
    const headersPost = await getCurrentHeaders("https://c2c-admin.binance.com/pt-BR/order/pending");
    const responseBinance = await fetch(`${API_BINANCE_PREFIX}/bapi/accounts/v1/private/risk/challenge/getChallengeToken?bizNo=${bizno}`, {
      method: "GET",
      headers: headersPost,
    });
    const responseBinanceJson = await responseBinance.json();
    if (responseBinanceJson.success) {
      fulfill(responseBinanceJson.data.challengeToken);
    } else {
      log.error(responseBinanceJson.message);
      reject(responseBinanceJson.message);
    }
  });
}

exports.getOrderMatchListByMerchant = getOrderMatchListByMerchant;
exports.confirmOrderPayed = confirmOrderPayed;
exports.getSteps = getSteps;
exports.sendEmailVerifyCode = sendEmailVerifyCode;
exports.verifySingleFactor = verifySingleFactor;
exports.getChallengeToken = getChallengeToken;
