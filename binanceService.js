const BinanceAPI = require('./binanceAPI');
const Binance = require('binance-api-node').default;
const Cryptr = require("cryptr");
const fs = require("fs");
require("dotenv").config();

class BinanceService {
  constructor() {
    this.API_BINANCE_PREFIX = process.env.API_BINANCE_PREFIX || "https://c2c-admin.binance.com";
    this.binance = new BinanceAPI(process.env.BINANCE_API_KEY, process.env.BINANCE_API_SECRET);
    this.client = Binance({
      apiKey: process.env.BINANCE_API_KEY,
      apiSecret: process.env.BINANCE_API_SECRET
    });
    this.cryptr = new Cryptr("myTotallySecretKey");
  }

  createCircuitBreaker(fn, threshold = 5, timeout = 60000) {
    let failureCount = 0;
    let lastFailureTime = null;

    return async (...args) => {
      if (failureCount >= threshold && Date.now() - lastFailureTime < timeout) {
        throw new Error('Circuit breaker: too many failures, blocking requests');
      }

      try {
        const result = await fn.apply(this, args);
        failureCount = 0;
        return result;
      } catch (error) {
        failureCount++;
        lastFailureTime = Date.now();
        throw error;
      }
    };
  }

  async getCurrentHeaders(referer) {
    if (fs.existsSync("token.txt")) {
      const encrypted = fs.readFileSync("token.txt");
      const headers = this.cryptr.decrypt(encrypted);
      const headersPost = JSON.parse(headers);
      headersPost["referer"] = referer;
      headersPost["accept-language"] = "en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7";
      headersPost["sec-fetch-dest"] = "empty";
      headersPost["sec-fetch-mode"] = "cors";
      headersPost["sec-fetch-site"] = "same-origin";
      return headersPost;
    } else if (process.env.API_BINANCE_KEY) {
      return { "x-mbx-apikey": process.env.API_BINANCE_KEY };
    } else {
      return {};
    }
  }

  async fetchP2PData(tradeType, proMerchantAds) {
    const data = await this.binance.searchAds('USDT', 'BRL', tradeType, 1, 15);
    return data;
  }

  async fetchMarketData() {
    const symbol = 'USDTBRL';
    try {
      const orderBook = await this.client.book({ symbol });
      const price = parseFloat(orderBook.asks[0].price);
      return { symbol, price };
    } catch (error) {
      console.error('Erro ao buscar dados de mercado:', error);
      return { symbol, price: null };
    }
  }

  async getOrderMatchListByMerchant() {
    try {
      const headersPost = await this.getCurrentHeaders("https://c2c-admin.binance.com/pt-BR/order/pending");
      const response = await fetch(`${this.API_BINANCE_PREFIX}/bapi/c2c/v1/private/c2c/order-match/getOrderMatchListByMerchant`, {
        method: "POST",
        headers: headersPost,
        body: JSON.stringify({page: 1, rows: 10, orderStatusList: ["1","2","3","5"]}),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}, message: ${data.message || 'Unknown error'}`);
      }
      
      if (!data.success) {
        throw new Error(data.message || 'API reported failure');
      }
      
      return data.data;
    } catch (error) {
      console.error(`Error in getOrderMatchListByMerchant: ${error.message}`);
      throw error;
    }
  }

  async confirmOrderPayed(orderNumber, bizno, challengeToken) {
    try {
      const headersPost = await this.getCurrentHeaders("https://c2c-admin.binance.com/pt-BR/order/pending");
      if (bizno && challengeToken) {
        headersPost["risk_challenge_biz_no"] = bizno;
        headersPost["risk_challenge_token"] = challengeToken;
      }
      const response = await fetch(`${this.API_BINANCE_PREFIX}/bapi/c2c/v1/private/c2c/order-match/confirm-order-payed`, {
        method: "post",
        headers: headersPost,
        body: JSON.stringify({orderNumber: orderNumber}),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to confirm order payment');
      }
      return response.headers.get("risk_challenge_biz_no");
    } catch (error) {
      console.error(`Error in confirmOrderPayed: ${error.message}`);
      throw error;
    }
  }

  async getSteps(bizno) {
    try {
      const headersPost = await this.getCurrentHeaders("https://c2c-admin.binance.com/pt-BR/order/pending");
      const response = await fetch(`${this.API_BINANCE_PREFIX}/bapi/accounts/v1/protect/risk/challenge/getSteps?bizNo=${bizno}`, {
        method: "GET",
        headers: headersPost,
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to get steps');
      }
      return data.data;
    } catch (error) {
      console.error(`Error in getSteps: ${error.message}`);
      throw error;
    }
  }

  async sendEmailVerifyCode(bizno) {
    try {
      const headersPost = await this.getCurrentHeaders("https://c2c-admin.binance.com/pt-BR/order/pending");
      const response = await fetch(`${this.API_BINANCE_PREFIX}/bapi/accounts/v2/protect/account/email/sendEmailVerifyCode`, {
        method: "post",
        headers: headersPost,
        body: JSON.stringify({
          bizScene: "C2C_RELEASE_CURRENCY",
          resend: false,
          bizNo: bizno,
        }),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to send email verification code');
      }
      return data.data;
    } catch (error) {
      console.error(`Error in sendEmailVerifyCode: ${error.message}`);
      throw error;
    }
  }

  async verifySingleFactor(bizno, verifyType, verifyCode) {
    try {
      const headersPost = await this.getCurrentHeaders("https://c2c-admin.binance.com/pt-BR/order/pending");
      const response = await fetch(`${this.API_BINANCE_PREFIX}/bapi/accounts/v1/private/risk/challenge/verifySingleFactor`, {
        method: "post",
        headers: headersPost,
        body: JSON.stringify({
          bizNo: bizno,
          bizType: "C2C_RELEASE_CURRENCY",
          verifyType: verifyType,
          verifyCode: verifyCode,
        }),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to verify single factor');
      }
      return data.data;
    } catch (error) {
      console.error(`Error in verifySingleFactor: ${error.message}`);
      throw error;
    }
  }

  async getChallengeToken(bizno) {
    try {
      const headersPost = await this.getCurrentHeaders("https://c2c-admin.binance.com/pt-BR/order/pending");
      const response = await fetch(`${this.API_BINANCE_PREFIX}/bapi/accounts/v1/private/risk/challenge/getChallengeToken?bizNo=${bizno}`, {
        method: "GET",
        headers: headersPost,
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to get challenge token');
      }
      return data.data.challengeToken;
    } catch (error) {
      console.error(`Error in getChallengeToken: ${error.message}`);
      throw error;
    }
  }
}

const binanceService = new BinanceService();

module.exports = {
  fetchP2PData: binanceService.createCircuitBreaker(binanceService.fetchP2PData.bind(binanceService)),
  fetchMarketData: binanceService.createCircuitBreaker(binanceService.fetchMarketData.bind(binanceService)),
  getOrderMatchListByMerchant: binanceService.getOrderMatchListByMerchant.bind(binanceService),
  confirmOrderPayed: binanceService.confirmOrderPayed.bind(binanceService),
  getSteps: binanceService.getSteps.bind(binanceService),
  sendEmailVerifyCode: binanceService.sendEmailVerifyCode.bind(binanceService),
  verifySingleFactor: binanceService.verifySingleFactor.bind(binanceService),
  getChallengeToken: binanceService.getChallengeToken.bind(binanceService),
};